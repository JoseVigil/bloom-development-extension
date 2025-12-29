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
#include <nlohmann/json.hpp>
#include <openssl/sha.h>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <shlobj.h>
#include <direct.h>
#include <io.h>
#include <fcntl.h>
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
#include <poll.h>
typedef int socket_t;
#define INVALID_SOCK -1
#define close_socket close
#define mkdir_p(path) mkdir(path, 0755)
#endif

using json = nlohmann::json;

const std::string VERSION = "1.1.1"; // Fixed CPU usage
const int BUILD = 3;
const int PROTOCOL = 1;
const int BASE_PORT = 5678;
const int MAX_PORT_ATTEMPTS = 20;

const size_t MAX_ACTIVE_BUFFERS = 10;
const size_t MAX_MESSAGE_SIZE = 50 * 1024 * 1024; // 50MB

// Timeouts para evitar busy-waiting
const int SOCKET_TIMEOUT_MS = 1000;  // 1 segundo
const int STDIN_READ_TIMEOUT_MS = 500; // 500ms

// ============================================================================
// GLOBALS
// ============================================================================
std::atomic<socket_t> vscode_socket{INVALID_SOCK};
std::mutex stdout_mutex;
std::atomic<bool> shutdown_requested{false};
std::atomic<time_t> last_chrome_activity{0};
std::atomic<bool> stdin_available{false};

// Forward Declarations
void write_socket(socket_t sock, const std::string& s);

// ============================================================================
// LOGGER
// ============================================================================
class Logger {
private:
    std::string log_dir;
    std::ofstream log_file;
    std::mutex log_mutex;
    bool enabled;
public:
    Logger(bool enable = true) : enabled(enable) {
        if (enabled) {
            #ifdef _WIN32
                char path[MAX_PATH];
                SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path);
                std::string base = std::string(path) + "\\BloomNucleus";
            #else
                std::string base = "/tmp/bloom-nucleus";
            #endif
            mkdir_p(base.c_str());
            log_dir = base + "/logs";
            mkdir_p(log_dir.c_str());
            log_file.open(log_dir + "/host.log", std::ios::app);
        }
    }
    void log(const std::string& level, const std::string& msg) {
        if (!enabled) return;
        std::lock_guard<std::mutex> lock(log_mutex);
        auto now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
        log_file << "[" << std::put_time(std::localtime(&now), "%Y-%m-%d %H:%M:%S") << "] [" << level << "] " << msg << std::endl;
    }
    void info(const std::string& msg) { log("INFO", msg); }
    void error(const std::string& msg) { log("ERROR", msg); }
    void debug(const std::string& msg) { log("DEBUG", msg); }
    void warn(const std::string& msg) { log("WARN", msg); }
};

Logger g_logger(true);

// ============================================================================
// HELPER: Set Socket Timeout
// ============================================================================
void set_socket_timeout(socket_t sock, int timeout_ms) {
#ifdef _WIN32
    DWORD timeout = timeout_ms;
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, (const char*)&timeout, sizeof(timeout));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, (const char*)&timeout, sizeof(timeout));
#else
    struct timeval tv;
    tv.tv_sec = timeout_ms / 1000;
    tv.tv_usec = (timeout_ms % 1000) * 1000;
    setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
#endif
}

// ============================================================================
// CHUNKED MESSAGE BUFFER
// ============================================================================
class ChunkedMessageBuffer {
public:
    enum ChunkResult { INCOMPLETE, COMPLETE_VALID, COMPLETE_INVALID_CHECKSUM, CHUNK_ERROR };
    
private:
    struct InProgressMessage {
        std::string message_id;
        std::vector<uint8_t> buffer;
        size_t expected_size;
        size_t total_chunks;
        size_t received_chunks;
        std::chrono::time_point<std::chrono::steady_clock> started_at;
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
    ChunkResult process_chunk(const json& msg) {
        std::lock_guard<std::mutex> lock(buffer_mutex);
        const auto& chunk = msg["bloom_chunk"];
        std::string type = chunk.value("type", "");
        std::string msg_id = chunk.value("message_id", "");

        if (type == "header") {
            if (active_buffers.size() >= MAX_ACTIVE_BUFFERS) return CHUNK_ERROR;
            size_t size = chunk.value("total_size_bytes", 0);
            if (size > MAX_MESSAGE_SIZE) return CHUNK_ERROR;

            InProgressMessage ipm;
            ipm.message_id = msg_id;
            ipm.expected_size = size;
            ipm.total_chunks = chunk.value("total_chunks", 0);
            ipm.received_chunks = 0;
            ipm.buffer.reserve(size);
            ipm.started_at = std::chrono::steady_clock::now();
            active_buffers[msg_id] = std::move(ipm);
            g_logger.info("Buffering started: " + msg_id + " (" + std::to_string(size) + " bytes)");
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
            if (ipm.received_chunks != ipm.total_chunks) return CHUNK_ERROR;
            std::string computed = calculate_sha256(ipm.buffer);
            if (computed != chunk.value("checksum_verify", "")) return COMPLETE_INVALID_CHECKSUM;
            return COMPLETE_VALID;
        }
        return CHUNK_ERROR;
    }

    std::string get_and_clear(const std::string& msg_id) {
        std::lock_guard<std::mutex> lock(buffer_mutex);
        auto it = active_buffers.find(msg_id);
        if (it == active_buffers.end()) return "";
        std::string result(it->second.buffer.begin(), it->second.buffer.end());
        active_buffers.erase(it);
        return result;
    }

    void cleanup_expired() {
        std::lock_guard<std::mutex> lock(buffer_mutex);
        auto now = std::chrono::steady_clock::now();
        for (auto it = active_buffers.begin(); it != active_buffers.end(); ) {
            if (std::chrono::duration_cast<std::chrono::minutes>(now - it->second.started_at).count() > 5) {
                g_logger.warn("Removing stale buffer: " + it->first);
                it = active_buffers.erase(it);
            } else ++it;
        }
    }
};

ChunkedMessageBuffer g_chunked_buffer;

// ============================================================================
// PROTOCOL HELPERS
// ============================================================================
void write_message(std::ostream& out, const std::string& s) {
    std::lock_guard<std::mutex> lock(stdout_mutex);
    uint32_t len = static_cast<uint32_t>(s.size());
    out.write(reinterpret_cast<const char*>(&len), 4);
    out.write(s.c_str(), len);
    out.flush();
}

void write_socket(socket_t sock, const std::string& s) {
    uint32_t len = static_cast<uint32_t>(s.size());
    send(sock, reinterpret_cast<const char*>(&len), 4, 0);
    send(sock, s.c_str(), len, 0);
}

// ============================================================================
// MESSAGE PROCESSING
// ============================================================================
json process_message(const json& msg) {
    if (msg.contains("bloom_chunk")) {
        auto result = g_chunked_buffer.process_chunk(msg);
        std::string msg_id = msg["bloom_chunk"].value("message_id", "unknown");

        if (result == ChunkedMessageBuffer::INCOMPLETE) {
            return {{"ok", true}, {"status", "chunk_accepted"}};
        } else if (result == ChunkedMessageBuffer::COMPLETE_VALID) {
            std::string full_content = g_chunked_buffer.get_and_clear(msg_id);
            g_logger.info("Message " + msg_id + " assembled. Forwarding to Brain...");
            
            socket_t sock = vscode_socket.load();
            if (sock != INVALID_SOCK) {
                write_socket(sock, full_content);
                return {{"ok", true}, {"status", "assembled_and_forwarded"}};
            }
            return {{"ok", false}, {"error", "Brain not connected"}};
        } else {
            return {{"ok", false}, {"error", "chunk_process_failed"}};
        }
    }

    std::string cmd = msg.value("command", "");
    if (cmd == "ping") return {{"ok", true}, {"version", VERSION}};
    
    socket_t sock = vscode_socket.load();
    if (sock != INVALID_SOCK) {
        write_socket(sock, msg.dump());
        return {{"ok", true}, {"forwarded", true}};
    }

    return {{"ok", false}, {"error", "no_handler"}};
}

// ============================================================================
// STDIN READER CON TIMEOUT (FIX CRÍTICO)
// ============================================================================
bool read_stdin_with_timeout(std::vector<char>& buffer, size_t bytes, int timeout_ms) {
#ifdef _WIN32
    // En Windows, usar PeekNamedPipe para verificar disponibilidad
    HANDLE hStdin = GetStdHandle(STD_INPUT_HANDLE);
    DWORD available = 0;
    
    auto start = std::chrono::steady_clock::now();
    while (std::chrono::duration_cast<std::chrono::milliseconds>(
           std::chrono::steady_clock::now() - start).count() < timeout_ms) {
        
        if (PeekNamedPipe(hStdin, NULL, 0, NULL, &available, NULL) && available >= bytes) {
            std::cin.read(buffer.data(), bytes);
            return std::cin.gcount() == bytes;
        }
        
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        
        if (shutdown_requested.load()) return false;
    }
    return false;
#else
    // En Unix, usar poll()
    struct pollfd pfd;
    pfd.fd = STDIN_FILENO;
    pfd.events = POLLIN;
    
    int ret = poll(&pfd, 1, timeout_ms);
    if (ret > 0 && (pfd.revents & POLLIN)) {
        std::cin.read(buffer.data(), bytes);
        return std::cin.gcount() == bytes;
    }
    return false;
#endif
}

// ============================================================================
// CHROME LOOP CON TIMEOUT (FIX CRÍTICO)
// ============================================================================
void chrome_loop() {
#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif

    g_logger.info("Chrome loop started");
    stdin_available.store(true);

    while (!shutdown_requested.load()) {
        // Leer tamaño del mensaje con timeout
        std::vector<char> size_buffer(4);
        if (!read_stdin_with_timeout(size_buffer, 4, STDIN_READ_TIMEOUT_MS)) {
            // Timeout - dormir un poco antes de reintentar
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            continue;
        }

        if (std::cin.eof()) {
            g_logger.warn("stdin EOF detected");
            break;
        }

        uint32_t size = *reinterpret_cast<uint32_t*>(size_buffer.data());
        
        if (size == 0 || size > 10 * 1024 * 1024) {
            g_logger.warn("Invalid message size: " + std::to_string(size));
            continue;
        }

        // Leer mensaje
        std::string buffer(size, '\0');
        std::cin.read(&buffer[0], size);
        
        if (std::cin.gcount() != size) {
            g_logger.error("Incomplete message read");
            continue;
        }

        last_chrome_activity.store(std::time(nullptr));

        try {
            json response = process_message(json::parse(buffer));
            write_message(std::cout, response.dump());
        } catch (const std::exception& e) {
            g_logger.error("Message processing error: " + std::string(e.what()));
            write_message(std::cout, "{\"ok\":false}");
        }
    }
    
    stdin_available.store(false);
    g_logger.info("Chrome loop ended");
    shutdown_requested.store(true);
}

// ============================================================================
// TCP SERVER CON TIMEOUT (FIX CRÍTICO)
// ============================================================================
void tcp_server_loop(int port) {
    socket_t listen_sock = socket(AF_INET, SOCK_STREAM, 0);
    if (listen_sock == INVALID_SOCK) {
        g_logger.error("Failed to create listen socket");
        return;
    }

    // Configurar socket para reutilizar dirección
    int opt = 1;
    setsockopt(listen_sock, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));
    
    // Configurar timeout en el socket de escucha
    set_socket_timeout(listen_sock, SOCKET_TIMEOUT_MS);

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    if (bind(listen_sock, (sockaddr*)&addr, sizeof(addr)) < 0) {
        g_logger.error("Failed to bind to port " + std::to_string(port));
        close_socket(listen_sock);
        return;
    }

    if (listen(listen_sock, 1) < 0) {
        g_logger.error("Failed to listen on socket");
        close_socket(listen_sock);
        return;
    }

    g_logger.info("TCP Server listening on " + std::to_string(port));

    while (!shutdown_requested.load()) {
        socket_t client = accept(listen_sock, NULL, NULL);
        
        if (client == INVALID_SOCK) {
            // Timeout o error - dormir antes de reintentar
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            continue;
        }
        
        // Configurar timeout en el socket del cliente
        set_socket_timeout(client, SOCKET_TIMEOUT_MS);
        
        vscode_socket.store(client);
        g_logger.info("Brain/VSCode connected");

        while (!shutdown_requested.load()) {
            uint32_t size = 0;
            int recv_result = recv(client, (char*)&size, 4, 0);
            
            if (recv_result <= 0) {
                if (recv_result == 0) {
                    g_logger.info("Client disconnected gracefully");
                }
#ifdef _WIN32
                else if (WSAGetLastError() == WSAETIMEDOUT) {
                    // Timeout normal - continuar
                    std::this_thread::sleep_for(std::chrono::milliseconds(50));
                    continue;
                }
#else
                else if (errno == EAGAIN || errno == EWOULDBLOCK) {
                    // Timeout normal - continuar
                    std::this_thread::sleep_for(std::chrono::milliseconds(50));
                    continue;
                }
#endif
                break;
            }

            if (size == 0 || size > 10 * 1024 * 1024) continue;

            std::string buf(size, '\0');
            recv_result = recv(client, &buf[0], size, 0);
            
            if (recv_result <= 0) break;

            // Forward Brain -> Chrome
            write_message(std::cout, buf);
        }
        
        vscode_socket.store(INVALID_SOCK);
        close_socket(client);
        g_logger.info("Brain/VSCode disconnected");
    }
    
    close_socket(listen_sock);
    g_logger.info("TCP Server stopped");
}

// ============================================================================
// MAIN
// ============================================================================
int main(int argc, char* argv[]) {
#ifdef _WIN32
    WSADATA wsa; 
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        std::cerr << "WSAStartup failed" << std::endl;
        return 1;
    }
#endif

    g_logger.info("=== Bloom Host " + VERSION + " Starting ===");
    g_logger.info("Build: " + std::to_string(BUILD));
    g_logger.info("Platform: " + std::string(
#ifdef _WIN32
        "Windows"
#elif __APPLE__
        "macOS"
#else
        "Linux"
#endif
    ));

    int port = BASE_PORT;
    
    // Iniciar servidor TCP
    std::thread server_thread(tcp_server_loop, port);
    
    // Thread de limpieza de buffers
    std::thread cleanup_thread([]() {
        while (!shutdown_requested.load()) {
            std::this_thread::sleep_for(std::chrono::minutes(1));
            g_chunked_buffer.cleanup_expired();
        }
    });

    // Loop principal de Chrome (bloqueante)
    chrome_loop();

    // Cleanup
    g_logger.info("Shutting down...");
    shutdown_requested.store(true);
    
    if (server_thread.joinable()) server_thread.join();
    if (cleanup_thread.joinable()) cleanup_thread.join();

#ifdef _WIN32
    WSACleanup();
#endif
    
    g_logger.info("=== Bloom Host Stopped ===");
    return 0;
}