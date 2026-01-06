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

const std::string VERSION = "1.3.0"; // Architecture Shift: Client Mode
const int BUILD = 6;
const int SERVICE_PORT = 5678; // Puerto donde vive el Brain Service

// Configuración Chunking (CONSERVADA)
const size_t MAX_ACTIVE_BUFFERS = 10;
const size_t MAX_MESSAGE_SIZE = 50 * 1024 * 1024; // 50MB

// Timeouts
const int RECONNECT_DELAY_MS = 2000;
const int SOCKET_TIMEOUT_MS = 1000;

// Globals
std::atomic<socket_t> service_socket{INVALID_SOCK};
std::mutex stdout_mutex;
std::atomic<bool> shutdown_requested{false};
std::atomic<time_t> last_chrome_activity{0};

// Forward Declarations
void write_socket(socket_t sock, const std::string& s);
void write_message_to_chrome(const std::string& s);

// ============================================================================
// LOGGER (COMPLETO - CONSERVADO)
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
            log_file.open(log_dir + "/host_client.log", std::ios::app);
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
};

Logger g_logger(true);

// ============================================================================
// CHUNKED MESSAGE BUFFER (COMPLETO - CONSERVADO)
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
                it = active_buffers.erase(it);
            } else ++it;
        }
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

void write_socket(socket_t sock, const std::string& s) {
    if (sock == INVALID_SOCK) return;
    uint32_t len = static_cast<uint32_t>(s.size());
    send(sock, reinterpret_cast<const char*>(&len), 4, 0);
    send(sock, s.c_str(), len, 0);
}

void write_to_service(const std::string& s) {
    socket_t sock = service_socket.load();
    if (sock != INVALID_SOCK) {
        write_socket(sock, s);
    }
}

// ============================================================================
// LÓGICA DE PROCESAMIENTO (CHROME -> HOST)
// ============================================================================
json process_chrome_message(const json& msg) {
    // 1. CHUNKING LOGIC (CONSERVADO)
    if (msg.contains("bloom_chunk")) {
        auto result = g_chunked_buffer.process_chunk(msg);
        std::string msg_id = msg["bloom_chunk"].value("message_id", "unknown");

        if (result == ChunkedMessageBuffer::INCOMPLETE) {
            return {{"ok", true}, {"status", "chunk_accepted"}};
        } else if (result == ChunkedMessageBuffer::COMPLETE_VALID) {
            std::string full_content = g_chunked_buffer.get_and_clear(msg_id);
            g_logger.info("Message assembled. Forwarding to Brain Service...");
            
            write_to_service(full_content);
            return {{"ok", true}, {"status", "assembled_and_forwarded"}};
        } else if (result == ChunkedMessageBuffer::COMPLETE_INVALID_CHECKSUM) {
            g_logger.error("Chunk assembly failed: Invalid checksum");
            return {{"ok", false}, {"error", "invalid_checksum"}};
        } else {
            return {{"ok", false}, {"error", "chunk_process_failed"}};
        }
    }

    // 2. HANDSHAKE FIX (SYSTEM_HELLO) - CONSERVADO
    if (msg.contains("type") && msg["type"] == "SYSTEM_HELLO") {
        json ready = {
            {"command", "system_ready"},
            {"status", "connected"},
            {"host_version", VERSION},
            {"host_build", BUILD}
        };
        
        // Informar también al servicio
        write_to_service(msg.dump());
        
        return ready;
    }

    // 3. PING INTERNO CHROME - CONSERVADO
    std::string cmd = msg.value("command", "");
    if (cmd == "ping") {
        return {{"command", "pong"}, {"ok", true}, {"source", "host"}};
    }

    // 4. REENVÍO AL SERVICIO
    write_to_service(msg.dump());
    return {}; // No responder a Chrome, esperar respuesta del servicio
}

// ============================================================================
// LÓGICA DE PROCESAMIENTO (SERVICIO -> HOST)
// ============================================================================
bool process_service_message(const std::string& raw_json) {
    try {
        auto msg = json::parse(raw_json);
        std::string cmd = msg.value("command", "");

        // TCP PING: Responder directamente al servicio
        if (cmd == "ping") {
            json pong = {
                {"command", "pong"},
                {"status", "pong"},
                {"version", VERSION},
                {"ok", true}
            };
            write_to_service(pong.dump());
            return true;
        }

        // Todo lo demás -> Reenviar a Chrome
        write_message_to_chrome(raw_json);
        return true;

    } catch (const std::exception& e) {
        g_logger.error(std::string("Error processing service message: ") + e.what());
        return false;
    }
}

// ============================================================================
// TCP CLIENT LOOP (NUEVA ARQUITECTURA)
// ============================================================================
void tcp_client_loop() {
    g_logger.info("TCP Client loop started");
    
    while (!shutdown_requested.load()) {
        g_logger.info("Attempting to connect to Brain Service...");
        
        socket_t sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock == INVALID_SOCK) {
            std::this_thread::sleep_for(std::chrono::milliseconds(RECONNECT_DELAY_MS));
            continue;
        }

        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(SERVICE_PORT);
        addr.sin_addr.s_addr = inet_addr("127.0.0.1");

        if (connect(sock, (sockaddr*)&addr, sizeof(addr)) < 0) {
            g_logger.info("Brain Service not available, retrying...");
            close_socket(sock);
            std::this_thread::sleep_for(std::chrono::milliseconds(RECONNECT_DELAY_MS));
            continue;
        }

        g_logger.info("✅ Connected to Brain Service!");
        service_socket.store(sock);

        // Handshake inicial: Identificarse ante el servicio
        json identity = {
            {"type", "REGISTER_HOST"},
            #ifdef _WIN32
            {"pid", (int)GetCurrentProcessId()},
            #else
            {"pid", (int)getpid()},
            #endif
            {"version", VERSION},
            {"build", BUILD}
        };
        write_to_service(identity.dump());

        // Loop de lectura (Recibir órdenes del Servicio -> Chrome)
        while (!shutdown_requested.load()) {
            char len_buf[4];
            int ret = recv(sock, len_buf, 4, 0);
            if (ret <= 0) {
                g_logger.error("Lost connection to Brain Service");
                break;
            }

            uint32_t msg_len = *reinterpret_cast<uint32_t*>(len_buf);
            if (msg_len > MAX_MESSAGE_SIZE) {
                g_logger.error("Message too large from service");
                break;
            }

            std::vector<char> msg_buf(msg_len);
            int total_received = 0;
            while (total_received < (int)msg_len) {
                int ret_body = recv(sock, msg_buf.data() + total_received, msg_len - total_received, 0);
                if (ret_body <= 0) break;
                total_received += ret_body;
            }
            
            if (total_received != (int)msg_len) {
                g_logger.error("Incomplete message from service");
                break;
            }

            std::string msg_str(msg_buf.begin(), msg_buf.end());
            process_service_message(msg_str);
        }

        g_logger.info("Disconnected from Brain Service. Reconnecting...");
        service_socket.store(INVALID_SOCK);
        close_socket(sock);
        std::this_thread::sleep_for(std::chrono::milliseconds(1000));
    }
    
    g_logger.info("TCP Client loop terminated");
}

// ============================================================================
// CHROME LOOP (CONSERVADO)
// ============================================================================
void chrome_loop() {
#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif

    g_logger.info("Chrome loop started");

    while (!shutdown_requested.load()) {
        char len_buf[4];
        if (!std::cin.read(len_buf, 4)) break;

        uint32_t msg_len = *reinterpret_cast<uint32_t*>(len_buf);
        if (msg_len > 10 * 1024 * 1024) {
            g_logger.error("Message too large from Chrome");
            continue;
        }

        std::vector<char> msg_buf(msg_len);
        if (!std::cin.read(msg_buf.data(), msg_len)) break;

        std::string msg_str(msg_buf.begin(), msg_buf.end());
        last_chrome_activity.store(std::time(nullptr));

        try {
            auto json_msg = json::parse(msg_str);
            auto response = process_chrome_message(json_msg);
            
            // Solo responder a Chrome si hay respuesta inmediata
            // (handshakes, chunks, pings locales)
            if (!response.empty()) {
                write_message_to_chrome(response.dump());
            }
        } catch (const std::exception& e) {
            g_logger.error(std::string("Error parsing Chrome message: ") + e.what());
        }
    }
    
    g_logger.info("Chrome loop terminated");
    shutdown_requested.store(true);
}

// ============================================================================
// MAIN
// ============================================================================
int main() {
#ifdef _WIN32
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
        g_logger.error("WSAStartup failed");
        return 1;
    }
#endif

    g_logger.info("Bloom Host Client starting...");
    g_logger.info(std::string("Version: ") + VERSION + " Build: " + std::to_string(BUILD));

    // Thread de limpieza de chunks (CONSERVADO)
    std::thread cleanup_thread([]() {
        while (!shutdown_requested.load()) {
            std::this_thread::sleep_for(std::chrono::minutes(1));
            g_chunked_buffer.cleanup_expired();
        }
    });

    // Thread Cliente TCP (Conecta al Servicio)
    std::thread client_thread(tcp_client_loop);

    // Thread Principal (Atiende a Chrome) - BLOQUEANTE
    chrome_loop();

    // Shutdown
    g_logger.info("Shutting down...");
    shutdown_requested.store(true);
    
    if (cleanup_thread.joinable()) cleanup_thread.join();
    if (client_thread.joinable()) client_thread.join();

#ifdef _WIN32
    WSACleanup();
#endif
    
    g_logger.info("Bloom Host Client terminated");
    return 0;
}