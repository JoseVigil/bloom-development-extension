#include <iostream>
#include <vector>
#include <string>
#include <thread>
#include <mutex>
#include <atomic>
#include <chrono>
#include <queue>
#include <condition_variable>
#include <nlohmann/json.hpp>

#include "synapse_logger.h"
#include "chunked_buffer.h"
#include "platform_utils.h"

using json = nlohmann::json;

// ============================================================================
// CONSTANTES GLOBALES
// ============================================================================

const std::string VERSION = "2.0.0";
const int BUILD = 20;
const int SERVICE_PORT = 5678;
const size_t MAX_MESSAGE_SIZE = 50 * 1024 * 1024;
const int RECONNECT_DELAY_MS = 2000;
const size_t MAX_QUEUED_MESSAGES = 100;

// ============================================================================
// ESTADO GLOBAL
// ============================================================================

std::atomic<socket_t> service_socket{INVALID_SOCK};
std::mutex stdout_mutex;
std::atomic<bool> shutdown_requested{false};
std::atomic<bool> identity_resolved{false};

std::string g_profile_id = "";
std::string g_launch_id = "";
std::mutex g_identity_mutex;
std::condition_variable g_identity_cv;

std::queue<std::string> g_pending_messages;
std::mutex g_pending_mutex;

SynapseLogManager g_logger;
ChunkedMessageBuffer g_chunked_buffer;

// ============================================================================
// FUNCIONES DE COMUNICACIÓN
// ============================================================================

void write_message_to_chrome(const std::string& s) {
    std::lock_guard<std::mutex> lock(stdout_mutex);
    uint32_t len = static_cast<uint32_t>(s.size());
    
    std::cout.write(reinterpret_cast<const char*>(&len), 4);
    std::cout.write(s.c_str(), len);
    std::cout.flush();
}

void write_to_service(const std::string& s) {
    socket_t sock = service_socket.load();
    if (sock != INVALID_SOCK) {
        uint32_t len = static_cast<uint32_t>(s.size());
        uint32_t net_len = htonl(len);
        
        send(sock, (const char*)&net_len, 4, 0);
        send(sock, s.c_str(), len, 0);
    }
}

// ============================================================================
// EXTRACCIÓN DE IDENTIDAD (LATE BINDING)
// ============================================================================

bool try_extract_profile_id_from_raw(const std::string& msg_str) {
    size_t pos = msg_str.find("\"profile_id\"");
    if (pos == std::string::npos) return false;
    
    size_t start = msg_str.find("\"", pos + 13);
    if (start == std::string::npos) return false;
    start++;
    
    size_t end = msg_str.find("\"", start);
    if (end == std::string::npos) return false;
    
    std::string candidate = msg_str.substr(start, end - start);
    
    if (candidate.length() == 36 && 
        candidate[8] == '-' && candidate[13] == '-' &&
        candidate[18] == '-' && candidate[23] == '-') {
        
        std::lock_guard<std::mutex> lock(g_identity_mutex);
        if (!identity_resolved.load()) {
            g_profile_id = candidate;
            g_logger.initialize_with_profile_id(candidate);
            
            std::cerr << "[IDENTITY_EXTRACT_RAW] profile=" << candidate << std::endl;
            
            // NO marcar como resuelto todavía - esperamos launch_id
            return true;
        }
    }
    
    return false;
}

bool try_extract_identity(const json& msg) {
    std::vector<std::string> profile_paths = {"/payload/profile_id", "/profile_id"};
    std::vector<std::string> launch_paths = {"/payload/launch_id", "/launch_id"};
    
    std::string candidate_profile;
    std::string candidate_launch;
    
    for (const auto& path : profile_paths) {
        try {
            auto ptr = msg.at(json::json_pointer(path));
            if (ptr.is_string()) {
                candidate_profile = ptr.get<std::string>();
                break;
            }
        } catch (...) { continue; }
    }
    
    for (const auto& path : launch_paths) {
        try {
            auto ptr = msg.at(json::json_pointer(path));
            if (ptr.is_string()) {
                candidate_launch = ptr.get<std::string>();
                break;
            }
        } catch (...) { continue; }
    }
    
    // ✅ VALIDACIÓN CRÍTICA: Solo marcar como resuelto si tenemos AMBOS
    if (!candidate_profile.empty() && !candidate_launch.empty()) {
        std::lock_guard<std::mutex> lock(g_identity_mutex);
        if (!identity_resolved.load()) {
            g_profile_id = candidate_profile;
            g_launch_id = candidate_launch;
            
            std::cerr << "[IDENTITY_EXTRACT] profile=" << candidate_profile 
                      << " launch=" << candidate_launch << std::endl;
            
            g_logger.initialize_with_profile_id(candidate_profile);
            g_logger.initialize_with_launch_id(candidate_launch);
            
            // ✅ AHORA SÍ: Marcar como resuelto
            identity_resolved.store(true);
            g_identity_cv.notify_all();
            
            if (g_logger.is_ready()) {
                g_logger.log_native("INFO", "LATE_BINDING_SUCCESS ProfileID=" + 
                    candidate_profile + " LaunchID=" + candidate_launch);
            }
            
            return true;
        }
    }
    
    return false;
}

// ============================================================================
// MANEJO DE MENSAJES DESDE CHROME
// ============================================================================

void flush_pending_messages() {
    std::lock_guard<std::mutex> lock(g_pending_mutex);
    
    size_t count = g_pending_messages.size();
    if (count > 0 && g_logger.is_ready()) {
        g_logger.log_native("INFO", "FLUSH_START Count=" + std::to_string(count));
    }
    
    while (!g_pending_messages.empty()) {
        std::string msg = g_pending_messages.front();
        g_pending_messages.pop();
        write_to_service(msg);
    }
    
    if (count > 0 && g_logger.is_ready()) {
        g_logger.log_native("INFO", "FLUSH_COMPLETE");
    }
}

void handle_chrome_message(const std::string& msg_str) {
    // PASO 1: Intentar extraer profile_id del string RAW
    try_extract_profile_id_from_raw(msg_str);
    
    // PASO 2: Parse JSON con tolerancia a errores
    json msg;
    try {
        msg = json::parse(msg_str);
    } catch (const std::exception& e) {
        if (g_logger.is_ready()) {
            g_logger.log_native("ERROR", "JSON_PARSE_ERROR: " + std::string(e.what()));
        }
        return;
    }
    
    // PASO 3: Procesar chunks si es un mensaje fragmentado
    if (msg.contains("bloom_chunk")) {
        std::string assembled;
        auto res = g_chunked_buffer.process_chunk(msg, assembled);
        if (res == ChunkedMessageBuffer::COMPLETE_VALID) {
            handle_chrome_message(assembled);
        }
        return;
    }
    
    // PASO 4: Intentar extraer identidad completa del JSON
    try_extract_identity(msg);
    
    // PASO 5: Validar tipo de mensaje
    std::string msg_type = "unknown_technical";
    
    if (msg.contains("type")) {
        if (msg["type"].is_string()) {
            msg_type = msg["type"].get<std::string>();
        } else if (msg["type"].is_number()) {
            // Chromium envía números como type en mensajes técnicos
            return; // Ignorar silenciosamente
        } else {
            if (g_logger.is_ready()) {
                g_logger.log_native("WARN", "MESSAGE_TYPE_UNKNOWN");
            }
            return;
        }
    }
    
    if (msg_type == "unknown_technical") {
        return;
    }
    
    // PASO 6: Manejo de mensajes especiales
    if (msg_type == "LOG") {
        std::string level = msg.value("level", "INFO");
        std::string message = msg.value("message", "");
        std::string timestamp = msg.value("timestamp", "");
        
        if (g_logger.is_ready()) {
            g_logger.log_browser(level, message, timestamp);
        }
        return;
    }
    
    if (msg_type == "SYSTEM_HELLO") {
        std::string final_id;
        {
            std::lock_guard<std::mutex> lock(g_identity_mutex);
            final_id = identity_resolved.load() ? g_profile_id : "unknown_worker";
        }
        
        json ready = {
            {"type", "SYSTEM_ACK"},
            {"command", "system_ready"},
            {"payload", {
                {"status", "connected"},
                {"host_version", VERSION},
                {"profile_id", final_id},
                {"identity_method", identity_resolved.load() ? "late_binding" : "fallback"}
            }}
        };
        
        write_message_to_chrome(ready.dump());
        
        if (g_logger.is_ready()) {
            g_logger.log_native("INFO", "SYSTEM_ACK_SENT ProfileID=" + final_id);
        }
        return;
    }
    
    // PASO 7: Enrutamiento al servicio TCP
    if (service_socket.load() != INVALID_SOCK && identity_resolved.load()) {
        write_to_service(msg_str);
        if (g_logger.is_ready()) {
            g_logger.log_native("DEBUG", "MSG_FORWARDED Type=" + msg_type);
        }
    } else {
        std::lock_guard<std::mutex> lock(g_pending_mutex);
        if (g_pending_messages.size() < MAX_QUEUED_MESSAGES) {
            g_pending_messages.push(msg_str);
        }
    }
}

// ============================================================================
// CLIENTE TCP
// ============================================================================

void tcp_client_loop() {
    std::unique_lock<std::mutex> id_lock(g_identity_mutex);
    
    std::cerr << "[TCP_THREAD] Waiting for identity resolution..." << std::endl;
    
    g_identity_cv.wait(id_lock, []{ 
        return identity_resolved.load() || shutdown_requested.load(); 
    });
    
    if (shutdown_requested.load()) {
        std::cerr << "[TCP_THREAD] Abort - shutdown requested" << std::endl;
        return;
    }
    
    std::string worker_id = g_profile_id;
    std::string launch_id = g_launch_id;
    id_lock.unlock();

    // ✅ VALIDACIÓN CRÍTICA: Verificar que launch_id no esté vacío
    if (launch_id.empty() || launch_id == "unknown") {
        std::cerr << "[TCP_THREAD] CRITICAL - launch_id is empty!" << std::endl;
        
        if (g_logger.is_ready()) {
            g_logger.log_native("CRITICAL", "TCP_ABORT launch_id empty. ProfileID=" + worker_id);
        }
        
        // Esperar 2 segundos por si acaso llega tarde
        std::this_thread::sleep_for(std::chrono::milliseconds(2000));
        
        id_lock.lock();
        launch_id = g_launch_id;
        id_lock.unlock();
        
        if (launch_id.empty() || launch_id == "unknown") {
            std::cerr << "[TCP_THREAD] FATAL - launch_id still empty after retry" << std::endl;
            return; // ⛔ ABORTAR - no conectar sin launch_id
        }
    }

    if (g_logger.is_ready()) {
        g_logger.log_native("INFO", "TCP_IDENTITY_VALIDATED ProfileID=" + 
                           worker_id + " LaunchID=" + launch_id);
    }
    
    std::cerr << "[TCP_THREAD] Identity validated: " << worker_id 
              << " / " << launch_id << std::endl;
    
    // Bucle de reconexión
    while (!shutdown_requested.load()) {
        socket_t sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock == INVALID_SOCK) {
            std::this_thread::sleep_for(std::chrono::milliseconds(RECONNECT_DELAY_MS));
            continue;
        }

        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(SERVICE_PORT);
        addr.sin_addr.s_addr = inet_addr("127.0.0.1");

        if (g_logger.is_ready()) {
            g_logger.log_native("INFO", "TCP_CONNECTING Port=" + std::to_string(SERVICE_PORT));
        }

        if (connect(sock, (sockaddr*)&addr, sizeof(addr)) < 0) {
            close_socket(sock);
            if (g_logger.is_ready()) {
                g_logger.log_native("WARN", "TCP_CONNECT_FAILED Retry in " + 
                                   std::to_string(RECONNECT_DELAY_MS) + "ms");
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(RECONNECT_DELAY_MS));
            continue;
        }

#ifdef _WIN32
        DWORD timeout = 1000;
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, (const char*)&timeout, sizeof(timeout));
#else
        struct timeval tv;
        tv.tv_sec = 1;
        tv.tv_usec = 0;
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
#endif
        
        if (g_logger.is_ready()) {
            g_logger.log_native("INFO", "TCP_CONNECTED Socket=" + std::to_string(sock));
        }
        
        service_socket.store(sock);

        // ✅ REGISTRO CON VALIDACIÓN DE CAMPOS
        json reg = {
            {"type", "REGISTER_HOST"},
            {"pid", PlatformUtils::get_current_pid()},
            {"profile_id", worker_id},
            {"launch_id", launch_id},
            {"version", VERSION},
            {"build", BUILD}
        };
        
        std::string reg_payload = reg.dump();
        
        // ✅ LOG DE DIAGNÓSTICO
        std::cerr << "[TCP_REGISTER] Payload: " << reg_payload << std::endl;
        
        if (g_logger.is_ready()) {
            g_logger.log_native("INFO", "TCP_REGISTERING Payload=" + reg_payload);
        }
        
        write_to_service(reg_payload);

        flush_pending_messages();

        // Bucle de recepción
        while (!shutdown_requested.load()) {
            uint32_t net_len;
            int received = recv(sock, (char*)&net_len, 4, 0);
            
            if (received <= 0) {
                if (shutdown_requested.load()) break;
#ifdef _WIN32
                if (WSAGetLastError() == WSAETIMEDOUT) continue;
#else
                if (errno == EAGAIN || errno == EWOULDBLOCK) continue;
#endif
                if (g_logger.is_ready()) {
                    g_logger.log_native("ERROR", "TCP_RECV_FAILED");
                }
                break;
            }
            
            uint32_t len = ntohl(net_len);
            if (len == 0 || len > MAX_MESSAGE_SIZE) {
                if (g_logger.is_ready()) {
                    g_logger.log_native("ERROR", "TCP_INVALID_LENGTH=" + std::to_string(len));
                }
                break;
            }
            
            std::vector<char> buf(len);
            int rec = 0;
            while (rec < (int)len) {
                int r = recv(sock, buf.data() + rec, len - rec, 0);
                if (r <= 0) break;
                rec += r;
            }
            
            if (rec == (int)len) {
                std::string b_msg(buf.begin(), buf.end());
                write_message_to_chrome(b_msg);
            }
        }
        
        service_socket.store(INVALID_SOCK);
        close_socket(sock);
        
        if (g_logger.is_ready()) {
            g_logger.log_native("WARN", "TCP_DISCONNECTED Reconnecting");
        }
    }
}

// ============================================================================
// MAIN
// ============================================================================

int main(int argc, char* argv[]) {
    PlatformUtils::initialize_networking();
    PlatformUtils::setup_binary_io();
    
    // ✅ INTENTAR CAPTURAR ARGS DE CLI (puede fallar por bug de Chrome)
    std::string cli_profile_id = PlatformUtils::get_cli_argument(argc, argv, "--profile-id");
    std::string cli_launch_id = PlatformUtils::get_cli_argument(argc, argv, "--launch-id");
    
    std::cerr << "[HOST] Startup - CLI args: profile=" << cli_profile_id 
              << " launch=" << cli_launch_id << std::endl;
    
    // Si llegaron por CLI, usarlos inmediatamente
    if (!cli_profile_id.empty() && !cli_launch_id.empty()) {
        std::lock_guard<std::mutex> lock(g_identity_mutex);
        g_profile_id = cli_profile_id;
        g_launch_id = cli_launch_id;
        
        g_logger.initialize_with_profile_id(cli_profile_id);
        g_logger.initialize_with_launch_id(cli_launch_id);
        
        identity_resolved.store(true);
        g_identity_cv.notify_all();
        
        std::cerr << "[HOST] Identity from CLI arguments" << std::endl;
    } else {
        std::cerr << "[HOST] CLI args missing - waiting for SYSTEM_HELLO" << std::endl;
    }

    std::thread tcp_thread(tcp_client_loop);

    // Bucle principal stdin
    while (!shutdown_requested.load()) {
        uint32_t len = 0;
        
        if (!std::cin.read(reinterpret_cast<char*>(&len), 4)) {
            if (g_logger.is_ready()) {
                g_logger.log_native("INFO", "STDIN_EOF");
            }
            break;
        }
        
        if (len == 0 || len > MAX_MESSAGE_SIZE) {
            if (g_logger.is_ready()) {
                g_logger.log_native("ERROR", "STDIN_INVALID_LENGTH=" + std::to_string(len));
            }
            continue;
        }
        
        std::vector<char> buf(len);
        if (!std::cin.read(buf.data(), len)) {
            if (g_logger.is_ready()) {
                g_logger.log_native("ERROR", "STDIN_READ_INCOMPLETE");
            }
            break;
        }
        
        std::string msg_str(buf.begin(), buf.end());
        handle_chrome_message(msg_str);
    }

    shutdown_requested.store(true);
    g_identity_cv.notify_all();
    
    if (g_logger.is_ready()) {
        g_logger.log_native("INFO", "SHUTDOWN");
    }
    
    socket_t sock = service_socket.load();
    if (sock != INVALID_SOCK) {
        service_socket.store(INVALID_SOCK);
        close_socket(sock);
    }
    
    if (tcp_thread.joinable()) tcp_thread.join();

    PlatformUtils::cleanup_networking();
    
    return 0;
}