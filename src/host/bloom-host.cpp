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
#include <nlohmann/json.hpp>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <shlobj.h>
#include <direct.h>
#pragma comment(lib, "ws2_32.lib")
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

// ============================================================================
// LOGGER
// ============================================================================
class Logger {
private:
    std::string log_dir;
    std::ofstream log_file;
    std::mutex log_mutex;
    bool enabled;

    std::string get_timestamp() {
        auto now = std::chrono::system_clock::now();
        auto time = std::chrono::system_clock::to_time_t(now);
        std::stringstream ss;
        ss << std::put_time(std::localtime(&time), "%Y-%m-%d %H:%M:%S");
        return ss.str();
    }

    void create_log_dir() {
#ifdef _WIN32
        char path[MAX_PATH];
        if (SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path) == S_OK) {
            log_dir = std::string(path) + "\\BloomNucleus\\logs";
            mkdir_p((std::string(path) + "\\BloomNucleus").c_str());
            mkdir_p(log_dir.c_str());
        }
#else
        log_dir = "/tmp/bloom-nucleus-logs";
        mkdir_p(log_dir.c_str());
#endif
    }

public:
    Logger(bool enable = true) : enabled(enable) {
        if (enabled) {
            create_log_dir();
            std::string filename = log_dir + "/bloom-host.log";
            log_file.open(filename, std::ios::app);
        }
    }

    ~Logger() {
        if (log_file.is_open()) log_file.close();
    }

    void log(const std::string& level, const std::string& msg) {
        if (!enabled) return;
        std::lock_guard<std::mutex> lock(log_mutex);
        std::string line = "[" + get_timestamp() + "] [" + level + "] " + msg + "\n";
        if (log_file.is_open()) {
            log_file << line;
            log_file.flush();
        }
    }

    void info(const std::string& msg) { log("INFO", msg); }
    void error(const std::string& msg) { log("ERROR", msg); }
    void debug(const std::string& msg) { log("DEBUG", msg); }
};

// ============================================================================
// PROTOCOL HELPERS
// ============================================================================
uint32_t read_size(std::istream& in) {
    uint32_t size = 0;
    in.read(reinterpret_cast<char*>(&size), 4);
    return (in.gcount() == 4) ? size : 0;
}

std::string read_payload(std::istream& in, uint32_t size) {
    std::string msg(size, '\0');
    if (size > 0) in.read(&msg[0], size);
    return msg;
}

void write_message(std::ostream& out, const std::string& s, std::mutex& mut) {
    std::lock_guard<std::mutex> lock(mut);
    uint32_t len = static_cast<uint32_t>(s.size());
    out.write(reinterpret_cast<const char*>(&len), 4);
    out.write(s.c_str(), len);
    out.flush();
}

uint32_t read_size_socket(socket_t sock) {
    uint32_t size = 0;
    int ret = recv(sock, reinterpret_cast<char*>(&size), 4, 0);
    return (ret == 4) ? size : 0;
}

std::string read_payload_socket(socket_t sock, uint32_t size) {
    std::string msg(size, '\0');
    int ret = recv(sock, &msg[0], size, 0);
    return (ret == static_cast<int>(size)) ? msg : "";
}

void write_socket(socket_t sock, const std::string& s) {
    uint32_t len = static_cast<uint32_t>(s.size());
    send(sock, reinterpret_cast<const char*>(&len), 4, 0);
    send(sock, s.c_str(), len, 0);
}

// ============================================================================
// MESSAGE ROUTER
// ============================================================================
class MessageRouter {
private:
    std::atomic<socket_t> vscode_socket{INVALID_SOCK};
    std::mutex output_mutex;
    Logger& logger;

public:
    MessageRouter(Logger& log) : logger(log) {}

    void set_vscode_socket(socket_t sock) {
        vscode_socket.store(sock);
        logger.info("VSCode connected");
    }

    void clear_vscode_socket() {
        vscode_socket.store(INVALID_SOCK);
        logger.info("VSCode disconnected");
    }

    json process_chrome_message(const json& msg) {
        logger.debug("Processing Chrome message: " + msg.dump().substr(0, 100));

        if (msg.contains("command")) {
            std::string cmd = msg["command"];

            // Handle local commands
            if (cmd == "save_artifact") {
                return handle_save(msg);
            } else if (cmd == "read_file") {
                return handle_read(msg);
            }

            // Forward to VSCode
            socket_t sock = vscode_socket.load();
            if (sock != INVALID_SOCK) {
                write_socket(sock, msg.dump());
                return {{"ok", true}, {"forwarded", true}};
            } else {
                return {{"ok", false}, {"error", {{"type", "NO_VSCODE"}, {"message", "VSCode not connected"}}}};
            }
        }

        return {{"ok", false}, {"error", {{"type", "INVALID_COMMAND"}, {"message", "Unknown command"}}}};
    }

    void forward_to_chrome(const json& msg) {
        write_message(std::cout, msg.dump(), output_mutex);
        logger.debug("Forwarded to Chrome: " + msg.dump().substr(0, 100));
    }

private:
    json handle_save(const json& msg) {
        try {
            std::string filename = msg.value("filename", "artifact.html");
            std::string content = msg.value("content", "");
            std::ofstream out(filename, std::ios::binary);
            out << content;
            out.close();
            logger.info("Saved file: " + filename);
            return {{"ok", true}, {"path", filename}};
        } catch (const std::exception& e) {
            logger.error("Save failed: " + std::string(e.what()));
            return {{"ok", false}, {"error", {{"type", "SAVE_ERROR"}, {"message", e.what()}}}};
        }
    }

    json handle_read(const json& msg) {
        try {
            std::string filename = msg.value("filename", "");
            std::ifstream in(filename, std::ios::binary | std::ios::ate);
            if (!in) {
                return {{"ok", false}, {"error", {{"type", "FILE_NOT_FOUND"}, {"message", "Cannot open file"}}}};
            }
            auto fsize = in.tellg();
            in.seekg(0);
            std::string content(static_cast<size_t>(fsize), '\0');
            in.read(&content[0], fsize);
            logger.info("Read file: " + filename);
            return {{"ok", true}, {"content", content}};
        } catch (const std::exception& e) {
            logger.error("Read failed: " + std::string(e.what()));
            return {{"ok", false}, {"error", {{"type", "READ_ERROR"}, {"message", e.what()}}}};
        }
    }
};

// ============================================================================
// MODE: NATIVE (Chrome, ephemeral)
// ============================================================================
void native_mode(Logger& logger) {
    logger.info("Starting NATIVE mode (Chrome stdin/stdout)");

    uint32_t size = read_size(std::cin);
    if (size == 0) {
        logger.error("Invalid message size");
        return;
    }

    std::string msg = read_payload(std::cin, size);
    if (msg.empty()) {
        logger.error("Empty message");
        return;
    }

    try {
        auto j = json::parse(msg);
        logger.debug("Received: " + j.dump().substr(0, 100));

        // Try connecting to server
        socket_t sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (sock != INVALID_SOCK) {
            sockaddr_in addr{};
            addr.sin_family = AF_INET;
            addr.sin_port = htons(5678);
            addr.sin_addr.s_addr = inet_addr("127.0.0.1");

            if (connect(sock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == 0) {
                // Forward to server
                write_socket(sock, j.dump());
                logger.info("Forwarded to server");

                // Wait for response
                uint32_t resp_size = read_size_socket(sock);
                if (resp_size > 0) {
                    std::string resp = read_payload_socket(sock, resp_size);
                    std::cout.write(reinterpret_cast<const char*>(&resp_size), 4);
                    std::cout.write(resp.c_str(), resp_size);
                    std::cout.flush();
                }
                close_socket(sock);
                return;
            }
            close_socket(sock);
        }

        // Server not available - handle locally
        logger.info("Server not available, handling locally");
        MessageRouter router(logger);
        json response = router.process_chrome_message(j);
        std::string resp_str = response.dump();
        uint32_t resp_size = static_cast<uint32_t>(resp_str.size());
        std::cout.write(reinterpret_cast<const char*>(&resp_size), 4);
        std::cout.write(resp_str.c_str(), resp_size);
        std::cout.flush();

    } catch (const std::exception& e) {
        logger.error("Parse error: " + std::string(e.what()));
        json err = {{"ok", false}, {"error", {{"type", "PARSE_ERROR"}, {"message", e.what()}}}};
        std::string err_str = err.dump();
        uint32_t err_size = static_cast<uint32_t>(err_str.size());
        std::cout.write(reinterpret_cast<const char*>(&err_size), 4);
        std::cout.write(err_str.c_str(), err_size);
        std::cout.flush();
    }
}

// ============================================================================
// MODE: SERVER (VSCode, persistent)
// ============================================================================
void handle_client(socket_t client, MessageRouter& router, Logger& logger) {
    router.set_vscode_socket(client);

    while (true) {
        uint32_t size = read_size_socket(client);
        if (size == 0) break;

        std::string msg = read_payload_socket(client, size);
        if (msg.empty()) break;

        try {
            auto j = json::parse(msg);
            logger.debug("VSCode message: " + j.dump().substr(0, 100));

            // Process and potentially forward to Chrome
            router.forward_to_chrome(j);

        } catch (const std::exception& e) {
            logger.error("VSCode parse error: " + std::string(e.what()));
            json err = {{"ok", false}, {"error", {{"type", "PARSE_ERROR"}, {"message", e.what()}}}};
            write_socket(client, err.dump());
        }
    }

    router.clear_vscode_socket();
    close_socket(client);
}

void server_mode(Logger& logger) {
    logger.info("Starting SERVER mode (TCP:5678)");

    socket_t listen_sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (listen_sock == INVALID_SOCK) {
        logger.error("Cannot create socket");
        return;
    }

    int opt = 1;
    setsockopt(listen_sock, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&opt), sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(5678);
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    if (bind(listen_sock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
        logger.error("Bind failed");
        close_socket(listen_sock);
        return;
    }

    if (listen(listen_sock, SOMAXCONN) != 0) {
        logger.error("Listen failed");
        close_socket(listen_sock);
        return;
    }

    logger.info("Server listening on 127.0.0.1:5678");
    MessageRouter router(logger);

    while (true) {
        socket_t client = accept(listen_sock, nullptr, nullptr);
        if (client == INVALID_SOCK) {
            logger.error("Accept failed");
            break;
        }
        logger.info("Client connected");
        std::thread([client, &router, &logger]() {
            handle_client(client, router, logger);
        }).detach();
    }

    close_socket(listen_sock);
}

// ============================================================================
// MAIN
// ============================================================================
int main(int argc, char* argv[]) {
#ifdef _WIN32
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 1;
#endif

    bool server = false;
    bool native = false;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--server") server = true;
        if (arg == "--native") native = true;
    }

    Logger logger(server); // Only log in server mode

    if (server) {
        server_mode(logger);
    } else {
        native_mode(logger);
    }

#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}