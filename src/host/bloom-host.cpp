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
#include <io.h>
#include <fcntl.h>
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

const std::string VERSION = "1.0.0";
const int BUILD = 1;
const int PROTOCOL = 1;
const int BASE_PORT = 5678;
const int MAX_PORT_ATTEMPTS = 20;

// ============================================================================
// GLOBALS
// ============================================================================
std::atomic<socket_t> vscode_socket{INVALID_SOCK};
std::mutex stdout_mutex;
std::atomic<bool> shutdown_requested{false};

// ============================================================================
// FILE SYSTEM
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
// LOGGER
// ============================================================================
class Logger {
private:
    std::string log_dir;
    std::ofstream log_file;
    std::mutex log_mutex;
    bool enabled;
    size_t max_size = 5 * 1024 * 1024;

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
        ss << std::put_time(std::localtime(&time), "host-%Y%m%d-%H%M.log");
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

public:
    Logger(bool enable = true) : enabled(enable) {
        if (enabled) {
            std::string base = get_app_data_path();
            ensure_directory(base);
            log_dir = base + "/logs";
            ensure_directory(log_dir);
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

Logger g_logger(true);

// ============================================================================
// STATE MANAGER
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

    void clear_state() {
        std::lock_guard<std::mutex> lock(state_mutex);
        std::remove(state_file.c_str());
    }
};

StateManager g_state;

// ============================================================================
// PROTOCOL
// ============================================================================
uint32_t read_size(std::istream& in) {
    uint32_t size = 0;
    in.read(reinterpret_cast<char*>(&size), 4);
    return (in.gcount() == 4) ? size : 0;
}

std::string read_payload(std::istream& in, uint32_t size) {
    if (size == 0 || size > 10 * 1024 * 1024) return "";
    std::string msg(size, '\0');
    in.read(&msg[0], size);
    return msg;
}

void write_message(std::ostream& out, const std::string& s) {
    std::lock_guard<std::mutex> lock(stdout_mutex);
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
    if (size == 0 || size > 10 * 1024 * 1024) return "";
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
// MESSAGE PROCESSING
// ============================================================================
json process_message(const json& msg) {
    if (!msg.contains("command")) {
        return {{"ok", false}, {"error", {{"type", "INVALID_COMMAND"}, {"message", "Missing command"}}}};
    }

    std::string cmd = msg["command"];

    // Control commands
    if (cmd == "shutdown") {
        shutdown_requested.store(true);
        g_logger.info("Shutdown requested");
        return {{"ok", true}, {"message", "Shutting down"}};
    }

    if (cmd == "ping") {
        return {{"ok", true}, {"version", VERSION}, {"build", BUILD}, {"protocol", PROTOCOL}};
    }

    // Local file operations
    if (cmd == "save_artifact") {
        try {
            std::string filename = msg.value("filename", "artifact.html");
            std::string content = msg.value("content", "");
            std::ofstream out(filename, std::ios::binary);
            out << content;
            out.close();
            g_logger.info("Saved: " + filename);
            return {{"ok", true}, {"path", filename}};
        } catch (const std::exception& e) {
            g_logger.error("Save failed: " + std::string(e.what()));
            return {{"ok", false}, {"error", {{"type", "SAVE_ERROR"}, {"message", e.what()}}}};
        }
    }

    if (cmd == "read_file") {
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
            g_logger.info("Read: " + filename);
            return {{"ok", true}, {"content", content}};
        } catch (const std::exception& e) {
            g_logger.error("Read failed: " + std::string(e.what()));
            return {{"ok", false}, {"error", {{"type", "READ_ERROR"}, {"message", e.what()}}}};
        }
    }

    // Forward to VSCode if connected
    socket_t sock = vscode_socket.load();
    if (sock != INVALID_SOCK) {
        write_socket(sock, msg.dump());
        g_logger.debug("Forwarded to VSCode");
        return {{"ok", true}, {"forwarded", true}};
    }

    return {{"ok", false}, {"error", {{"type", "NO_HANDLER"}, {"message", "Command not handled"}}}};
}

// ============================================================================
// CHROME LOOP (stdin/stdout)
// ============================================================================
void chrome_loop() {
    g_logger.info("Chrome loop started (stdin/stdout)");
    
#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif

    while (!shutdown_requested.load()) {
        uint32_t size = read_size(std::cin);
        if (size == 0) {
            if (std::cin.eof()) break;
            continue;
        }

        std::string msg = read_payload(std::cin, size);
        if (msg.empty()) continue;

        try {
            auto j = json::parse(msg);
            g_logger.debug("Chrome msg: " + j.dump().substr(0, 100));

            json response = process_message(j);
            write_message(std::cout, response.dump());

        } catch (const std::exception& e) {
            g_logger.error("Chrome parse error: " + std::string(e.what()));
            json err = {{"ok", false}, {"error", {{"type", "PARSE_ERROR"}, {"message", e.what()}}}};
            write_message(std::cout, err.dump());
        }
    }

    g_logger.info("Chrome loop ended");
}

// ============================================================================
// VSCODE CLIENT HANDLER
// ============================================================================
void handle_vscode_client(socket_t client) {
    vscode_socket.store(client);
    g_logger.info("VSCode connected");

    while (!shutdown_requested.load()) {
        uint32_t size = read_size_socket(client);
        if (size == 0) break;

        std::string msg = read_payload_socket(client, size);
        if (msg.empty()) break;

        try {
            auto j = json::parse(msg);
            g_logger.debug("VSCode msg: " + j.dump().substr(0, 100));

            json response = process_message(j);
            write_socket(client, response.dump());

            // También enviar a Chrome si está activo
            write_message(std::cout, j.dump());

        } catch (const std::exception& e) {
            g_logger.error("VSCode parse error: " + std::string(e.what()));
            json err = {{"ok", false}, {"error", {{"type", "PARSE_ERROR"}, {"message", e.what()}}}};
            write_socket(client, err.dump());
        }
    }

    vscode_socket.store(INVALID_SOCK);
    close_socket(client);
    g_logger.info("VSCode disconnected");
}

// ============================================================================
// TCP SERVER (VSCode)
// ============================================================================
int find_available_port(int preferred) {
    for (int attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
        int port = preferred + attempt;
        
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
            g_logger.info("Found available port: " + std::to_string(port));
            return port;
        }

        close_socket(test_sock);
        g_logger.warn("Port " + std::to_string(port) + " in use");
    }

    g_logger.error("No available ports");
    return -1;
}

void tcp_server_loop(int preferred_port) {
    g_logger.info("Starting TCP server");

    int port = find_available_port(preferred_port);
    if (port == -1) {
        g_state.write_state(0, "error_no_port");
        return;
    }

    socket_t listen_sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (listen_sock == INVALID_SOCK) {
        g_logger.error("Cannot create socket");
        g_state.write_state(0, "error_socket");
        return;
    }

    int opt = 1;
    setsockopt(listen_sock, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&opt), sizeof(opt));

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    if (bind(listen_sock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) != 0) {
        g_logger.error("Bind failed");
        close_socket(listen_sock);
        g_state.write_state(0, "error_bind");
        return;
    }

    if (listen(listen_sock, SOMAXCONN) != 0) {
        g_logger.error("Listen failed");
        close_socket(listen_sock);
        g_state.write_state(0, "error_listen");
        return;
    }

    g_logger.info("Listening on 127.0.0.1:" + std::to_string(port));
    g_state.write_state(port, "running");

    while (!shutdown_requested.load()) {
        socket_t client = accept(listen_sock, nullptr, nullptr);
        if (client == INVALID_SOCK) {
            if (shutdown_requested.load()) break;
            continue;
        }

        std::thread([client]() {
            handle_vscode_client(client);
        }).detach();
    }

    close_socket(listen_sock);
    g_state.clear_state();
    g_logger.info("TCP server stopped");
}

// ============================================================================
// MAIN
// ============================================================================
int main(int argc, char* argv[]) {
#ifdef _WIN32
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 1;
#endif

    int port = BASE_PORT;
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg.find("--port=") == 0) {
            port = std::stoi(arg.substr(7));
        }
    }

    g_logger.info("=== Bloom Host Started ===");
    g_logger.info("Version: " + VERSION);

    // Start TCP server in background thread
    std::thread server_thread([port]() {
        tcp_server_loop(port);
    });

    // Main thread handles Chrome stdin/stdout
    chrome_loop();

    // Wait for server thread to finish
    shutdown_requested.store(true);
    server_thread.join();

    g_logger.info("=== Bloom Host Stopped ===");

#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}