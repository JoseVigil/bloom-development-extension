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
    #include <tlhelp32.h>
    #include <shlobj.h>
    #include <direct.h>
    #include <io.h>
    #include <fcntl.h>
    #include <process.h> // Necesario para _getpid()

    typedef SOCKET socket_t;
    #define INVALID_SOCK INVALID_SOCKET
    #define close_socket closesocket
    #define mkdir_p(path) _mkdir(path)
    #define get_pid_internal _getpid
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
    #define get_pid_internal getpid
#endif

#include <nlohmann/json.hpp>
#include <openssl/sha.h>

using json = nlohmann::json;

// --- CONFIGURACIÓN ---
const std::string VERSION = "1.4.3";
const int BUILD = 12;
const int SERVICE_PORT = 5678;
const size_t MAX_ACTIVE_BUFFERS = 15;
const size_t MAX_MESSAGE_SIZE = 50 * 1024 * 1024; // 50MB
const int RECONNECT_DELAY_MS = 2000;

// --- GLOBALES ---
std::atomic<socket_t> service_socket{INVALID_SOCK};
std::mutex stdout_mutex;
std::atomic<bool> shutdown_requested{false};
std::string g_profile_id = "";

// ============================================================================
// LOGGER FORENSE (Escritura inmediata a disco)
// ============================================================================
class Logger {
private:
    std::ofstream log_file;
    std::mutex log_mutex;
public:
    Logger() {
#ifdef _WIN32
        char path[MAX_PATH];
        if (SUCCEEDED(SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path))) {
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
        log_file << "[" << std::put_time(std::localtime(&now_t), "%H:%M:%S") << "." << std::setfill('0') << std::setw(3) << now_ms.count() << "] [" << level << "] " << msg << std::endl;
        log_file.flush();
    }
    void info(const std::string& msg) { log("INFO", msg); }
    void error(const std::string& msg) { log("ERROR", msg); }
};

Logger g_logger;

// ============================================================================
// DETECCIÓN DE PROFILE ID
// ============================================================================
std::string extract_profile_id_from_cmdline() {
#ifdef _WIN32
    char cwd[MAX_PATH];
    if (GetCurrentDirectoryA(MAX_PATH, cwd) > 0) {
        std::string path(cwd);
        size_t pos = path.find("\\User Data\\");
        if (pos != std::string::npos) {
            std::string after = path.substr(pos + 11);
            size_t next = after.find("\\");
            if (next != std::string::npos) {
                std::string candidate = after.substr(0, next);
                if (candidate == "Default" || candidate.find("Profile ") == 0) return candidate;
            }
        }
        pos = path.find("\\profiles\\");
        if (pos != std::string::npos) {
            std::string after = path.substr(pos + 10);
            size_t next = after.find("\\");
            if (next != std::string::npos) return after.substr(0, next);
            return after;
        }
    }
#endif
    return "pid_" + std::to_string(get_pid_internal());
}

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
        auto it = active_buffers.find(msg_id);
        if (it == active_buffers.end()) return CHUNK_ERROR;
        auto& ipm = it->second;
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
            active_buffers.erase(it);
            return COMPLETE_VALID;
        }
        return CHUNK_ERROR;
    }
};

ChunkedMessageBuffer g_chunked_buffer;

// ============================================================================
// HELPERS E/S
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

void handle_chrome_message(const std::string& msg_str) {
    g_logger.info(">>> FROM CHROME: " + msg_str);
    try {
        auto msg = json::parse(msg_str);
        if (msg.contains("bloom_chunk")) {
            std::string assembled;
            auto res = g_chunked_buffer.process_chunk(msg, assembled);
            if (res == ChunkedMessageBuffer::COMPLETE_VALID) {
                g_logger.info("Message fully assembled.");
                write_to_service(assembled);
            }
            return;
        }
        if (msg.value("type", "") == "SYSTEM_HELLO") {
            g_logger.info("Handshake Request Received");
            if (g_profile_id.empty()) g_profile_id = extract_profile_id_from_cmdline();
            json ready = {
                {"type", "SYSTEM_ACK"},         
                {"command", "system_ready"},
                {"payload", {                   
                    {"status", "connected"},
                    {"host_version", VERSION},
                    {"build", BUILD},
                    {"profile_id", g_profile_id}
                }}
            };
            std::string resp = ready.dump();
            g_logger.info("<<< TO CHROME (ACK): " + resp);
            write_message_to_chrome(resp);
            write_to_service(msg_str);
            return;
        }
        write_to_service(msg_str);
    } catch (const std::exception& e) {
        g_logger.error("JSON Error: " + std::string(e.what()));
    }
}

// ============================================================================
// TCP CLIENT LOOP
// ============================================================================
void tcp_client_loop() {
    g_logger.info("TCP Loop: Thread started.");
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
        if (connect(sock, (sockaddr*)&addr, sizeof(addr)) < 0) {
            close_socket(sock);
            std::this_thread::sleep_for(std::chrono::milliseconds(RECONNECT_DELAY_MS));
            continue;
        }
        g_logger.info("+++ CONNECTED TO BRAIN SERVICE");
        service_socket.store(sock);
        json reg = {
            {"type", "REGISTER_HOST"},
            {"pid", (int)get_pid_internal()}, // Corrección aquí
            {"profile_id", g_profile_id},
            {"version", VERSION}
        };
        write_to_service(reg.dump());
        while (!shutdown_requested.load()) {
            uint32_t network_len;
            int ret = recv(sock, (char*)&network_len, 4, 0);
            if (ret <= 0) break;
            uint32_t msg_len = ntohl(network_len);
            if (msg_len > MAX_MESSAGE_SIZE) break;
            std::vector<char> buffer(msg_len);
            int received = 0;
            while (received < (int)msg_len) {
                int r = recv(sock, buffer.data() + received, msg_len - received, 0);
                if (r <= 0) break;
                received += r;
            }
            if (received == (int)msg_len) {
                std::string brain_msg(buffer.begin(), buffer.end());
                g_logger.info("<<< FROM BRAIN: " + brain_msg);
                write_message_to_chrome(brain_msg);
            }
        }
        g_logger.error("!!! DISCONNECTED FROM BRAIN.");
        service_socket.store(INVALID_SOCK);
        close_socket(sock);
    }
}

int main(int argc, char* argv[]) {
#ifdef _WIN32
    // 1. Inicialización de Entorno Windows
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 1;
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif

    // 2. CAPTURA INTELIGENTE DEL PROFILE ID
    // Buscamos en todos los argumentos que nos manda Chrome
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];

        // Caso A: El flag y el valor están separados ("--profile-id", "UUID")
        if (arg == "--profile-id" && i + 1 < argc) {
            g_profile_id = argv[i + 1];
            break;
        }
        // Caso B: Están juntos por un igual ("--profile-id=UUID")
        if (arg.find("--profile-id=") == 0) {
            g_profile_id = arg.substr(13);
            break;
        }
    }

    // FALLBACK: Si sigue vacío, buscamos cualquier argumento largo (los UUID tienen 36 caracteres)
    if (g_profile_id.empty()) {
        for (int i = 1; i < argc; i++) {
            std::string arg = argv[i];
            // Si tiene longitud de UUID y no es la URL de la extensión
            if (arg.length() >= 32 && arg.find("://") == std::string::npos) {
                g_profile_id = arg;
                break;
            }
        }
    }

    // 3. LOG DE ARRANQUE (Aparecerá en host_client.log)
    g_logger.info("=== Bloom Host v" + VERSION + " Starting ===");
    g_logger.info("Detected Profile ID: " + (g_profile_id.empty() ? "UNKNOWN" : g_profile_id));
    
    // Logueamos los argumentos crudos para diagnosticar si vuelve a fallar
    std::string full_cmd = "";
    for(int i=0; i<argc; i++) full_cmd += std::string(argv[i]) + " ";
    g_logger.info("Full Command Line: " + full_cmd);

    // 4. INICIO DE THREAD DE COMUNICACIÓN CON BRAIN (PYTHON)
    std::thread client_thread(tcp_client_loop);

    // 5. LOOP PRINCIPAL DE LECTURA (Desde Chrome)
    while (!shutdown_requested.load()) {
        uint32_t msg_len = 0;
        // Leemos los primeros 4 bytes (tamaño del mensaje)
        if (!std::cin.read(reinterpret_cast<char*>(&msg_len), 4)) {
            if (std::cin.eof()) break;
            continue;
        }

        if (msg_len == 0 || msg_len > MAX_MESSAGE_SIZE) continue;

        // Leemos el cuerpo del mensaje JSON
        std::vector<char> buffer(msg_len);
        if (!std::cin.read(buffer.data(), msg_len)) break;

        // Procesamos el mensaje
        handle_chrome_message(std::string(buffer.begin(), buffer.end()));
    }

    // 6. CIERRE ORDENADO
    g_logger.info("Shutting down host process...");
    shutdown_requested.store(true);

    socket_t sock = service_socket.load();
    if (sock != INVALID_SOCK) close_socket(sock);

    if (client_thread.joinable()) client_thread.join();

#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}
