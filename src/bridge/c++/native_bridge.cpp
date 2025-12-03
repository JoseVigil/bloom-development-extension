#include <iostream>
#include <vector>
#include <string>
#include <cstdint>
#include <fstream>
#include <thread>
#include <mutex>
#include <atomic>
#include <nlohmann/json.hpp>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
typedef SOCKET socket_t;
#define INVALID_SOCK INVALID_SOCKET
#define SOCK_ERR SOCKET_ERROR
#define close_socket closesocket
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <arpa/inet.h>
typedef int socket_t;
#define INVALID_SOCK -1
#define SOCK_ERR -1
#define close_socket close
#endif

using json = nlohmann::json;

std::atomic<socket_t> vscode_socket{INVALID_SOCK};
std::mutex cout_mutex;

uint32_t read_message_size(std::istream& in) {
    uint32_t size = 0;
    in.read(reinterpret_cast<char*>(&size), 4);
    if (in.gcount() != 4) return 0;
    return size;
}

std::string read_message(std::istream& in, uint32_t size) {
    std::string msg(size, '\0');
    if (size > 0) in.read(&msg[0], size);
    return msg;
}

void send_message(std::ostream& out, const std::string& s, std::mutex& mut) {
    std::lock_guard<std::mutex> lock(mut);
    uint32_t len = static_cast<uint32_t>(s.size());
    out.write(reinterpret_cast<const char*>(&len), 4);
    out.write(s.c_str(), len);
    out.flush();
}

uint32_t read_size_from_socket(socket_t sock) {
    uint32_t size = 0;
    int ret = recv(sock, reinterpret_cast<char*>(&size), 4, 0);
    if (ret != 4) return 0;
    return size;
}

std::string read_message_from_socket(socket_t sock, uint32_t size) {
    std::string msg(size, '\0');
    int ret = recv(sock, &msg[0], size, 0);
    if (ret != static_cast<int>(size)) return "";
    return msg;
}

void send_to_socket(socket_t sock, const std::string& s) {
    uint32_t len = static_cast<uint32_t>(s.size());
    send(sock, reinterpret_cast<const char*>(&len), 4, 0);
    send(sock, s.c_str(), len, 0);
}

void vscode_read_loop(socket_t sock) {
    while (true) {
        uint32_t size = read_size_from_socket(sock);
        if (size == 0) break;
        std::string msg = read_message_from_socket(sock, size);
        if (msg.empty()) break;
        try {
            auto j = json::parse(msg);
            // Forward all from VSCode to Chrome
            send_message(std::cout, j.dump(), cout_mutex);
        } catch (...) {
            json resp = { {"ok", false}, {"error", "parse error"} };
            send_to_socket(sock, resp.dump());
        }
    }
    vscode_socket.store(INVALID_SOCK);
    close_socket(sock);
}

void start_server() {
    socket_t listen_sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (listen_sock == INVALID_SOCK) return;

    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(5678);  // Fixed port for local server
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");

    if (bind(listen_sock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == SOCK_ERR) {
        close_socket(listen_sock);
        return;
    }

    if (listen(listen_sock, SOMAXCONN) == SOCK_ERR) {
        close_socket(listen_sock);
        return;
    }

    while (true) {
        socket_t client = accept(listen_sock, nullptr, nullptr);
        if (client == INVALID_SOCK) break;
        vscode_socket.store(client);
        vscode_read_loop(client);
        // Blocks until disconnect, then accepts next (supports reconnection)
    }

    close_socket(listen_sock);
}

void chrome_loop() {
    while (true) {
        uint32_t size = read_message_size(std::cin);
        if (size == 0) break;
        std::string msg = read_message(std::cin, size);
        try {
            auto j = json::parse(msg);
            if (j.contains("cmd")) {
                std::string cmd = j["cmd"];
                if (cmd == "save") {
                    // Handle local save (download artifact)
                    std::string filename = j.value("filename", "artifact.html");
                    std::string content = j.value("content", "");
                    std::ofstream out(filename, std::ios::binary);
                    out << content;
                    out.close();
                    json resp = { {"ok", true}, {"path", filename} };
                    send_message(std::cout, resp.dump(), cout_mutex);
                    continue;
                } else if (cmd == "read_file") {
                    // Handle local read (upload file)
                    std::string filename = j.value("filename", "");
                    std::ifstream in(filename, std::ios::binary | std::ios::ate);
                    if (in) {
                        auto fsize = in.tellg();
                        in.seekg(0);
                        std::string content(static_cast<size_t>(fsize), '\0');
                        in.read(&content[0], fsize);
                        json resp = { {"ok", true}, {"content", content} };
                        send_message(std::cout, resp.dump(), cout_mutex);
                    } else {
                        json resp = { {"ok", false}, {"error", "file not found"} };
                        send_message(std::cout, resp.dump(), cout_mutex);
                    }
                    continue;
                }
            }
            // Forward other messages to VSCode
            socket_t sock = vscode_socket.load();
            if (sock != INVALID_SOCK) {
                send_to_socket(sock, j.dump());
            } else {
                json resp = { {"ok", false}, {"error", "no vscode connected"} };
                send_message(std::cout, resp.dump(), cout_mutex);
            }
        } catch (...) {
            json resp = { {"ok", false}, {"error", "parse error"} };
            send_message(std::cout, resp.dump(), cout_mutex);
        }
    }
}

int main() {
#ifdef _WIN32
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 1;
#endif

    std::thread server_thread(start_server);
    chrome_loop();
    server_thread.join();

#ifdef _WIN32
    WSACleanup();
#endif
    return 0;
}