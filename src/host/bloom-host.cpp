#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <cstdint>
#include <thread>
#include <mutex>
#include <atomic>
#include <chrono>
#include <ctime>
#include <sstream>
#include <iomanip>
#include <map>
#include <queue>
#include <condition_variable>

#if defined(_WIN32) || defined(__MINGW32__) || defined(__MINGW64__)
    #ifndef _WIN32
        #define _WIN32
    #endif
    #ifndef WIN32_LEAN_AND_MEAN
        #define WIN32_LEAN_AND_MEAN
    #endif
    #include <winsock2.h>
    #include <ws2tcpip.h>
    #include <windows.h>
    #include <shlobj.h>
    #include <direct.h>
    #include <io.h>
    #include <fcntl.h>
    #include <process.h>

    #ifndef MAX_PATH
        #define MAX_PATH 260
    #endif

    typedef SOCKET socket_t;
    #define INVALID_SOCK INVALID_SOCKET
    #define close_socket closesocket
    #define get_pid_internal _getpid
#else
    #include <sys/socket.h>
    #include <netinet/in.h>
    #include <unistd.h>
    #include <arpa/inet.h>
    #include <sys/stat.h>
    #include <sys/types.h>

    typedef int socket_t;
    #define INVALID_SOCK -1
    #define close_socket close
    #define get_pid_internal getpid
#endif

#include <nlohmann/json.hpp>
#include <openssl/sha.h>

using json = nlohmann::json;

const std::string VERSION = "2.0.0";
const int BUILD = 20;
const int SERVICE_PORT = 5678;
const size_t MAX_ACTIVE_BUFFERS = 15;
const size_t MAX_MESSAGE_SIZE = 50 * 1024 * 1024;
const int RECONNECT_DELAY_MS = 2000;
const size_t MAX_QUEUED_MESSAGES = 100;

std::atomic<socket_t> service_socket{INVALID_SOCK};
std::mutex stdout_mutex;
std::atomic<bool> shutdown_requested{false};
std::atomic<bool> identity_resolved{false};
std::string g_profile_id = "";
std::string g_launch_id = "";
std::mutex g_profile_id_mutex;
std::condition_variable g_identity_cv;

std::queue<std::string> g_pending_messages;
std::mutex g_pending_mutex;

class SynapseLogManager {
private:
    std::ofstream native_log;
    std::ofstream browser_log;
    std::mutex native_mutex;
    std::mutex browser_mutex;
    std::string log_directory;
    bool initialized;
    
    std::string get_timestamp_ms() {
        auto now = std::chrono::system_clock::now();
        auto now_t = std::chrono::system_clock::to_time_t(now);
        auto now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch()) % 1000;
        
        std::stringstream ss;
        ss << std::put_time(std::localtime(&now_t), "%Y-%m-%d %H:%M:%S")
           << "." << std::setfill('0') << std::setw(3) << now_ms.count();
        return ss.str();
    }
    
    std::string get_log_directory() {
#ifdef _WIN32
        char path[MAX_PATH];
        if (SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path) >= 0) {
            std::string base = std::string(path) + "\\BloomNucleus\\logs";
            _mkdir(base.c_str());
            return base;
        }
        return "";
#else
        std::string base = "/tmp/bloom-nucleus/logs";
        mkdir(base.c_str(), 0755);
        return base;
#endif
    }
    
    bool create_directory_recursive(const std::string& path) {
#ifdef _WIN32
        size_t pos = 0;
        do {
            pos = path.find_first_of("\\/", pos + 1);
            std::string subpath = path.substr(0, pos);
            _mkdir(subpath.c_str());
        } while (pos != std::string::npos);
        return true;
#else
        size_t pos = 0;
        do {
            pos = path.find('/', pos + 1);
            std::string subpath = path.substr(0, pos);
            mkdir(subpath.c_str(), 0755);
        } while (pos != std::string::npos);
        return true;
#endif
    }

public:
    SynapseLogManager() : initialized(false) {}

// ============================================================================
// CAMBIOS CLAVE PARA LOGGING:
// 1. Logs van a BloomNucleus/logs/{profile_id}/ (sin subcarpeta "profiles")
// 2. Logger inicializa con launch_id ANTES de loguear
// 3. Logs tempranos se escriben a stderr hasta que el logger esté listo
// ============================================================================

void initialize_with_profile_id(const std::string& profile_id) {
    if (initialized) return;
    
    std::string base_dir = get_log_directory();
    if (base_dir.empty()) return;
    
#ifdef _WIN32
    std::string profile_dir = base_dir + "\\" + profile_id;  // ✅ SIN "profiles"
    create_directory_recursive(profile_dir);
    log_directory = profile_dir;
#else
    std::string profile_dir = base_dir + "/" + profile_id;    // ✅ SIN "profiles"
    create_directory_recursive(profile_dir);
    log_directory = profile_id;
#endif
    
    initialized = true;
}    
    
    void initialize_with_launch_id(const std::string& launch_id) {
        if (!initialized || log_directory.empty()) return;
        
#ifdef _WIN32
        native_log.open(log_directory + "\\synapse_native_" + launch_id + ".log", std::ios::app);
        browser_log.open(log_directory + "\\synapse_browser_" + launch_id + ".log", std::ios::app);
#else
        native_log.open(log_directory + "/synapse_native_" + launch_id + ".log", std::ios::app);
        browser_log.open(log_directory + "/synapse_browser_" + launch_id + ".log", std::ios::app);
#endif
        
        if (native_log.is_open()) {
            native_log << "\n========== HOST SESSION " << get_timestamp_ms() 
                      << " PID:" << get_pid_internal() 
                      << " LAUNCH:" << launch_id << " ==========\n";
            native_log.flush();
        }
        
        if (browser_log.is_open()) {
            browser_log << "\n========== EXTENSION SESSION " << get_timestamp_ms() 
                       << " PID:" << get_pid_internal()
                       << " LAUNCH:" << launch_id << " ==========\n";
            browser_log.flush();
        }
    }
    
    void log_native(const std::string& level, const std::string& message) {
        std::lock_guard<std::mutex> lock(native_mutex);
        if (!native_log.is_open()) return;
        
        native_log << "[" << get_timestamp_ms() << "] [" << level << "] [HOST] " 
                   << message << std::endl;
        native_log.flush();
    }
    
    void log_browser(const std::string& level, const std::string& message, 
                     const std::string& timestamp = "") {
        std::lock_guard<std::mutex> lock(browser_mutex);
        if (!browser_log.is_open()) return;
        
        std::string ts = timestamp.empty() ? get_timestamp_ms() : timestamp;
        browser_log << "[" << ts << "] [" << level << "] [EXTENSION] " 
                    << message << std::endl;
        browser_log.flush();
    }
};

SynapseLogManager g_logger;

class ChunkedMessageBuffer {
private:
    struct InProgressMessage {
        std::vector<uint8_t> buffer;
        size_t total_chunks;
        size_t received_chunks;
        size_t expected_size;
    };
    std::map<std::string, InProgressMessage> active_buffers;
    std::mutex buffer_mutex;

    std::vector<uint8_t> base64_decode(const std::string& encoded) {
        static const std::string base64_chars = 
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        std::vector<uint8_t> decoded;
        int val = 0, valb = -8;
        for (unsigned char c : encoded) {
            if (c == '=') break;
            size_t pos = base64_chars.find(c);
            if (pos == std::string::npos) continue;
            val = (val << 6) + (int)pos;
            valb += 6;
            if (valb >= 0) {
                decoded.push_back((val >> valb) & 0xFF);
                valb -= 8;
            }
        }
        return decoded;
    }

    std::string calculate_sha256(const std::vector<uint8_t>& data) {
        unsigned char hash[SHA256_DIGEST_LENGTH];
        SHA256(data.data(), data.size(), hash);
        std::stringstream ss;
        for(int i = 0; i < SHA256_DIGEST_LENGTH; i++)
            ss << std::hex << std::setw(2) << std::setfill('0') << (int)hash[i];
        return ss.str();
    }

public:
    enum ChunkResult { INCOMPLETE, COMPLETE_VALID, COMPLETE_INVALID_CHECKSUM, CHUNK_ERROR };
    
    ChunkResult process_chunk(const json& msg, std::string& out_complete_msg) {
        std::lock_guard<std::mutex> lock(buffer_mutex);
        if (!msg.contains("bloom_chunk")) return CHUNK_ERROR;
        
        const auto& chunk = msg["bloom_chunk"];
        std::string type = chunk.value("type", "");
        std::string msg_id = chunk.value("message_id", "");
        
        if (type == "header") {
            InProgressMessage ipm;
            ipm.total_chunks = chunk.value("total_chunks", 0);
            ipm.received_chunks = 0;
            ipm.expected_size = chunk.value("total_size_bytes", 0);
            ipm.buffer.reserve(ipm.expected_size);
            active_buffers[msg_id] = std::move(ipm);
            g_logger.log_native("DEBUG", "CHUNK_HEADER MsgID=" + msg_id + 
                               " Chunks=" + std::to_string(ipm.total_chunks));
            return INCOMPLETE;
        }
        
        auto it = active_buffers.find(msg_id);
        if (it == active_buffers.end()) return CHUNK_ERROR;
        
        if (type == "data") {
            std::vector<uint8_t> decoded = base64_decode(chunk.value("data", ""));
            it->second.buffer.insert(it->second.buffer.end(), decoded.begin(), decoded.end());
            it->second.received_chunks++;
            return INCOMPLETE;
        }
        
        if (type == "footer") {
            std::string computed = calculate_sha256(it->second.buffer);
            if (computed != chunk.value("checksum_verify", "")) {
                g_logger.log_native("ERROR", "CHUNK_CHECKSUM_FAIL MsgID=" + msg_id);
                return COMPLETE_INVALID_CHECKSUM;
            }
            out_complete_msg = std::string(it->second.buffer.begin(), it->second.buffer.end());
            active_buffers.erase(it);
            g_logger.log_native("DEBUG", "CHUNK_COMPLETE MsgID=" + msg_id);
            return COMPLETE_VALID;
        }
        
        return CHUNK_ERROR;
    }
};

ChunkedMessageBuffer g_chunked_buffer;

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
        
        std::lock_guard<std::mutex> lock(g_profile_id_mutex);
        if (!identity_resolved.load()) {
            g_profile_id = candidate;
            identity_resolved.store(true);
            g_logger.initialize_with_profile_id(candidate);
            g_logger.log_native("INFO", "LATE_BINDING_SUCCESS(RAW) ProfileID=" + candidate);
            g_identity_cv.notify_all();
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
    
    if (!candidate_profile.empty()) {
        std::lock_guard<std::mutex> lock(g_profile_id_mutex);
        if (!identity_resolved.load()) {
            g_profile_id = candidate_profile;
            g_launch_id = candidate_launch.empty() ? "unknown" : candidate_launch;
            identity_resolved.store(true);
            g_logger.log_native("INFO", "LATE_BINDING_SUCCESS ProfileID=" + 
                candidate_profile + " LaunchID=" + g_launch_id);
            g_identity_cv.notify_all();
            return true;
        }
    }
    return false;
}

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

void flush_pending_messages() {
    std::lock_guard<std::mutex> lock(g_pending_mutex);
    
    size_t count = g_pending_messages.size();
    g_logger.log_native("INFO", "FLUSH_START Count=" + std::to_string(count));
    
    while (!g_pending_messages.empty()) {
        std::string msg = g_pending_messages.front();
        g_pending_messages.pop();
        write_to_service(msg);
    }
    
    g_logger.log_native("INFO", "FLUSH_COMPLETE");
}

void handle_chrome_message(const std::string& msg_str) {
    // PASO 1: Intentar extraer profile_id del string RAW
    try_extract_profile_id_from_raw(msg_str);
    
    // PASO 2: Parse JSON con tolerancia a errores
    json msg;
    try {
        msg = json::parse(msg_str);
    } catch (const std::exception& e) {
        g_logger.log_native("ERROR", "JSON_PARSE_ERROR: " + std::string(e.what()));
        g_logger.log_native("DEBUG", "RAW_MSG: " + msg_str.substr(0, 200));
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
    
    // PASO 4: Intentar extraer profile_id del JSON parseado
    try_extract_identity(msg);
    
    // ========================================================================
    // FIX CRÍTICO: VALIDACIÓN TOLERANTE A TIPOS
    // ========================================================================
    // Chromium puede enviar mensajes con "type" como número (channel probes)
    // No debemos crashear, simplemente ignorar esos mensajes
    
    std::string msg_type = "unknown_technical";
    
    if (msg.contains("type")) {
        // GUARDA 1: Verificar que "type" sea string
        if (msg["type"].is_string()) {
            msg_type = msg["type"].get<std::string>();
        } else if (msg["type"].is_number()) {
            // Chromium envía números como type en mensajes de infraestructura
            g_logger.log_native("DEBUG", "CHROMIUM_TECHNICAL_MESSAGE Type=" + 
                               std::to_string(msg["type"].get<int>()));
            return; // Ignorar silenciosamente
        } else {
            // Tipo no reconocido
            g_logger.log_native("WARN", "MESSAGE_TYPE_UNKNOWN TypeClass=" + 
                               std::string(msg["type"].type_name()));
            return;
        }
    }
    
    // GUARDA 2: Si no pudimos extraer un tipo válido, ignorar
    if (msg_type == "unknown_technical") {
        g_logger.log_native("DEBUG", "MESSAGE_NO_VALID_TYPE Ignoring");
        return;
    }
    
    // ========================================================================
    // MANEJO DE MENSAJES ESPECIALES
    // ========================================================================
    
    // MENSAJE: LOG (routing a browser log)
    if (msg_type == "LOG") {
        std::string level = "INFO";
        std::string message = "";
        std::string timestamp = "";
        
        if (msg.contains("level") && msg["level"].is_string()) {
            level = msg["level"].get<std::string>();
        }
        if (msg.contains("message") && msg["message"].is_string()) {
            message = msg["message"].get<std::string>();
        }
        if (msg.contains("timestamp") && msg["timestamp"].is_string()) {
            timestamp = msg["timestamp"].get<std::string>();
        }
        
        g_logger.log_browser(level, message, timestamp);
        return;
    }
    
    // MENSAJE: SYSTEM_HELLO (handshake inicial)
    if (msg_type == "SYSTEM_HELLO") {
        std::string final_id;
        {
            std::lock_guard<std::mutex> lock(g_profile_id_mutex);
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
        g_logger.log_native("INFO", "SYSTEM_ACK_SENT ProfileID=" + final_id);
        return;
    }
    
    // ========================================================================
    // ENRUTAMIENTO AL SERVICIO TCP
    // ========================================================================
    
    if (service_socket.load() != INVALID_SOCK && identity_resolved.load()) {
        // Conexión TCP establecida e identidad resuelta → enviar inmediatamente
        write_to_service(msg_str);
        g_logger.log_native("DEBUG", "MSG_FORWARDED_TO_SERVICE Type=" + msg_type);
    } else {
        // Aún no hay conexión o identidad → encolar
        std::lock_guard<std::mutex> lock(g_pending_mutex);
        if (g_pending_messages.size() < MAX_QUEUED_MESSAGES) {
            g_pending_messages.push(msg_str);
            g_logger.log_native("DEBUG", "MSG_QUEUED Type=" + msg_type + 
                               " QueueSize=" + std::to_string(g_pending_messages.size()));
        } else {
            g_logger.log_native("ERROR", "QUEUE_OVERFLOW Message dropped Type=" + msg_type);
        }
    }
}

void tcp_client_loop() {
    std::unique_lock<std::mutex> id_lock(g_profile_id_mutex);
    g_logger.log_native("INFO", "TCP_THREAD_START Waiting for identity");
    
    g_identity_cv.wait(id_lock, []{ 
        return identity_resolved.load() || shutdown_requested.load(); 
    });
    
    if (shutdown_requested.load()) {
        g_logger.log_native("WARN", "TCP_THREAD_ABORT Shutdown before identity");
        return;
    }
    
    std::string worker_id = g_profile_id;
    std::string launch_id = g_launch_id;
    id_lock.unlock();

    g_logger.initialize_with_profile_id(worker_id);
    g_logger.log_native("INFO", "TCP_IDENTITY_ACQUIRED ProfileID=" + worker_id);
    
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

        g_logger.log_native("INFO", "TCP_CONNECTING Port=" + std::to_string(SERVICE_PORT));

        if (connect(sock, (sockaddr*)&addr, sizeof(addr)) < 0) {
            close_socket(sock);
            g_logger.log_native("WARN", "TCP_CONNECT_FAILED Retry in " + 
                               std::to_string(RECONNECT_DELAY_MS) + "ms");
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
        
        g_logger.log_native("INFO", "TCP_CONNECTED Socket=" + std::to_string(sock));
        service_socket.store(sock);

        json reg = {
            {"type", "REGISTER_HOST"},
            {"pid", (int)get_pid_internal()},
            {"profile_id", worker_id},
            {"launch_id", launch_id},
            {"version", VERSION},
            {"build", BUILD}
        };
        
        g_logger.log_native("INFO", "TCP_REGISTERING ProfileID=" + worker_id);
        write_to_service(reg.dump());

        flush_pending_messages();

        while (!shutdown_requested.load()) {
            uint32_t net_len;
            int received = recv(sock, (char*)&net_len, 4, 0);
            
            if (received <= 0) {
                if (shutdown_requested.load()) {
                    g_logger.log_native("INFO", "TCP_GRACEFUL_SHUTDOWN Requested by main thread");
                    break;
                }
#ifdef _WIN32
                if (WSAGetLastError() == WSAETIMEDOUT) continue;
#else
                if (errno == EAGAIN || errno == EWOULDBLOCK) continue;
#endif
                g_logger.log_native("ERROR", "TCP_RECV_FAILED Error=" + std::to_string(received));
                break;
            }
            
            uint32_t len = ntohl(net_len);
            if (len == 0 || len > MAX_MESSAGE_SIZE) {
                g_logger.log_native("ERROR", "TCP_INVALID_LENGTH Length=" + std::to_string(len));
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
        g_logger.log_native("WARN", "TCP_DISCONNECTED Reconnecting");
    }
}

// ============================================================================
// MAIN FUNCTION - ORDEN CORRECTO DE INICIALIZACIÓN
// ============================================================================

int main(int argc, char* argv[]) {
#ifdef _WIN32
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif

    // ⚠️ NO loguear aquí - logger aún no inicializado
    std::cerr << "[HOST] Startup - waiting for SYSTEM_HELLO from extension" << std::endl;

    std::thread tcp_thread(tcp_client_loop);

    while (!shutdown_requested.load()) {
        uint32_t len = 0;
        
        if (!std::cin.read(reinterpret_cast<char*>(&len), 4)) {
            if (g_logger.is_ready()) {
                g_logger.log_native("INFO", "STDIN_EOF Pipe closed by Chrome");
            }
            break;
        }
        
        if (len == 0 || len > MAX_MESSAGE_SIZE) {
            if (g_logger.is_ready()) {
                g_logger.log_native("ERROR", "STDIN_INVALID_LENGTH Length=" + std::to_string(len));
            }
            continue;
        }
        
        std::vector<char> buf(len);
        if (!std::cin.read(buf.data(), len)) {
            if (g_logger.is_ready()) {
                g_logger.log_native("ERROR", "STDIN_READ_INCOMPLETE Expected=" + std::to_string(len));
            }
            break;
        }
        
        std::string msg_str(buf.begin(), buf.end());
        handle_chrome_message(msg_str);
    }

    shutdown_requested.store(true);
    g_identity_cv.notify_all();
    
    if (g_logger.is_ready()) {
        g_logger.log_native("INFO", "SHUTDOWN Closing threads");
    }
    
    socket_t sock = service_socket.load();
    if (sock != INVALID_SOCK) {
        service_socket.store(INVALID_SOCK);
        close_socket(sock);
        if (g_logger.is_ready()) {
            g_logger.log_native("INFO", "SHUTDOWN Socket closed forcefully");
        }
    }
    
    if (tcp_thread.joinable()) tcp_thread.join();

#ifdef _WIN32
    WSACleanup();
#endif

    if (g_logger.is_ready()) {
        g_logger.log_native("INFO", "EXIT Process terminated");
    }
    
    return 0;
}
