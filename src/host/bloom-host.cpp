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
// CONSTANTES GLOBALES - SYNAPSE PROTOCOL
// ============================================================================

const std::string VERSION = "2.1.0";
const int BUILD = 22;
const int SERVICE_PORT = 5678;
const size_t MAX_MESSAGE_SIZE = 50 * 1024 * 1024;
const size_t MAX_CHROME_MSG_SIZE = 1020000; // 🔒 MURO DE 1MB (con margen de seguridad)
const int RECONNECT_DELAY_MS = 500;
const size_t MAX_QUEUED_MESSAGES = 500;
const int MAX_IDENTITY_WAIT_MS = 10000;
const int HEARTBEAT_INTERVAL_SEC = 10;

// ============================================================================
// HANDSHAKE DE 3 FASES
// ============================================================================

enum HandshakeState {
    HANDSHAKE_NONE,           // Sin comunicación
    HANDSHAKE_EXTENSION_READY, // Fase 1: Extension envió extension_ready
    HANDSHAKE_HOST_READY,      // Fase 2: Host respondió host_ready
    HANDSHAKE_CONFIRMED        // Fase 3: Brain notificado de PROFILE_CONNECTED
};

std::atomic<HandshakeState> g_handshake_state{HANDSHAKE_NONE};
std::mutex g_handshake_mutex;

// ============================================================================
// ESTADO GLOBAL
// ============================================================================

std::atomic<socket_t> service_socket{INVALID_SOCK};
std::mutex stdout_mutex;
std::atomic<bool> shutdown_requested{false};
std::atomic<bool> identity_resolved{false};

std::string g_profile_id = "";
std::string g_launch_id = "";
std::string g_extension_id = "";
std::mutex g_identity_mutex;
std::condition_variable g_identity_cv;

std::queue<std::string> g_pending_messages;
std::mutex g_pending_mutex;

SynapseLogManager g_logger;
ChunkedMessageBuffer g_chunked_buffer;

std::atomic<uint64_t> g_heartbeat_count{0};
std::atomic<uint64_t> g_messages_sent{0};
std::atomic<uint64_t> g_messages_received{0};

// ============================================================================
// HELPERS SEGUROS PARA JSON
// ============================================================================

std::string json_get_string_safe(const json& j, const std::string& key, const std::string& fallback = "") {
    try {
        if (!j.contains(key)) return fallback;
        
        const auto& val = j[key];
        
        if (val.is_string()) {
            return val.get<std::string>();
        } else if (val.is_number_integer()) {
            return std::to_string(val.get<int64_t>());
        } else if (val.is_number_float()) {
            return std::to_string(val.get<double>());
        } else if (val.is_boolean()) {
            return val.get<bool>() ? "true" : "false";
        }
        
        return fallback;
    } catch (const std::exception& e) {
        std::cerr << "[JSON_SAFE] Error extracting '" << key << "': " << e.what() << std::endl;
        return fallback;
    }
}

std::string json_value_to_string(const json& val) {
    try {
        if (val.is_string()) return val.get<std::string>();
        if (val.is_number_integer()) return std::to_string(val.get<int64_t>());
        if (val.is_number_float()) return std::to_string(val.get<double>());
        if (val.is_boolean()) return val.get<bool>() ? "true" : "false";
        if (val.is_null()) return "";
        return val.dump();
    } catch (...) {
        return "";
    }
}

uint64_t get_timestamp_ms() {
    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch());
    return static_cast<uint64_t>(ms.count());
}

// ============================================================================
// FUNCIONES DE COMUNICACIÓN - CON VALIDACIÓN DE TAMAÑO
// ============================================================================

// Forward declaration
void write_to_service(const std::string& s);

void write_message_to_chrome(const std::string& s) {
    try {
        std::lock_guard<std::mutex> lock(stdout_mutex);
        uint32_t len = static_cast<uint32_t>(s.size());
        
        // 🔒 VALIDACIÓN DEL MURO DE 1MB
        if (len > MAX_CHROME_MSG_SIZE) {
            std::cerr << "[WRITE_CHROME] ✗ MENSAJE DEMASIADO GRANDE: " << len 
                      << " bytes (límite: " << MAX_CHROME_MSG_SIZE << ")" << std::endl;
            
            // Emitir error hacia el Brain vía TCP
            json error_msg;
            error_msg["type"] = "EXTENSION_ERROR";
            error_msg["payload"]["code"] = "MSG_TOO_BIG";
            error_msg["payload"]["size"] = len;
            error_msg["payload"]["max_allowed"] = MAX_CHROME_MSG_SIZE;
            error_msg["timestamp"] = get_timestamp_ms();
            
            std::string error_str = error_msg.dump();
            write_to_service(error_str);
            
            if (g_logger.is_ready()) {
                g_logger.log_native("ERROR", "MSG_TOO_BIG Size=" + std::to_string(len));
            }
            
            return; // ⚠️ ABORTAR envío
        }
        
        std::cerr << "[WRITE_CHROME] Size=" << len << " bytes" << std::endl;
        
        // Little Endian para Chrome
        std::cout.write(reinterpret_cast<const char*>(&len), 4);
        std::cout.write(s.c_str(), len);
        std::cout.flush();
        
        g_messages_sent.fetch_add(1);
        
        std::cerr << "[WRITE_CHROME] ✓ Success - Total sent: " << g_messages_sent.load() << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "[WRITE_CHROME] ✗ Exception: " << e.what() << std::endl;
    }
}

void write_to_service(const std::string& s) {
    try {
        socket_t sock = service_socket.load();
        if (sock != INVALID_SOCK) {
            uint32_t len = static_cast<uint32_t>(s.size());
            uint32_t net_len = htonl(len); // Big Endian para Brain
            
            std::cerr << "[WRITE_SERVICE] Socket=" << sock << " Size=" << len << " bytes" << std::endl;
            
            send(sock, (const char*)&net_len, 4, 0);
            send(sock, s.c_str(), len, 0);
            
            std::cerr << "[WRITE_SERVICE] ✓ Sent successfully" << std::endl;
        } else {
            std::cerr << "[WRITE_SERVICE] ✗ No active socket - message queued" << std::endl;
        }
    } catch (const std::exception& e) {
        std::cerr << "[WRITE_SERVICE] ✗ Exception: " << e.what() << std::endl;
    }
}

// ============================================================================
// EXTRACCIÓN DE IDENTIDAD (LATE BINDING)
// ============================================================================

bool try_extract_profile_id_from_raw(const std::string& msg_str) {
    try {
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
            if (g_profile_id.empty()) {
                g_profile_id = candidate;
                g_logger.initialize_with_profile_id(candidate);
                
                std::cerr << "[IDENTITY_EXTRACT_RAW] ✓ profile=" << candidate << std::endl;
                return true;
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "[EXTRACT_RAW] ✗ Exception: " << e.what() << std::endl;
    }
    
    return false;
}

bool try_extract_identity(const json& msg) {
    try {
        if (!msg.contains("type")) return false;
        
        std::string type = json_get_string_safe(msg, "type");
        if (type != "SYSTEM_HELLO") return false;
        
        if (!msg.contains("payload")) return false;
        
        const json& payload = msg["payload"];
        
        std::string profile = json_get_string_safe(payload, "profile_id");
        std::string launch = json_get_string_safe(payload, "launch_id");
        std::string ext_id = json_get_string_safe(payload, "extension_id");
        
        if (profile.empty() || launch.empty()) {
            std::cerr << "[EXTRACT_IDENTITY] ✗ Missing fields in SYSTEM_HELLO" << std::endl;
            return false;
        }
        
        std::lock_guard<std::mutex> lock(g_identity_mutex);
        if (g_profile_id.empty()) {
            g_profile_id = profile;
            g_launch_id = launch;
            g_extension_id = ext_id;
            
            g_logger.initialize_with_profile_id(profile);
            g_logger.initialize_with_launch_id(launch);
            
            identity_resolved.store(true);
            g_identity_cv.notify_all();
            
            std::cerr << "[EXTRACT_IDENTITY] ✓ profile=" << profile 
                      << " launch=" << launch << std::endl;
            
            return true;
        }
        
    } catch (const std::exception& e) {
        std::cerr << "[EXTRACT_IDENTITY] ✗ Exception: " << e.what() << std::endl;
    }
    
    return false;
}

// ============================================================================
// HANDSHAKE DE 3 FASES - IMPLEMENTACIÓN
// ============================================================================

void handle_extension_ready(const json& msg) {
    std::lock_guard<std::mutex> lock(g_handshake_mutex);
    
    if (g_handshake_state.load() != HANDSHAKE_NONE) {
        std::cerr << "[HANDSHAKE] ⚠️ extension_ready recibido en estado: " 
                  << g_handshake_state.load() << std::endl;
        return;
    }
    
    std::cerr << "[HANDSHAKE] FASE 1: Extension → Host (extension_ready)" << std::endl;
    
    // Extraer identidad del mensaje
    try_extract_identity(msg);
    
    // Transición a Fase 1
    g_handshake_state.store(HANDSHAKE_EXTENSION_READY);
    
    // Responder con host_ready (Fase 2)
    json response;
    response["command"] = "host_ready";
    response["version"] = VERSION;
    response["build"] = BUILD;
    response["capabilities"] = json::array({
        "chunked_messages",
        "slave_mode_timeout",
        "size_validation"
    });
    response["max_message_size"] = MAX_CHROME_MSG_SIZE;
    response["timestamp"] = get_timestamp_ms();
    
    std::string response_str = response.dump();
    write_message_to_chrome(response_str);
    
    std::cerr << "[HANDSHAKE] FASE 2: Host → Extension (host_ready)" << std::endl;
    g_handshake_state.store(HANDSHAKE_HOST_READY);
    
    // Esperar a que haya conexión TCP antes de Fase 3
    std::thread([]{
        // Esperar hasta 5 segundos por conexión TCP
        for (int i = 0; i < 50; i++) {
            if (service_socket.load() != INVALID_SOCK) {
                std::this_thread::sleep_for(std::chrono::milliseconds(100));
                
                // Notificar al Brain (Fase 3)
                json brain_notify;
                brain_notify["type"] = "PROFILE_CONNECTED";
                
                {
                    std::lock_guard<std::mutex> lock(g_identity_mutex);
                    brain_notify["profile_id"] = g_profile_id;
                    brain_notify["launch_id"] = g_launch_id;
                    brain_notify["extension_id"] = g_extension_id;
                }
                
                brain_notify["handshake_confirmed"] = true;
                brain_notify["host_version"] = VERSION;
                brain_notify["host_build"] = BUILD;
                brain_notify["timestamp"] = get_timestamp_ms();
                
                std::string notify_str = brain_notify.dump();
                write_to_service(notify_str);
                
                std::cerr << "[HANDSHAKE] FASE 3: Host → Brain (PROFILE_CONNECTED)" << std::endl;
                
                {
                    std::lock_guard<std::mutex> lock(g_handshake_mutex);
                    g_handshake_state.store(HANDSHAKE_CONFIRMED);
                }
                
                if (g_logger.is_ready()) {
                    g_logger.log_native("INFO", "HANDSHAKE_COMPLETE Version=" + VERSION);
                }
                
                std::cerr << "[HANDSHAKE] ✓ COMPLETO - Sistema listo para comandos" << std::endl;
                return;
            }
            
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
        }
        
        std::cerr << "[HANDSHAKE] ⚠️ Timeout esperando conexión TCP para Fase 3" << std::endl;
    }).detach();
}

bool is_handshake_confirmed() {
    return g_handshake_state.load() == HANDSHAKE_CONFIRMED;
}

// ============================================================================
// MANEJO DE MENSAJES DESDE CHROME
// ============================================================================

void handle_chrome_message(const std::string& msg_str) {
    try {
        // Intentar extraer identidad RAW primero
        if (!identity_resolved.load()) {
            if (try_extract_profile_id_from_raw(msg_str)) {
                std::cerr << "[CHROME_MSG] ✓ Identity extracted from raw message" << std::endl;
            }
        }
        
        json msg = json::parse(msg_str);
        
        // Intentar extracción JSON
        if (!identity_resolved.load()) {
            try_extract_identity(msg);
        }
        
        std::string command = json_get_string_safe(msg, "command");
        std::string type = json_get_string_safe(msg, "type");
        
        std::cerr << "[CHROME_MSG] command='" << command << "' type='" << type << "'" << std::endl;
        
        // 🔒 HANDSHAKE: Manejar extension_ready
        if (command == "extension_ready") {
            handle_extension_ready(msg);
            return;
        }
        
        // Procesar chunks
        if (msg.contains("bloom_chunk")) {
            std::string complete_msg;
            auto result = g_chunked_buffer.process_chunk(msg, complete_msg);
            
            if (result == ChunkedMessageBuffer::COMPLETE_VALID) {
                std::cerr << "[CHUNK] ✓ Message assembled - Size: " 
                          << complete_msg.size() << " bytes" << std::endl;
                write_to_service(complete_msg);
            } else if (result == ChunkedMessageBuffer::COMPLETE_INVALID_CHECKSUM) {
                std::cerr << "[CHUNK] ✗ Invalid checksum" << std::endl;
                if (g_logger.is_ready()) {
                    g_logger.log_native("ERROR", "CHUNK_INVALID_CHECKSUM");
                }
            } else if (result == ChunkedMessageBuffer::CHUNK_ERROR) {
                std::cerr << "[CHUNK] ✗ Chunk error" << std::endl;
            }
            
            return;
        }
        
        // Rutear mensaje hacia Brain
        std::string forwarded = msg.dump();
        write_to_service(forwarded);
        
        if (g_logger.is_ready()) {
            g_logger.log_native("INFO", "CHROME_TO_BRAIN cmd=" + command);
        }
        
    } catch (const json::parse_error& e) {
        std::cerr << "[CHROME_MSG] ✗ JSON parse error: " << e.what() << std::endl;
        
        if (!identity_resolved.load()) {
            try_extract_profile_id_from_raw(msg_str);
        }
        
        if (g_logger.is_ready()) {
            g_logger.log_native("ERROR", "CHROME_PARSE_ERROR: " + std::string(e.what()));
        }
    } catch (const std::exception& e) {
        std::cerr << "[CHROME_MSG] ✗ Exception: " << e.what() << std::endl;
    }
}

// ============================================================================
// MANEJO DE MENSAJES DESDE BRAIN (TCP)
// ============================================================================

void handle_service_message(const std::string& msg_str) {
    try {
        json msg = json::parse(msg_str);
        
        std::string type = json_get_string_safe(msg, "type");
        std::string command = json_get_string_safe(msg, "command");
        
        std::cerr << "[SERVICE_MSG] type='" << type << "' command='" << command << "'" << std::endl;
        
        // 🔒 VALIDACIÓN: Solo rutear si handshake confirmado
        if (!is_handshake_confirmed()) {
            std::cerr << "[SERVICE_MSG] ⚠️ Handshake NO confirmado - mensaje bloqueado" << std::endl;
            
            if (g_logger.is_ready()) {
                g_logger.log_native("WARN", "MSG_BLOCKED_NO_HANDSHAKE type=" + type);
            }
            
            // Cola el mensaje para reenvío posterior
            {
                std::lock_guard<std::mutex> lock(g_pending_mutex);
                if (g_pending_messages.size() < MAX_QUEUED_MESSAGES) {
                    g_pending_messages.push(msg_str);
                    std::cerr << "[SERVICE_MSG] Mensaje encolado - Queue size: " 
                              << g_pending_messages.size() << std::endl;
                }
            }
            
            return;
        }
        
        // Comandos que se quedan en el Host
        if (type == "PING") {
            json pong;
            pong["type"] = "PONG";
            pong["timestamp"] = get_timestamp_ms();
            pong["handshake_state"] = g_handshake_state.load();
            
            std::string pong_str = pong.dump();
            write_to_service(pong_str);
            return;
        }
        
        if (type == "REQUEST_IDENTITY") {
            json identity;
            identity["type"] = "IDENTITY_RESPONSE";
            
            {
                std::lock_guard<std::mutex> lock(g_identity_mutex);
                identity["profile_id"] = g_profile_id;
                identity["launch_id"] = g_launch_id;
                identity["extension_id"] = g_extension_id;
            }
            
            identity["handshake_state"] = g_handshake_state.load();
            identity["timestamp"] = get_timestamp_ms();
            
            std::string identity_str = identity.dump();
            write_to_service(identity_str);
            return;
        }
        
        // Rutear hacia Chrome
        std::string forwarded = msg.dump();
        write_message_to_chrome(forwarded);
        
        if (g_logger.is_ready()) {
            g_logger.log_native("INFO", "BRAIN_TO_CHROME type=" + type);
        }
        
    } catch (const json::parse_error& e) {
        std::cerr << "[SERVICE_MSG] ✗ JSON parse error: " << e.what() << std::endl;
        if (g_logger.is_ready()) {
            g_logger.log_native("ERROR", "SERVICE_PARSE_ERROR: " + std::string(e.what()));
        }
    } catch (const std::exception& e) {
        std::cerr << "[SERVICE_MSG] ✗ Exception: " << e.what() << std::endl;
    }
}

// ============================================================================
// HEARTBEAT LOOP
// ============================================================================

void heartbeat_loop() {
    std::cerr << "[HEARTBEAT] Thread started" << std::endl;
    
    try {
        while (!shutdown_requested.load()) {
            std::this_thread::sleep_for(std::chrono::seconds(HEARTBEAT_INTERVAL_SEC));
            
            if (shutdown_requested.load()) break;
            
            socket_t sock = service_socket.load();
            if (sock == INVALID_SOCK) continue;
            
            json hb;
            hb["type"] = "HEARTBEAT";
            hb["timestamp"] = get_timestamp_ms();
            hb["stats"]["messages_sent"] = g_messages_sent.load();
            hb["stats"]["messages_received"] = g_messages_received.load();
            hb["stats"]["heartbeat_count"] = g_heartbeat_count.load();
            hb["stats"]["handshake_state"] = g_handshake_state.load();
            
            {
                std::lock_guard<std::mutex> lock(g_pending_mutex);
                hb["stats"]["pending_queue"] = g_pending_messages.size();
            }
            
            {
                std::lock_guard<std::mutex> lock(g_identity_mutex);
                hb["profile_id"] = g_profile_id;
            }
            
            std::string hb_str = hb.dump();
            write_to_service(hb_str);
            
            g_heartbeat_count.fetch_add(1);
        }
    } catch (const std::exception& e) {
        std::cerr << "[HEARTBEAT] ✗ Exception: " << e.what() << std::endl;
    }
    
    std::cerr << "[HEARTBEAT] Thread exiting" << std::endl;
}

// ============================================================================
// TCP CLIENT LOOP
// ============================================================================

void tcp_client_loop() {
    std::cerr << "[TCP_THREAD] Started" << std::endl;
    
    int reconnect_attempts = 0;
    
    try {
        while (!shutdown_requested.load()) {
            if (reconnect_attempts > 0) {
                int delay = RECONNECT_DELAY_MS * (1 << std::min(reconnect_attempts - 1, 5));
                std::cerr << "[TCP] Reconnect attempt " << reconnect_attempts 
                          << " - Waiting " << delay << "ms" << std::endl;
                std::this_thread::sleep_for(std::chrono::milliseconds(delay));
            }
            
            if (shutdown_requested.load()) break;
            
            std::cerr << "[TCP] Connecting to localhost:" << SERVICE_PORT << std::endl;
            
            socket_t sock = socket(AF_INET, SOCK_STREAM, 0);
            if (sock == INVALID_SOCK) {
                std::cerr << "[TCP] ✗ Socket creation failed" << std::endl;
                reconnect_attempts++;
                continue;
            }
            
            sockaddr_in addr{};
            addr.sin_family = AF_INET;
            addr.sin_port = htons(SERVICE_PORT);
            
#ifdef _WIN32
            addr.sin_addr.S_un.S_addr = htonl(INADDR_LOOPBACK);
#else
            addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
#endif
            
            if (connect(sock, (sockaddr*)&addr, sizeof(addr)) < 0) {
                std::cerr << "[TCP] ✗ Connection failed" << std::endl;
                close_socket(sock);
                reconnect_attempts++;
                continue;
            }
            
            std::cerr << "[TCP] ✓ Connected - Socket " << sock << std::endl;
            service_socket.store(sock);
            reconnect_attempts = 0;
            
            if (g_logger.is_ready()) {
                g_logger.log_native("INFO", "TCP_CONNECTED Socket=" + std::to_string(sock));
            }
            
            // Flush pending messages
            {
                std::lock_guard<std::mutex> lock(g_pending_mutex);
                size_t pending_count = g_pending_messages.size();
                
                if (pending_count > 0) {
                    std::cerr << "[TCP] Flushing " << pending_count << " pending messages" << std::endl;
                }
                
                while (!g_pending_messages.empty()) {
                    std::string pending = g_pending_messages.front();
                    g_pending_messages.pop();
                    
                    write_to_service(pending);
                }
            }
            
            try {
                std::vector<char> buffer;
                buffer.reserve(MAX_MESSAGE_SIZE);
                uint64_t messages_received_from_service = 0;
                
                while (!shutdown_requested.load()) {
                    uint32_t net_len;
                    
                    int received = recv(sock, (char*)&net_len, 4, MSG_WAITALL);
                    if (received <= 0) {
                        std::cerr << "[TCP] ✗ Recv header failed: " << received << std::endl;
                        break;
                    }
                    
                    uint32_t len = ntohl(net_len); // Big Endian desde Brain
                    
                    if (len == 0 || len > MAX_MESSAGE_SIZE) {
                        std::cerr << "[TCP] ✗ Invalid length: " << len << std::endl;
                        break;
                    }
                    
                    buffer.resize(len);
                    received = recv(sock, buffer.data(), len, MSG_WAITALL);
                    
                    if (received != (int)len) {
                        std::cerr << "[TCP] ✗ Recv body incomplete" << std::endl;
                        break;
                    }
                    
                    messages_received_from_service++;
                    std::string msg(buffer.begin(), buffer.end());
                    
                    std::cerr << "[TCP] ✓ Received message #" << messages_received_from_service 
                              << " - Size: " << len << " bytes" << std::endl;
                    
                    handle_service_message(msg);
                }
                
                std::cerr << "[TCP] Connection loop exited - received " 
                          << messages_received_from_service << " messages total" << std::endl;
                
            } catch (const std::exception& e) {
                std::cerr << "[TCP_LOOP] ✗ Exception: " << e.what() << std::endl;
                if (g_logger.is_ready()) {
                    g_logger.log_native("ERROR", "TCP_EXCEPTION: " + std::string(e.what()));
                }
            }
            
            service_socket.store(INVALID_SOCK);
            if (sock != INVALID_SOCK) {
                std::cerr << "[TCP] Closing socket " << sock << std::endl;
                close_socket(sock);
            }
            
            if (g_logger.is_ready()) {
                g_logger.log_native("WARN", "TCP_DISCONNECTED Reconnecting Attempt=" + 
                                   std::to_string(reconnect_attempts));
            }
        }
        
        std::cerr << "[TCP_THREAD] Exiting - Final reconnect attempts: " << reconnect_attempts << std::endl;
        
    } catch (const std::exception& e) {
        std::cerr << "[TCP_THREAD] ✗✗✗ Fatal exception: " << e.what() << std::endl;
        if (g_logger.is_ready()) {
            g_logger.log_native("CRITICAL", "TCP_FATAL: " + std::string(e.what()));
        }
    }
}

// ============================================================================
// MAIN
// ============================================================================

int main(int argc, char* argv[]) {
    try {
        PlatformUtils::initialize_networking();
        PlatformUtils::setup_binary_io();
        
        std::string cli_profile_id = PlatformUtils::get_cli_argument(argc, argv, "--profile-id");
        std::string cli_launch_id = PlatformUtils::get_cli_argument(argc, argv, "--launch-id");
        
        std::cerr << "============================================" << std::endl;
        std::cerr << "[HOST] bloom-host.cpp - Build " << BUILD << std::endl;
        std::cerr << "[HOST] Version: " << VERSION << " (Synapse Protocol)" << std::endl;
        std::cerr << "[HOST] PID: " << PlatformUtils::get_current_pid() << std::endl;
        std::cerr << "[HOST] Service Port: " << SERVICE_PORT << std::endl;
        std::cerr << "[HOST] Max Chrome Message: " << MAX_CHROME_MSG_SIZE << " bytes" << std::endl;
        std::cerr << "[HOST] Reconnect Delay: " << RECONNECT_DELAY_MS << "ms" << std::endl;
        std::cerr << "[HOST] Max Queue Size: " << MAX_QUEUED_MESSAGES << std::endl;
        std::cerr << "[HOST] Heartbeat Interval: " << HEARTBEAT_INTERVAL_SEC << "s" << std::endl;
        std::cerr << "============================================" << std::endl;
        
        std::cerr << "[HOST] CLI args: profile='" << cli_profile_id 
                  << "' launch='" << cli_launch_id << "'" << std::endl;
        
        if (!cli_profile_id.empty() && !cli_launch_id.empty()) {
            std::lock_guard<std::mutex> lock(g_identity_mutex);
            g_profile_id = cli_profile_id;
            g_launch_id = cli_launch_id;
            
            g_logger.initialize_with_profile_id(cli_profile_id);
            g_logger.initialize_with_launch_id(cli_launch_id);
            
            identity_resolved.store(true);
            g_identity_cv.notify_all();
            
            std::cerr << "[HOST] ✓ Identity from CLI arguments" << std::endl;
        } else {
            std::cerr << "[HOST] CLI args missing - will wait for SYSTEM_HELLO" << std::endl;
        }

        std::cerr << "[HOST] Starting TCP client thread..." << std::endl;
        std::thread tcp_thread(tcp_client_loop);

        std::cerr << "[HOST] Starting heartbeat thread..." << std::endl;
        std::thread heartbeat_thread(heartbeat_loop);

        std::cerr << "[HOST] ✓ All threads started - entering main loop" << std::endl;
        std::cerr << "[HOST] Listening on STDIN for Chrome messages..." << std::endl;
        std::cerr << "[HOST] Handshake state: " << g_handshake_state.load() << std::endl;

        uint64_t stdin_messages = 0;
        
        while (!shutdown_requested.load()) {
            uint32_t len = 0;
            
            if (!std::cin.read(reinterpret_cast<char*>(&len), 4)) {
                size_t pending = 0;
                {
                    std::lock_guard<std::mutex> lock(g_pending_mutex);
                    pending = g_pending_messages.size();
                }
                
                std::cerr << "============================================" << std::endl;
                std::cerr << "[SHUTDOWN] Reason: STDIN_EOF" << std::endl;
                std::cerr << "[SHUTDOWN] STDIN messages received: " << stdin_messages << std::endl;
                std::cerr << "[SHUTDOWN] Active messages queued: " << pending << std::endl;
                std::cerr << "[SHUTDOWN] Messages sent to Chrome: " << g_messages_sent.load() << std::endl;
                std::cerr << "[SHUTDOWN] Messages received from Chrome: " << g_messages_received.load() << std::endl;
                std::cerr << "[SHUTDOWN] Heartbeats sent: " << g_heartbeat_count.load() << std::endl;
                std::cerr << "[SHUTDOWN] Handshake state: " << g_handshake_state.load() << std::endl;
                std::cerr << "============================================" << std::endl;
                
                if (g_logger.is_ready()) {
                    g_logger.log_native("INFO", "STDIN_EOF StdinMessages=" + std::to_string(stdin_messages) +
                                       " Pending=" + std::to_string(pending) +
                                       " Sent=" + std::to_string(g_messages_sent.load()) +
                                       " Received=" + std::to_string(g_messages_received.load()));
                }
                break;
            }
            
            if (len == 0 || len > MAX_MESSAGE_SIZE) {
                std::cerr << "[STDIN] ✗ Invalid length: " << len << " bytes" << std::endl;
                if (g_logger.is_ready()) {
                    g_logger.log_native("ERROR", "STDIN_INVALID_LENGTH=" + std::to_string(len));
                }
                continue;
            }
            
            std::vector<char> buf(len);
            if (!std::cin.read(buf.data(), len)) {
                std::cerr << "[STDIN] ✗ Read incomplete - expected " << len << " bytes" << std::endl;
                if (g_logger.is_ready()) {
                    g_logger.log_native("ERROR", "STDIN_READ_INCOMPLETE Expected=" + std::to_string(len));
                }
                break;
            }
            
            stdin_messages++;
            g_messages_received.fetch_add(1);
            std::string msg_str(buf.begin(), buf.end());
            
            std::cerr << "[STDIN] ✓ Read message #" << stdin_messages 
                      << " - Size: " << len << " bytes" << std::endl;
            
            handle_chrome_message(msg_str);
        }

        std::cerr << "[HOST] Main loop exited - initiating shutdown..." << std::endl;
        
        shutdown_requested.store(true);
        g_identity_cv.notify_all();
        
        if (g_logger.is_ready()) {
            g_logger.log_native("INFO", "SHUTDOWN StdinMessages=" + std::to_string(stdin_messages));
        }
        
        socket_t sock = service_socket.load();
        if (sock != INVALID_SOCK) {
            std::cerr << "[HOST] Closing service socket " << sock << std::endl;
            service_socket.store(INVALID_SOCK);
            close_socket(sock);
        }
        
        std::cerr << "[HOST] Waiting for TCP thread to exit..." << std::endl;
        if (tcp_thread.joinable()) tcp_thread.join();
        std::cerr << "[HOST] ✓ TCP thread joined" << std::endl;
        
        std::cerr << "[HOST] Waiting for heartbeat thread to exit..." << std::endl;
        if (heartbeat_thread.joinable()) heartbeat_thread.join();
        std::cerr << "[HOST] ✓ Heartbeat thread joined" << std::endl;

        PlatformUtils::cleanup_networking();
        
        std::cerr << "============================================" << std::endl;
        std::cerr << "[HOST] Clean shutdown complete" << std::endl;
        std::cerr << "  Total STDIN messages: " << stdin_messages << std::endl;
        std::cerr << "  Total sent to Chrome: " << g_messages_sent.load() << std::endl;
        std::cerr << "  Total received from Chrome: " << g_messages_received.load() << std::endl;
        std::cerr << "  Total heartbeats: " << g_heartbeat_count.load() << std::endl;
        std::cerr << "  Handshake final state: " << g_handshake_state.load() << std::endl;
        std::cerr << "============================================" << std::endl;
        
        return 0;
        
    } catch (const std::exception& e) {
        std::cerr << "[MAIN] ✗✗✗ Fatal exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "[MAIN] ✗✗✗ Unknown fatal exception" << std::endl;
        return 2;
    }
}
