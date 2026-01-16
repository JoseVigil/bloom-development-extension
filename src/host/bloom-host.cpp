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
std::mutex g_profile_id_mutex;
std::condition_variable g_identity_cv;

// Cola de mensajes pre-registro
std::queue<std::string> g_pending_messages;
std::mutex g_pending_mutex;

// ============================================================================
// FORENSIC LOGGER (Escritura Síncrona con Flush Forzado)
// ============================================================================
class ForensicLogger {
private:
    std::ofstream log_file;
    std::mutex log_mutex;
    
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
    
    std::string bytes_to_hex(const void* data, size_t len) {
        std::stringstream ss;
        const uint8_t* bytes = static_cast<const uint8_t*>(data);
        for (size_t i = 0; i < std::min(len, size_t(64)); i++) {
            ss << std::hex << std::setw(2) << std::setfill('0') << (int)bytes[i] << " ";
        }
        if (len > 64) ss << "... (+" << (len - 64) << " bytes)";
        return ss.str();
    }

public:
    ForensicLogger() {
#ifdef _WIN32
        char path[MAX_PATH];
        if (SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path) >= 0) {
            std::string base = std::string(path) + "\\BloomNucleus";
            _mkdir(base.c_str());
            std::string logs = base + "\\logs";
            _mkdir(logs.c_str());
            log_file.open(logs + "\\host_forensic.log", std::ios::app);
        }
#else
        std::string base = "/tmp/bloom-nucleus";
        mkdir(base.c_str(), 0755);
        std::string logs = base + "/logs";
        mkdir(logs.c_str(), 0755);
        log_file.open(logs + "/host_forensic.log", std::ios::app);
#endif
        if (log_file.is_open()) {
            log_file << "\n========== NEW SESSION " << get_timestamp_ms() 
                     << " PID:" << get_pid_internal() << " ==========\n";
            log_file.flush();
        }
    }

    void log_raw(const std::string& level, const std::string& context, 
                 const std::string& msg, const void* raw_data = nullptr, size_t raw_len = 0) {
        std::lock_guard<std::mutex> lock(log_mutex);
        if (!log_file.is_open()) return;
        
        log_file << "[" << get_timestamp_ms() << "] [" << level << "] [" << context << "] " 
                 << msg;
        
        if (raw_data && raw_len > 0) {
            log_file << " | RAW_BYTES: " << bytes_to_hex(raw_data, raw_len);
        }
        
        log_file << std::endl;
        log_file.flush(); // CRÍTICO: Escritura física inmediata
        
        // El flush() ya fuerza escritura al buffer del OS
        // fsync() requeriría FILE* en lugar de ofstream
    }
    
    void stdin_read(uint32_t length_prefix, const std::string& payload) {
        log_raw("STDIN", "PIPE_READ", 
                "Length=" + std::to_string(length_prefix) + " Payload=" + payload,
                &length_prefix, 4);
    }
    
    void stdout_write(const std::string& payload) {
        uint32_t len = static_cast<uint32_t>(payload.size());
        log_raw("STDOUT", "PIPE_WRITE", 
                "Length=" + std::to_string(len) + " Payload=" + payload,
                &len, 4);
    }
    
    void tcp_send(const std::string& payload) {
        log_raw("TCP_OUT", "SERVICE_SEND", payload);
    }
    
    void tcp_recv(const std::string& payload) {
        log_raw("TCP_IN", "SERVICE_RECV", payload);
    }
    
    void state_change(const std::string& event, const std::string& details) {
        log_raw("STATE", event, details);
    }
    
    void identity_event(const std::string& event, const std::string& profile_id) {
        log_raw("IDENTITY", event, "ProfileID=" + profile_id);
    }
    
    void queue_event(const std::string& event, size_t queue_size) {
        log_raw("QUEUE", event, "Size=" + std::to_string(queue_size));
    }
};

ForensicLogger g_logger;

// ============================================================================
// CHUNKED MESSAGE BUFFER
// ============================================================================
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
            g_logger.state_change("CHUNK_HEADER", "MsgID=" + msg_id + 
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
                g_logger.state_change("CHUNK_CHECKSUM_FAIL", "MsgID=" + msg_id);
                return COMPLETE_INVALID_CHECKSUM;
            }
            out_complete_msg = std::string(it->second.buffer.begin(), it->second.buffer.end());
            active_buffers.erase(it);
            g_logger.state_change("CHUNK_COMPLETE", "MsgID=" + msg_id);
            return COMPLETE_VALID;
        }
        
        return CHUNK_ERROR;
    }
};

ChunkedMessageBuffer g_chunked_buffer;

// ============================================================================
// IDENTITY EXTRACTION (Late Binding Core)
// ============================================================================
bool try_extract_profile_id(const json& msg) {
    std::vector<std::string> paths = {
        "/profile_id",
        "/payload/profile_id",
        "/data/profile_id",
        "/metadata/profile_id"
    };
    
    for (const auto& path : paths) {
        try {
            auto ptr = msg.at(json::json_pointer(path));
            if (ptr.is_string()) {
                std::string candidate = ptr.get<std::string>();
                // Validar formato UUID (8-4-4-4-12)
                if (candidate.length() == 36 && 
                    candidate[8] == '-' && candidate[13] == '-' &&
                    candidate[18] == '-' && candidate[23] == '-') {
                    
                    std::lock_guard<std::mutex> lock(g_profile_id_mutex);
                    if (g_profile_id.empty() || g_profile_id == "unknown_worker") {
                        g_profile_id = candidate;
                        identity_resolved.store(true);
                        g_logger.identity_event("LATE_BINDING_SUCCESS", candidate);
                        g_identity_cv.notify_all();
                        return true;
                    }
                }
            }
        } catch (...) { continue; }
    }
    return false;
}

// ============================================================================
// CHROME COMMUNICATION
// ============================================================================
void write_message_to_chrome(const std::string& s) {
    std::lock_guard<std::mutex> lock(stdout_mutex);
    uint32_t len = static_cast<uint32_t>(s.size());
    
    g_logger.stdout_write(s);
    
    std::cout.write(reinterpret_cast<const char*>(&len), 4);
    std::cout.write(s.c_str(), len);
    std::cout.flush();
}

// ============================================================================
// TCP SERVICE COMMUNICATION
// ============================================================================
void write_to_service(const std::string& s) {
    socket_t sock = service_socket.load();
    if (sock != INVALID_SOCK) {
        uint32_t len = static_cast<uint32_t>(s.size());
        uint32_t net_len = htonl(len);
        
        g_logger.tcp_send(s);
        
        send(sock, (const char*)&net_len, 4, 0);
        send(sock, s.c_str(), len, 0);
    }
}

void flush_pending_messages() {
    std::lock_guard<std::mutex> lock(g_pending_mutex);
    
    g_logger.queue_event("FLUSH_START", g_pending_messages.size());
    
    while (!g_pending_messages.empty()) {
        std::string msg = g_pending_messages.front();
        g_pending_messages.pop();
        write_to_service(msg);
    }
    
    g_logger.queue_event("FLUSH_COMPLETE", 0);
}

// ============================================================================
// CHROME MESSAGE HANDLER
// ============================================================================
void handle_chrome_message(const std::string& msg_str) {
    try {
        auto msg = json::parse(msg_str);
        
        // Procesar chunks
        if (msg.contains("bloom_chunk")) {
            std::string assembled;
            auto res = g_chunked_buffer.process_chunk(msg, assembled);
            if (res == ChunkedMessageBuffer::COMPLETE_VALID) {
                handle_chrome_message(assembled); // Recursivo
            }
            return;
        }
        
        // CRÍTICO: Intentar extraer identidad de CUALQUIER mensaje
        try_extract_profile_id(msg);
        
        // Manejo especial de SYSTEM_HELLO
        if (msg.value("type", "") == "SYSTEM_HELLO") {
            // Esperar a tener identidad (timeout 5s)
            std::unique_lock<std::mutex> lock(g_profile_id_mutex);
            if (!identity_resolved.load()) {
                g_logger.state_change("WAITING_IDENTITY", "Timeout=5000ms");
                g_identity_cv.wait_for(lock, std::chrono::milliseconds(5000), 
                                       []{ return identity_resolved.load(); });
            }
            
            std::string final_id = g_profile_id.empty() ? "unknown_worker" : g_profile_id;
            
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
            
            // Enviar al servicio si está conectado
            if (service_socket.load() != INVALID_SOCK) {
                write_to_service(msg_str);
            } else {
                std::lock_guard<std::mutex> qlock(g_pending_mutex);
                g_pending_messages.push(msg_str);
                g_logger.queue_event("ENQUEUE", g_pending_messages.size());
            }
            return;
        }
        
        // Mensajes normales: enviar o encolar
        if (service_socket.load() != INVALID_SOCK && identity_resolved.load()) {
            write_to_service(msg_str);
        } else {
            std::lock_guard<std::mutex> lock(g_pending_mutex);
            if (g_pending_messages.size() < MAX_QUEUED_MESSAGES) {
                g_pending_messages.push(msg_str);
                g_logger.queue_event("ENQUEUE", g_pending_messages.size());
            } else {
                g_logger.state_change("QUEUE_OVERFLOW", "Message dropped");
            }
        }
        
    } catch (const std::exception& e) {
        g_logger.state_change("JSON_PARSE_ERROR", e.what());
    }
}

// ============================================================================
// TCP CLIENT LOOP (Con Registro Tardío)
// ============================================================================
void tcp_client_loop() {
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

        g_logger.state_change("TCP_CONNECTING", "Port=" + std::to_string(SERVICE_PORT));

        if (connect(sock, (sockaddr*)&addr, sizeof(addr)) < 0) {
            close_socket(sock);
            g_logger.state_change("TCP_CONNECT_FAILED", "Retry in " + 
                                  std::to_string(RECONNECT_DELAY_MS) + "ms");
            std::this_thread::sleep_for(std::chrono::milliseconds(RECONNECT_DELAY_MS));
            continue;
        }

        // Configurar timeout de socket para permitir shutdown graceful
#ifdef _WIN32
        DWORD timeout = 1000; // 1 segundo
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, (const char*)&timeout, sizeof(timeout));
#else
        struct timeval tv;
        tv.tv_sec = 1;
        tv.tv_usec = 0;
        setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
#endif
        
        g_logger.state_change("TCP_CONNECTED", "Socket=" + std::to_string(sock));
        service_socket.store(sock);

        // ESPERAR IDENTIDAD antes de registrar (timeout 10s)
        {
            std::unique_lock<std::mutex> lock(g_profile_id_mutex);
            if (!identity_resolved.load()) {
                g_logger.state_change("WAITING_IDENTITY_FOR_REGISTER", "Timeout=10000ms");
                g_identity_cv.wait_for(lock, std::chrono::milliseconds(10000), 
                                       []{ return identity_resolved.load(); });
            }
        }

        std::string final_id = g_profile_id;
        if (final_id.empty()) final_id = "unknown_worker";

        json reg = {
            {"type", "REGISTER_HOST"},
            {"pid", (int)get_pid_internal()},
            {"profile_id", final_id},
            {"version", VERSION},
            {"build", BUILD}
        };
        
        g_logger.state_change("TCP_REGISTERING", "ProfileID=" + final_id);
        write_to_service(reg.dump());

        // Vaciar cola de mensajes pendientes
        flush_pending_messages();

        // Loop de recepción con checks de shutdown
        while (!shutdown_requested.load()) {
            uint32_t net_len;
            int received = recv(sock, (char*)&net_len, 4, 0);
            
            // Timeout o error
            if (received <= 0) {
                if (shutdown_requested.load()) {
                    g_logger.state_change("TCP_GRACEFUL_SHUTDOWN", "Requested by main thread");
                    break;
                }
#ifdef _WIN32
                if (WSAGetLastError() == WSAETIMEDOUT) continue;
#else
                if (errno == EAGAIN || errno == EWOULDBLOCK) continue;
#endif
                g_logger.state_change("TCP_RECV_FAILED", "Error=" + std::to_string(received));
                break;
            }
            
            uint32_t len = ntohl(net_len);
            if (len == 0 || len > MAX_MESSAGE_SIZE) {
                g_logger.state_change("TCP_INVALID_LENGTH", "Length=" + std::to_string(len));
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
                g_logger.tcp_recv(b_msg);
                write_message_to_chrome(b_msg);
            }
        }
        
        service_socket.store(INVALID_SOCK);
        close_socket(sock);
        g_logger.state_change("TCP_DISCONNECTED", "Reconnecting...");
    }
}

// ============================================================================
// MAIN
// ============================================================================
int main(int argc, char* argv[]) {
#ifdef _WIN32
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif

    // 1. Intentar captura temprana
    std::string full_cmd = "";
#ifdef _WIN32
    full_cmd = GetCommandLineA();
#else
    for (int i = 0; i < argc; i++) full_cmd += std::string(argv[i]) + " ";
#endif

    g_logger.state_change("STARTUP", "CMD=" + full_cmd);

    // 2. Búsqueda de UUID en línea de comandos
    bool found = false;
    if (full_cmd.length() >= 36) {
        for (size_t i = 0; i <= full_cmd.length() - 36; i++) {
            if (full_cmd[i+8] == '-' && full_cmd[i+13] == '-' &&
                full_cmd[i+18] == '-' && full_cmd[i+23] == '-') {
                g_profile_id = full_cmd.substr(i, 36);
                found = true;
                identity_resolved.store(true); // <--- Marcamos como resuelto
                g_logger.identity_event("CMDLINE_EXTRACTION", g_profile_id);
                break;
            }
        }
    }

    if (!found) {
        g_profile_id = "unknown_worker";
        identity_resolved.store(false); // <--- IMPORTANTE: Falso para que el hilo TCP espere
        g_logger.identity_event("CMDLINE_FAILED", "Waiting for Late Binding via JSON");
    }

    // 3. Iniciar thread TCP (El hilo debe tener un 'wait' en g_identity_cv al inicio de su loop)
    std::thread tcp_thread(tcp_client_loop);

    // 4. Loop principal (stdin)
    g_logger.state_change("STDIN_LOOP_START", "Reading Native Messaging pipe");
    
    while (!shutdown_requested.load()) {
        uint32_t len = 0;
        
        if (!std::cin.read(reinterpret_cast<char*>(&len), 4)) {
            g_logger.state_change("STDIN_EOF", "Pipe closed by Chrome");
            break;
        }
        
        if (len == 0 || len > MAX_MESSAGE_SIZE) {
            g_logger.state_change("STDIN_INVALID_LENGTH", "Length=" + std::to_string(len));
            continue;
        }
        
        std::vector<char> buf(len);
        if (!std::cin.read(buf.data(), len)) {
            g_logger.state_change("STDIN_READ_INCOMPLETE", "Expected=" + std::to_string(len));
            break;
        }
        
        std::string msg_str(buf.begin(), buf.end());
        
        // --- LÓGICA DE VINCULACIÓN TARDÍA ---
        // Si aún no tenemos ID, lo buscamos en el JSON que acaba de llegar
        if (!identity_resolved.load()) {
            // Buscamos el patrón "profile_id":"UUID" en el mensaje crudo
            size_t id_pos = msg_str.find("\"profile_id\":\"");
            if (id_pos != std::string::npos) {
                std::string potential_id = msg_str.substr(id_pos + 14, 36);
                if (potential_id.find("-") != std::string::npos) {
                    g_profile_id = potential_id;
                    identity_resolved.store(true);
                    g_logger.identity_event("LATE_BINDING_SUCCESS", g_profile_id);
                    
                    // DESPERTAR AL HILO TCP: Ya sabemos quiénes somos
                    g_identity_cv.notify_all(); 
                }
            }
        }
        // ------------------------------------

        g_logger.stdin_read(len, msg_str);
        handle_chrome_message(msg_str);
    }

    // 5. Shutdown ordenado
    shutdown_requested.store(true);
    g_identity_cv.notify_all(); // Despertar threads por si seguían esperando identidad
    
    g_logger.state_change("SHUTDOWN", "Closing threads");
    
    socket_t sock = service_socket.load();
    if (sock != INVALID_SOCK) {
        service_socket.store(INVALID_SOCK);
        close_socket(sock);
        g_logger.state_change("SHUTDOWN", "Socket closed forcefully");
    }
    
    if (tcp_thread.joinable()) tcp_thread.join();

#ifdef _WIN32
    WSACleanup();
#endif

    g_logger.state_change("EXIT", "Process terminated");
    return 0;
} 
