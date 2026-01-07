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

// JSON Library
#include <nlohmann/json.hpp>

// OpenSSL for SHA256
#include <openssl/sha.h>

#ifdef _WIN32
    #ifndef WIN32_LEAN_AND_MEAN
    #define WIN32_LEAN_AND_MEAN
    #endif
    #include <winsock2.h>
    #include <windows.h>
    #include <ws2tcpip.h>
    #include <shlobj.h>
    #include <direct.h>
    #include <io.h>
    #include <fcntl.h>
    #include <process.h>
    #pragma comment(lib, "ws2_32.lib")
    #pragma comment(lib, "libcrypto.lib")
    #pragma comment(lib, "libssl.lib")
    typedef SOCKET socket_t;
    #define INVALID_SOCK INVALID_SOCKET
    #define close_socket closesocket
    #define mkdir_p(path) _mkdir(path)
#else
    #include <sys/socket.h>
    #include <netinet/in.h>
    #include <unistd.h>
    #include <arpa/inet.h>
    #include <sys/stat.h>
    typedef int socket_t;
    #define INVALID_SOCK -1
    #define close_socket close
    #define mkdir_p(path) mkdir(path, 0755)
#endif

using json = nlohmann::json;

// --- CONFIGURACIÓN E IDENTIFICACIÓN ---
const std::string VERSION = "1.3.1"; 
const int BUILD = 8;
const int SERVICE_PORT = 5678; 
const size_t MAX_ACTIVE_BUFFERS = 15;
const size_t MAX_MESSAGE_SIZE = 50 * 1024 * 1024; // 50MB
const int RECONNECT_DELAY_MS = 2000;

// --- GLOBALES ---
std::atomic<socket_t> service_socket{INVALID_SOCK};
std::mutex stdout_mutex;
std::atomic<bool> shutdown_requested{false};

// ============================================================================
// LOGGER
// ============================================================================
class Logger {
private:
    std::ofstream log_file;
    std::mutex log_mutex;
public:
    Logger() {
        #ifdef _WIN32
            char path[MAX_PATH];
            SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path);
            std::string base = std::string(path) + "\\BloomNucleus";
        #else
            std::string base = "/tmp/bloom-nucleus";
        #endif
        mkdir_p(base.c_str());
        std::string logs = base + "/logs";
        mkdir_p(logs.c_str());
        log_file.open(logs + "/host_client.log", std::ios::app);
    }
    void log(const std::string& level, const std::string& msg) {
        std::lock_guard<std::mutex> lock(log_mutex);
        if (!log_file.is_open()) return;
        auto now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
        log_file << "[" << std::put_time(std::localtime(&now), "%Y-%m-%d %H:%M:%S") << "] [" << level << "] " << msg << std::endl;
        log_file.flush();
    }
    void info(const std::string& msg) { log("INFO", msg); }
    void error(const std::string& msg) { log("ERROR", msg); }
};

Logger g_logger;

// ============================================================================
// CHUNKED MESSAGE BUFFER (Soporte para Mensajes Grandes)
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
        static const std::string base64_chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
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
            if (active_buffers.size() >= MAX_ACTIVE_BUFFERS) return CHUNK_ERROR;
            InProgressMessage ipm;
            ipm.total_chunks = chunk.value("total_chunks", 0);
            ipm.received_chunks = 0;
            ipm.expected_size = chunk.value("total_size_bytes", 0);
            ipm.buffer.reserve(ipm.expected_size);
            active_buffers[msg_id] = std::move(ipm);
            return INCOMPLETE;
        }

        if (active_buffers.find(msg_id) == active_buffers.end()) return CHUNK_ERROR;
        auto& ipm = active_buffers[msg_id];

        if (type == "data") {
            std::vector<uint8_t> decoded = base64_decode(chunk.value("data", ""));
            ipm.buffer.insert(ipm.buffer.end(), decoded.begin(), decoded.end());
            ipm.received_chunks++;
            return INCOMPLETE;
        }

        if (type == "footer") {
            std::string computed = calculate_sha256(ipm.buffer);
            if (computed != chunk.value("checksum_verify", "")) return COMPLETE_INVALID_CHECKSUM;
            out_complete_msg = std::string(ipm.buffer.begin(), ipm.buffer.end());
            active_buffers.erase(msg_id);
            return COMPLETE_VALID;
        }
        return CHUNK_ERROR;
    }
};

ChunkedMessageBuffer g_chunked_buffer;

// ============================================================================
// I/O HELPERS
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
        uint32_t network_len = htonl(len); 
        if (send(sock, reinterpret_cast<const char*>(&network_len), 4, 0) <= 0) return;
        send(sock, s.c_str(), len, 0);
    }
}

// ============================================================================
// PROCESAMIENTO CENTRAL
// ============================================================================

void handle_chrome_message(const std::string& msg_str) {
    try {
        auto msg = json::parse(msg_str);

        // 1. Manejo de Chunks
        if (msg.contains("bloom_chunk")) {
            std::string assembled;
            auto res = g_chunked_buffer.process_chunk(msg, assembled);
            if (res == ChunkedMessageBuffer::COMPLETE_VALID) {
                g_logger.info("Message assembled (Large). Forwarding to Service.");
                write_to_service(assembled);
            } else if (res == ChunkedMessageBuffer::COMPLETE_INVALID_CHECKSUM) {
                g_logger.error("Chunk Error: Checksum mismatch");
            }
            return;
        }

        // 2. Handshake Extensión
        if (msg.value("type", "") == "SYSTEM_HELLO") {
            g_logger.info("Extension Handshake Received");
            json ready = {
                {"command", "system_ready"}, 
                {"status", "connected"}, 
                {"host_version", VERSION},
                {"build", BUILD}
            };
            write_message_to_chrome(ready.dump());
            write_to_service(msg_str);
            return;
        }

        // 3. Reenvío directo al Servicio (Cualquier otro comando)
        write_to_service(msg_str);

    } catch (const std::exception& e) {
        g_logger.error("Chrome Message Parse Error: " + std::string(e.what()));
    }
}

// ============================================================================
// LOOP DE CONEXIÓN TCP (MODO CLIENTE)
// ============================================================================

void tcp_client_loop() {
    g_logger.info("TCP Client Thread Started (Target Port: " + std::to_string(SERVICE_PORT) + ")");
    
    while (!shutdown_requested.load()) {
        socket_t sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock == INVALID_SOCK) {
            std::this_thread::sleep_for(std::chrono::milliseconds(RECONNECT_DELAY_MS));
            continue;
        }

        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(SERVICE_PORT);
        inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);

        if (connect(sock, (sockaddr*)&addr, sizeof(addr)) < 0) {
            close_socket(sock);
            std::this_thread::sleep_for(std::chrono::milliseconds(RECONNECT_DELAY_MS));
            continue;
        }

        g_logger.info("✅ CONNECTED to Brain Service at 127.0.0.1:" + std::to_string(SERVICE_PORT));
        service_socket.store(sock);

        // Handshake de registro de Host
        #ifdef _WIN32
            int current_pid = (int)GetCurrentProcessId();
        #else
            int current_pid = (int)getpid();
        #endif

        json reg = {
            {"type", "REGISTER_HOST"}, 
            {"pid", current_pid}, 
            {"version", VERSION},
            {"build", BUILD}
        };
        write_to_service(reg.dump());

        // Escuchar mensajes provenientes del Brain Service
        while (!shutdown_requested.load()) {
            uint32_t network_len;
            int ret = recv(sock, reinterpret_cast<char*>(&network_len), 4, 0);
            if (ret <= 0) break;
            
            uint32_t msg_len = ntohl(network_len);
            if (msg_len > MAX_MESSAGE_SIZE) {
                g_logger.error("Message from service exceeds MAX_MESSAGE_SIZE");
                break;
            }
            
            std::vector<char> buffer(msg_len);
            int received = 0;
            while (received < (int)msg_len) {
                int r = recv(sock, buffer.data() + received, msg_len - received, 0);
                if (r <= 0) break;
                received += r;
            }
            
            if (received == (int)msg_len) {
                // Forward message from Service directly to Chrome
                write_message_to_chrome(std::string(buffer.begin(), buffer.end()));
            }
        }

        g_logger.error("Lost connection to Brain Service. Reconnecting...");
        service_socket.store(INVALID_SOCK);
        close_socket(sock);
    }
}

// ============================================================================
// MAIN
// ============================================================================

int main() {
#ifdef _WIN32
    // Inicializar Winsock
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        return 1;
    }
    // Configurar STDIN/STDOUT para modo binario (Vital para Native Messaging en Windows)
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif

    g_logger.info("=== Bloom Host Imperial v" + VERSION + " (Build " + std::to_string(BUILD) + ") Starting ===");

    // Lanzar el hilo de conexión al servicio
    std::thread client_thread(tcp_client_loop);

    // Bucle principal: Leer de Chrome (STDIN)
    while (!shutdown_requested.load()) {
        uint32_t msg_len = 0;
        if (!std::cin.read(reinterpret_cast<char*>(&msg_len), 4)) {
            if (std::cin.eof()) break;
            continue;
        }
        
        if (msg_len == 0 || msg_len > MAX_MESSAGE_SIZE) {
            continue;
        }

        std::vector<char> buffer(msg_len);
        if (!std::cin.read(buffer.data(), msg_len)) break;
        
        handle_chrome_message(std::string(buffer.begin(), buffer.end()));
    }

    g_logger.info("Shutting down Host...");
    shutdown_requested.store(true);
    
    // Forzar cierre de socket para liberar el hilo si está bloqueado en recv
    socket_t sock = service_socket.load();
    if (sock != INVALID_SOCK) close_socket(sock);

    if (client_thread.joinable()) client_thread.join();

#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}