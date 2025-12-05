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

// Version info
const std::string VERSION = "1.0.0";
const int BUILD = 1;
const int PROTOCOL = 1;

// Port range for fallback
const int BASE_PORT = 5678;
const int MAX_PORT_ATTEMPTS = 20;

// ============================================================================
// FILE SYSTEM UTILS
// ============================================================================
std::string get_app_data_path() {
#ifdef _WIN32
    char path[MAX_PATH];
    if (SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, path) == S_OK) {
        return std::string(path) + "\\BloomNucleus";
    }
    return "C:\\BloomNucleus";
#else
    return "/tmp/bloom-nucleus";
#endif
}

void ensure_directory(const std::string& path) {
    mkdir_p(path.c_str());
}

// ============================================================================
// LOGGER WITH ROTATION
// ============================================================================
class Logger {
private:
    std::string log_dir;
    std::ofstream log_file;
    std::mutex log_mutex;
    bool enabled;
    size_t max_size = 5 * 1024 * 1024; // 5MB
    int max_files = 10;

    std::string get_timestamp() {
        auto now = std::chrono::system_clock::now();
        auto time = std::chrono::system_clock::to_time_t(now);
        std::stringstream ss;
        ss << std::put_time(std::localtime(&time), "%Y-%m-%d %H:%M:%S");
        return ss.str();
    }

    std::string get_log_filename() {
        auto now = std::chrono::system_clock::now();
        auto time = std::chrono::system_clock::to_time_t(now);
        std::stringstream ss;
        ss << std::put_time(std::localtime(&time), "server-%Y%m%d-%H%M.log");
        return ss.str();
    }

    void rotate_if_needed() {
        if (!log_file.is_open()) return;
        
        auto pos = log_file.tellp();
        if (pos > static_cast<std::streamoff>(max_size)) {
            log_file.close();
            std::string new_filename = log_dir + "/" + get_log_filename();
            log_file.open(new_filename, std::ios::app);
        }
    }

    void create_log_dir() {
        std::string base = get_app_data_path();
        ensure_directory(base);
        log_dir = base + "/logs";
        ensure_directory(log_dir);
    }

public:
    Logger(bool enable = true) : enabled(enable) {
        if (enabled) {
            create_log_dir();
            std::string filename = log_dir + "/" + get_log_filename();
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
            rotate_if_needed();
        }
    }

    void info(const std::string& msg) { log("INFO", msg); }
    void error(const std::string& msg) { log("ERROR", msg); }
    void debug(const std::string& msg) { log("DEBUG", msg); }
    void warn(const std::string& msg) { log("WARN", msg); }
};

// ============================================================================
// STATE FILE MANAGER
// ============================================================================
class StateManager {
private:
    std::string state_file;
    std::mutex state_mutex;

public:
    StateManager() {
        std::string base = get_app_data_path();
        std::string state_dir = base + "/state";
        ensure_directory(base);
        ensure_directory(state_dir);
        state_file = state_dir + "/server.json";
    }

    void write_state(int port, const std::string& status) {
        std::lock_guard<std::mutex> lock(state_mutex);
        json state = {
            {"port", port},
            {"status", status},
            {"version", VERSION},
            {"build", BUILD},
            {"protocol", PROTOCOL},
            {"timestamp", std::time(nullptr)}
        };
        std::ofstream out(state_file);
        out << state.dump(2);
        out.close();
    }

    json read_state() {
        std::lock_guard<std::mutex> lock(state_mutex);
        std::ifstream in(state_file);
        if (!in) return json::object();
        json state;
        in >> state;
        return state;
    }

    void clear_state() {
        std::lock_guard<std::mutex> lock(state_mutex);
        std::remove(state_file.c_str());
    }
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
    std::atomic<bool> shutdown_requested{false};

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

    bool should_shutdown() { return shutdown_requested.load(); }

    json process_message(const json& msg) {
        logger.debug("Processing message: " + msg.dump().substr(0, 100));

        if (!msg.contains("command")) {
            return {{"ok", false}, {"error", {{"type", "INVALID_COMMAND"}, {"message", "Missing command"}}}};
        }

        std::string cmd = msg["command"];

        // Handle control commands
        if (cmd == "shutdown") {
            shutdown_requested.store(true);
            logger.info("Shutdown requested");
            return {{"ok", true}, {"message", "Shutting down"}};
        }

        if (cmd == "ping") {
            return {
                {"ok", true}, 
                {"version", VERSION}, 
                {"build", BUILD}, 
                {"protocol", PROTOCOL}
            };
        }

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
// PORT MANAGER
// ============================================================================
int find_available_port(Logger& logger, int preferred_port = BASE_PORT) {
    for (int attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
        int port = preferred_port + attempt;
        
        socket_t test_sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (test_sock == INVALID_SOCK) continue;

        int opt = 1;
        setsockopt(test_sock, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&opt), sizeof(opt));

        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(port);
        addr.sin_addr.s_addr = inet_addr("127.0.0.1");

        if (bind(test_sock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == 0) {
            close_socket(test_sock);
            logger.info("Found available port: " + std::to_string(port));
            return port;
        }

        close_socket(test_sock);
        logger.warn("Port " + std::to_string(port) + " in use, trying next");
    }

    logger.error("No available ports in range " + std::to_string(preferred_port) + 
                 "-" + std::to_string(preferred_port + MAX_PORT_ATTEMPTS - 1));
    return -1;
}

// ============================================================================
// MODE: NATIVE (Chrome, ephemeral)
// ============================================================================
void native_mode(Logger& logger, StateManager& state_mgr) {
    logger.info("Starting NATIVE mode (Chrome stdin/stdout)");

    uint32_t size = read_size(std::cin);
    if (size == 0 || size > 10 * 1024 * 1024) {
        logger.error("Invalid message size: " + std::to_string(size));
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

        // Read state to find server port
        auto state = state_mgr.read_state();
        int server_port = state.value("port", BASE_PORT);

        // Try connecting to server
        socket_t sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (sock != INVALID_SOCK) {
            sockaddr_in addr{};
            addr.sin_family = AF_INET;
            addr.sin_port = htons(server_port);
            addr.sin_addr.s_addr = inet_addr("127.0.0.1");

            if (connect(sock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == 0) {
                write_socket(sock, j.dump());
                logger.info("Forwarded to server on port " + std::to_string(server_port));

                uint32_t resp_size = read_size_socket(sock);
                if (resp_size > 0 && resp_size < 10 * 1024 * 1024) {
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
        json response = router.process_message(j);
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

    while (!router.should_shutdown()) {
        uint32_t size = read_size_socket(client);
        if (size == 0 || size > 10 * 1024 * 1024) break;

        std::string msg = read_payload_socket(client, size);
        if (msg.empty()) break;

        try {
            auto j = json::parse(msg);
            logger.debug("VSCode message: " + j.dump().substr(0, 100));

            json response = router.process_message(j);
            write_socket(client, response.dump());

        } catch (const std::exception& e) {
            logger.error("VSCode parse error: " + std::string(e.what()));
            json err = {{"ok", false}, {"error", {{"type", "PARSE_ERROR"}, {"message", e.what()}}}};
            write_socket(client, err.dump());
        }
    }

    router.clear_vscode_socket();
    close_socket(client);
}

void server_mode(Logger& logger, StateManager& state_mgr, int preferred_port) {
    logger.info("Starting SERVER mode");

    int port = find_available_port(logger, preferred_port);
    if (port == -1) {
        logger.error("Cannot find available port");
        state_mgr.write_state(0, "error_no_port");
        return;
    }

    socket_t listen_sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (listen_sock == INVALID_SOCK) {
        logger.error("Cannot create socket");
        state_mgr.write_state(0, "error_socket");
        return;
    }

    int opt = 1;
    setsockopt(listen_sock, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&opt), sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    if (bind(listen_sock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
        logger.error("Bind failed on port " + std::to_string(port));
        close_socket(listen_sock);
        state_mgr.write_state(0, "error_bind");
        return;
    }

    if (listen(listen_sock, SOMAXCONN) != 0) {
        logger.error("Listen failed");
        close_socket(listen_sock);
        state_mgr.write_state(0, "error_listen");
        return;
    }

    logger.info("Server listening on 127.0.0.1:" + std::to_string(port));
    state_mgr.write_state(port, "running");

    MessageRouter router(logger);

    while (!router.should_shutdown()) {
        socket_t client = accept(listen_sock, nullptr, nullptr);
        if (client == INVALID_SOCK) {
            if (router.should_shutdown()) break;
            logger.error("Accept failed");
            continue;
        }
        logger.info("Client connected");
        std::thread([client, &router, &logger]() {
            handle_client(client, router, logger);
        }).detach();
    }

    close_socket(listen_sock);
    state_mgr.clear_state();
    logger.info("Server shutdown complete");
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
    int port = BASE_PORT;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--server") {
            server = true;
        } else if (arg.find("--port=") == 0) {
            port = std::stoi(arg.substr(7));
        }
    }

    StateManager state_mgr;
    Logger logger(server);

    if (server) {
        server_mode(logger, state_mgr, port);
    } else {
        native_mode(logger, state_mgr);
    }

#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}