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
#include <openssl/sha.h> // Requiere libssl-dev / openssl

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
typedef int socket_t;
#define INVALID_SOCK -1
#define close_socket close
#define mkdir_p(path) mkdir(path, 0755)
#endif

using json = nlohmann::json;

const std::string VERSION = "1.1.0"; // Incrementada por soporte de chunks
const int BUILD = 2;
const int PROTOCOL = 1;
const int BASE_PORT = 5678;
const int MAX_PORT_ATTEMPTS = 20;

const size_t MAX_ACTIVE_BUFFERS = 10;
const size_t MAX_MESSAGE_SIZE = 50 * 1024 * 1024; // 50MB

// ============================================================================
// GLOBALS
// ============================================================================
std::atomic<socket_t> vscode_socket{INVALID_SOCK};
std::mutex stdout_mutex;
std::atomic<bool> shutdown_requested{false};
std::atomic<time_t> last_chrome_activity{0};

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
// CHUNKED MESSAGE BUFFER
// ============================================================================
class ChunkedMessageBuffer {
public:
    enum ChunkResult { INCOMPLETE, COMPLETE_VALID, COMPLETE_INVALID_CHECKSUM, ERROR };
    
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
            if (active_buffers.size() >= MAX_ACTIVE_BUFFERS) return ERROR;
            size_t size = chunk.value("total_size_bytes", 0);
            if (size > MAX_MESSAGE_SIZE) return ERROR;

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

        if (active_buffers.find(msg_id) == active_buffers.end()) return ERROR;
        auto& ipm = active_buffers[msg_id];

        if (type == "data") {
            std::vector<uint8_t> decoded = base64_decode(chunk.value("data", ""));
            ipm.buffer.insert(ipm.buffer.end(), decoded.begin(), decoded.end());
            ipm.received_chunks++;
            return INCOMPLETE;
        }

        if (type == "footer") {
            if (ipm.received_chunks != ipm.total_chunks) return ERROR;
            std::string computed = calculate_sha256(ipm.buffer);
            if (computed != chunk.value("checksum_verify", "")) return COMPLETE_INVALID_CHECKSUM;
            return COMPLETE_VALID;
        }
        return ERROR;
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
    // Check for Chunked Protocol
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

    // Standard commands
    std::string cmd = msg.value("command", "");
    if (cmd == "ping") return {{"ok", true}, {"version", VERSION}};
    
    // Forward directly if not a chunk and VSCode is connected
    socket_t sock = vscode_socket.load();
    if (sock != INVALID_SOCK) {
        write_socket(sock, msg.dump());
        return {{"ok", true}, {"forwarded", true}};
    }

    return {{"ok", false}, {"error", "no_handler"}};
}

// ============================================================================
// LOOPS
// ============================================================================
void chrome_loop() {
#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif
    while (!shutdown_requested.load()) {
        uint32_t size = 0;
        std::cin.read(reinterpret_cast<char*>(&size), 4);
        if (std::cin.eof()) break;
        if (size == 0 || size > 10 * 1024 * 1024) continue;

        std::string buffer(size, '\0');
        std::cin.read(&buffer[0], size);
        last_chrome_activity.store(std::time(nullptr));

        try {
            json response = process_message(json::parse(buffer));
            write_message(std::cout, response.dump());
        } catch (...) {
            write_message(std::cout, "{\"ok\":false}");
        }
    }
    shutdown_requested.store(true);
}

void tcp_server_loop(int port) {
    socket_t listen_sock = socket(AF_INET, SOCK_STREAM, 0);
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    bind(listen_sock, (sockaddr*)&addr, sizeof(addr));
    listen(listen_sock, 1);
    g_logger.info("TCP Server listening on " + std::to_string(port));

    while (!shutdown_requested.load()) {
        socket_t client = accept(listen_sock, NULL, NULL);
        if (client == INVALID_SOCK) continue;
        
        vscode_socket.store(client);
        g_logger.info("Brain/VSCode connected");

        while (!shutdown_requested.load()) {
            uint32_t size = 0;
            if (recv(client, (char*)&size, 4, 0) <= 0) break;
            std::string buf(size, '\0');
            if (recv(client, &buf[0], size, 0) <= 0) break;
            write_message(std::cout, buf); // Forward Brain -> Chrome
        }
        
        vscode_socket.store(INVALID_SOCK);
        close_socket(client);
        g_logger.info("Brain/VSCode disconnected");
    }
    close_socket(listen_sock);
}

int main(int argc, char* argv[]) {
#ifdef _WIN32
    WSADATA wsa; WSAStartup(MAKEWORD(2, 2), &wsa);
#endif

    int port = BASE_PORT;
    std::thread server_thread(tcp_server_loop, port);
    
    // Background Cleanup Thread
    std::thread cleanup_thread([]() {
        while (!shutdown_requested.load()) {
            std::this_thread::sleep_for(std::chrono::minutes(1));
            g_chunked_buffer.cleanup_expired();
        }
    });

    chrome_loop();

    shutdown_requested.store(true);
    server_thread.join();
    if (cleanup_thread.joinable()) cleanup_thread.join();

#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}