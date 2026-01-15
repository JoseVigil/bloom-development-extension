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
    #include <shlobj.h>   // Para SHGetFolderPathA
    #include <direct.h>   // Para _mkdir
    #include <io.h>       // Para _setmode
    #include <fcntl.h>
    #include <process.h>  // Para _getpid

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

const std::string VERSION = "1.4.5";
const int BUILD = 14;
const int SERVICE_PORT = 5678;
const size_t MAX_ACTIVE_BUFFERS = 15;
const size_t MAX_MESSAGE_SIZE = 50 * 1024 * 1024; 
const int RECONNECT_DELAY_MS = 2000;

std::atomic<socket_t> service_socket{INVALID_SOCK};
std::mutex stdout_mutex;
std::atomic<bool> shutdown_requested{false};
std::string g_profile_id = "";

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
        // Usamos la API de Windows para encontrar Local AppData
        if (SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path) >= 0) {
            std::string base = std::string(path) + "\\BloomNucleus";
            _mkdir(base.c_str());
            std::string logs = base + "\\logs";
            _mkdir(logs.c_str());
            log_file.open(logs + "\\host_client.log", std::ios::app);
        }
#else
        std::string base = "/tmp/bloom-nucleus";
        mkdir(base.c_str(), 0755);
        std::string logs = base + "/logs";
        mkdir(logs.c_str(), 0755);
        log_file.open(logs + "/host_client.log", std::ios::app);
#endif
    }

    void log(const std::string& level, const std::string& msg) {
        std::lock_guard<std::mutex> lock(log_mutex);
        if (!log_file.is_open()) return;
        auto now = std::chrono::system_clock::now();
        auto now_t = std::chrono::system_clock::to_time_t(now);
        auto now_ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()) % 1000;
        log_file << "[" << std::put_time(std::localtime(&now_t), "%Y-%m-%d %H:%M:%S") 
                 << "." << std::setfill('0') << std::setw(3) << now_ms.count() << "] "
                 << "[" << level << "] " << msg << std::endl;
        log_file.flush();
    }
    void info(const std::string& msg) { log("INFO", msg); }
    void error(const std::string& msg) { log("ERROR", msg); }
};

Logger g_logger;

// ============================================================================
// CHUNKED MESSAGE BUFFER (Restaurado Completo)
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
            InProgressMessage ipm;
            ipm.total_chunks = chunk.value("total_chunks", 0);
            ipm.received_chunks = 0;
            ipm.expected_size = chunk.value("total_size_bytes", 0);
            ipm.buffer.reserve(ipm.expected_size);
            active_buffers[msg_id] = std::move(ipm);
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
            if (computed != chunk.value("checksum_verify", "")) return COMPLETE_INVALID_CHECKSUM;
            out_complete_msg = std::string(it->second.buffer.begin(), it->second.buffer.end());
            active_buffers.erase(it);
            return COMPLETE_VALID;
        }
        return CHUNK_ERROR;
    }
};

ChunkedMessageBuffer g_chunked_buffer;

// ============================================================================
// HELPERS
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

void handle_chrome_message(const std::string& msg_str) {
    g_logger.info(">>> FROM CHROME: " + msg_str);
    try {
        auto msg = json::parse(msg_str);
        if (msg.contains("bloom_chunk")) {
            std::string assembled;
            auto res = g_chunked_buffer.process_chunk(msg, assembled);
            if (res == ChunkedMessageBuffer::COMPLETE_VALID) write_to_service(assembled);
            return;
        }
        if (msg.value("type", "") == "SYSTEM_HELLO") {
	    json ready = {
    		{"type", "SYSTEM_ACK"},
    		{"command", "system_ready"},
    		{"payload", {
        		{"status", "connected"},
        		{"host_version", VERSION},
        		{"profile_id", g_profile_id.empty() ? "active_worker" : g_profile_id}
    		}}
	    };
            write_message_to_chrome(ready.dump());
            write_to_service(msg_str);
            return;
        }
        write_to_service(msg_str);
    } catch (...) { g_logger.error("JSON Error processing Chrome message"); }
}

// ============================================================================
// TCP CLIENT
// ============================================================================
void tcp_client_loop() {
    while (!shutdown_requested.load()) {
        socket_t sock = socket(AF_INET, SOCK_STREAM, 0);
        if (sock == INVALID_SOCK) { std::this_thread::sleep_for(std::chrono::milliseconds(2000)); continue; }
        
        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(SERVICE_PORT);
        addr.sin_addr.s_addr = inet_addr("127.0.0.1");

        if (connect(sock, (sockaddr*)&addr, sizeof(addr)) < 0) {
            close_socket(sock);
            std::this_thread::sleep_for(std::chrono::milliseconds(2000));
            continue;
        }

        g_logger.info("+++ CONNECTED TO BRAIN SERVICE");
        service_socket.store(sock);

        json reg = {{"type", "REGISTER_HOST"}, {"pid", (int)get_pid_internal()}, {"profile_id", g_profile_id}};
        write_to_service(reg.dump());

        while (!shutdown_requested.load()) {
            uint32_t net_len;
            if (recv(sock, (char*)&net_len, 4, 0) <= 0) break;
            uint32_t len = ntohl(net_len);
            std::vector<char> buf(len);
            int rec = 0;
            while (rec < (int)len) {
                int r = recv(sock, buf.data() + rec, len - rec, 0);
                if (r <= 0) break;
                rec += r;
            }
            if (rec == (int)len) {
                std::string b_msg(buf.begin(), buf.end());
                g_logger.info("<<< FROM BRAIN: " + b_msg);
                write_message_to_chrome(b_msg);
            }
        }
        service_socket.store(INVALID_SOCK);
        close_socket(sock);
    }
}

// ============================================================================
// MAIN
// ============================================================================
int main(int argc, char* argv[]) {
#ifdef _WIN32
    WSADATA wsa; WSAStartup(MAKEWORD(2, 2), &wsa);
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
    _setmode(_fileno(stderr), _O_BINARY);
#endif

    for (int i = 0; i < argc; i++) {
        std::string arg = argv[i];
        if (arg.length() >= 36 && arg.find("-") != std::string::npos) {
            g_profile_id = arg;
            break;
        }
    } 
   
    g_logger.info("=== Bloom Host Starting ===");
    g_logger.info("Detected Profile ID: " + (g_profile_id.empty() ? "UNKNOWN" : g_profile_id));

    std::thread t(tcp_client_loop);

    while (!shutdown_requested.load()) {
        uint32_t len = 0;
        if (!std::cin.read((char*)&len, 4)) break;
        if (len == 0 || len > MAX_MESSAGE_SIZE) continue;
        std::vector<char> buf(len);
        if (!std::cin.read(buf.data(), len)) break;
        handle_chrome_message(std::string(buf.begin(), buf.end()));
    }

    shutdown_requested.store(true);
    if (t.joinable()) t.join();
#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}
