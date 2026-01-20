#include <iostream>
#include <vector>
#include <string>
#include <thread>
#include <mutex>
#include <atomic>
#include <chrono>
#include <queue>
#include <condition_variable>
#include <nlohmann/json.hpp>

#include "synapse_logger.h"
#include "chunked_buffer.h"
#include "platform_utils.h"

using json = nlohmann::json;

// ============================================================================
// CONSTANTES GLOBALES
// ============================================================================

const std::string VERSION = "2.0.0";
const int BUILD = 20;
const int SERVICE_PORT = 5678;
const size_t MAX_MESSAGE_SIZE = 50 * 1024 * 1024;
const int RECONNECT_DELAY_MS = 2000;
const size_t MAX_QUEUED_MESSAGES = 100;
const int MAX_IDENTITY_WAIT_MS = 10000;

// ============================================================================
// ESTADO GLOBAL
// ============================================================================

std::atomic<socket_t> service_socket{INVALID_SOCK};
std::mutex stdout_mutex;
std::atomic<bool> shutdown_requested{false};
std::atomic<bool> identity_resolved{false};

std::string g_profile_id = "";
std::string g_launch_id = "";
std::mutex g_identity_mutex;
std::condition_variable g_identity_cv;

std::queue<std::string> g_pending_messages;
std::mutex g_pending_mutex;

SynapseLogManager g_logger;
ChunkedMessageBuffer g_chunked_buffer;

// ============================================================================
// HELPERS SEGUROS PARA JSON
// ============================================================================

// Extracción segura de string con fallback
std::string json_get_string_safe(const json& j, const std::string& key, const std::string& fallback = "") {
    try {
        if (!j.contains(key)) return fallback;
        
        const auto& val = j[key];
        
        if (val.is_string()) {
            return val.get<std::string>();
        } else if (val.is_number_integer()) {
            return std::to_string(val.get<int64_t>());
        } else if (val.is_number_float()) {
            return std::to_string(val.get<double>());
        } else if (val.is_boolean()) {
            return val.get<bool>() ? "true" : "false";
        }
        
        return fallback;
    } catch (const std::exception& e) {
        std::cerr << "[JSON_SAFE] Error extracting '" << key << "': " << e.what() << std::endl;
        return fallback;
    }
}

// Conversión segura de cualquier valor a string
std::string json_value_to_string(const json& val) {
    try {
        if (val.is_string()) return val.get<std::string>();
        if (val.is_number_integer()) return std::to_string(val.get<int64_t>());
        if (val.is_number_float()) return std::to_string(val.get<double>());
        if (val.is_boolean()) return val.get<bool>() ? "true" : "false";
        if (val.is_null()) return "";
        return val.dump();
    } catch (...) {
        return "";
    }
}

// ============================================================================
// FUNCIONES DE COMUNICACIÓN
// ============================================================================

void write_message_to_chrome(const std::string& s) {
    try {
        std::lock_guard<std::mutex> lock(stdout_mutex);
        uint32_t len = static_cast<uint32_t>(s.size());
        
        std::cout.write(reinterpret_cast<const char*>(&len), 4);
        std::cout.write(s.c_str(), len);
        std::cout.flush();
    } catch (const std::exception& e) {
        std::cerr << "[WRITE_CHROME] Exception: " << e.what() << std::endl;
    }
}

void write_to_service(const std::string& s) {
    try {
        socket_t sock = service_socket.load();
        if (sock != INVALID_SOCK) {
            uint32_t len = static_cast<uint32_t>(s.size());
            uint32_t net_len = htonl(len);
            
            send(sock, (const char*)&net_len, 4, 0);
            send(sock, s.c_str(), len, 0);
        }
    } catch (const std::exception& e) {
        std::cerr << "[WRITE_SERVICE] Exception: " << e.what() << std::endl;
    }
}

// ============================================================================
// EXTRACCIÓN DE IDENTIDAD (LATE BINDING) - ULTRA DEFENSIVO
// ============================================================================

bool try_extract_profile_id_from_raw(const std::string& msg_str) {
    try {
        size_t pos = msg_str.find("\"profile_id\"");
        if (pos == std::string::npos) return false;
        
        size_t start = msg_str.find("\"", pos + 13);
        if (start == std::string::npos) return false;
        start++;
        
        size_t end = msg_str.find("\"", start);
        if (end == std::string::npos) return false;
        
        std::string candidate = msg_str.substr(start, end - start);
        
        if (candidate.length() == 36 && 
            candidate[8] == '-' && candidate[13] == '-' &&
            candidate[18] == '-' && candidate[23] == '-') {
            
            std::lock_guard<std::mutex> lock(g_identity_mutex);
            if (g_profile_id.empty()) {
                g_profile_id = candidate;
                g_logger.initialize_with_profile_id(candidate);
                
                std::cerr << "[IDENTITY_EXTRACT_RAW] profile=" << candidate << std::endl;
                return true;
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "[EXTRACT_RAW] Exception: " << e.what() << std::endl;
    }
    
    return false;
}

bool try_extract_identity(const json& msg) {
    try {
        std::vector<std::string> profile_paths = {"/payload/profile_id", "/profile_id"};
        std::vector<std::string> launch_paths = {"/payload/launch_id", "/launch_id"};
        
        std::string candidate_profile;
        std::string candidate_launch;
        
        for (const auto& path : profile_paths) {
            try {
                auto ptr = msg.at(json::json_pointer(path));
                candidate_profile = json_value_to_string(ptr);
                if (!candidate_profile.empty()) break;
            } catch (...) { continue; }
        }
        
        for (const auto& path : launch_paths) {
            try {
                auto ptr = msg.at(json::json_pointer(path));
                candidate_launch = json_value_to_string(ptr);
                if (!candidate_launch.empty()) break;
            } catch (...) { continue; }
        }
        
        if (!candidate_profile.empty() && !candidate_launch.empty()) {
            std::lock_guard<std::mutex> lock(g_identity_mutex);
            
            if (g_profile_id.empty()) {
                g_profile_id = candidate_profile;
                g_logger.initialize_with_profile_id(candidate_profile);
            }
            
            if (g_launch_id.empty()) {
                g_launch_id = candidate_launch;
                g_logger.initialize_with_launch_id(candidate_launch);
            }
            
            bool both_valid = !g_profile_id.empty() && !g_launch_id.empty();
            
            if (both_valid && !identity_resolved.load()) {
                std::cerr << "[IDENTITY_EXTRACT] profile=" << g_profile_id 
                          << " launch=" << g_launch_id << std::endl;
                
                if (g_logger.is_ready()) {
                    g_logger.log_native("INFO", "LATE_BINDING_SUCCESS ProfileID=" + 
                        g_profile_id + " LaunchID=" + g_launch_id);
                }
                
                identity_resolved.store(true);
                g_identity_cv.notify_all();
                
                return true;
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "[EXTRACT_IDENTITY] Exception: " << e.what() << std::endl;
    }
    
    return false;
}

// ============================================================================
// HELPER: Obtener identidad de forma segura
// ============================================================================

struct IdentitySnapshot {
    std::string profile_id;
    std::string launch_id;
    bool valid;
};

IdentitySnapshot get_identity_safe() {
    std::lock_guard<std::mutex> lock(g_identity_mutex);
    return {
        g_profile_id,
        g_launch_id,
        !g_profile_id.empty() && !g_launch_id.empty()
    };
}

// ============================================================================
// MANEJO DE MENSAJES DESDE CHROME
// ============================================================================

void flush_pending_messages() {
    try {
        std::lock_guard<std::mutex> lock(g_pending_mutex);
        
        size_t count = g_pending_messages.size();
        if (count > 0 && g_logger.is_ready()) {
            g_logger.log_native("INFO", "FLUSH_START Count=" + std::to_string(count));
        }
        
        while (!g_pending_messages.empty()) {
            std::string msg = g_pending_messages.front();
            g_pending_messages.pop();
            write_to_service(msg);
        }
        
        if (count > 0 && g_logger.is_ready()) {
            g_logger.log_native("INFO", "FLUSH_COMPLETE");
        }
    } catch (const std::exception& e) {
        std::cerr << "[FLUSH] Exception: " << e.what() << std::endl;
    }
}

void handle_chrome_message(const std::string& msg_str) {
    try {
        try_extract_profile_id_from_raw(msg_str);
        
        json msg;
        try {
            msg = json::parse(msg_str);
        } catch (const std::exception& e) {
            if (g_logger.is_ready()) {
                g_logger.log_native("ERROR", "JSON_PARSE_ERROR: " + std::string(e.what()));
            }
            return;
        }
        
        if (msg.contains("bloom_chunk")) {
            std::string assembled;
            auto res = g_chunked_buffer.process_chunk(msg, assembled);
            if (res == ChunkedMessageBuffer::COMPLETE_VALID) {
                handle_chrome_message(assembled);
            }
            return;
        }
        
        try_extract_identity(msg);
        
        std::string msg_type = json_get_string_safe(msg, "type", "");
        
        if (msg_type.empty() || msg_type == "unknown_technical") {
            return;
        }
        
        if (msg_type == "LOG") {
            std::string level = json_get_string_safe(msg, "level", "INFO");
            std::string message = json_get_string_safe(msg, "message", "");
            
            if (g_logger.is_ready()) {
                g_logger.log_browser(level, message);
            }
            return;
        }
        
        if (msg_type == "SYSTEM_HELLO") {
            auto snapshot = get_identity_safe();
            
            json ready = {
                {"type", "SYSTEM_ACK"},
                {"command", "system_ready"},
                {"payload", {
                    {"status", "connected"},
                    {"host_version", VERSION},
                    {"profile_id", snapshot.valid ? snapshot.profile_id : "unknown_worker"},
                    {"identity_method", snapshot.valid ? "late_binding" : "fallback"}
                }}
            };
            
            write_message_to_chrome(ready.dump());
            
            if (g_logger.is_ready()) {
                g_logger.log_native("INFO", "SYSTEM_ACK_SENT ProfileID=" + snapshot.profile_id);
            }
            return;
        }
        
        if (service_socket.load() != INVALID_SOCK && identity_resolved.load()) {
            write_to_service(msg_str);
            if (g_logger.is_ready()) {
                g_logger.log_native("DEBUG", "MSG_FORWARDED Type=" + msg_type);
            }
        } else {
            std::lock_guard<std::mutex> lock(g_pending_mutex);
            if (g_pending_messages.size() < MAX_QUEUED_MESSAGES) {
                g_pending_messages.push(msg_str);
            }
        }
    } catch (const std::exception& e) {
        std::cerr << "[HANDLE_CHROME] Critical exception: " << e.what() << std::endl;
        if (g_logger.is_ready()) {
            g_logger.log_native("CRITICAL", "HANDLER_EXCEPTION: " + std::string(e.what()));
        }
    }
}

// ============================================================================
// CLIENTE TCP - ULTRA ROBUSTO
// ============================================================================

void tcp_client_loop() {
    try {
        std::cerr << "[TCP_THREAD] Starting - waiting for identity..." << std::endl;
        
        std::unique_lock<std::mutex> id_lock(g_identity_mutex);
        
        bool wait_result = g_identity_cv.wait_for(
            id_lock, 
            std::chrono::milliseconds(MAX_IDENTITY_WAIT_MS),
            []{ return identity_resolved.load() || shutdown_requested.load(); }
        );
        
        if (shutdown_requested.load()) {
            std::cerr << "[TCP_THREAD] Abort - shutdown requested" << std::endl;
            return;
        }
        
        if (!wait_result) {
            std::cerr << "[TCP_THREAD] TIMEOUT - identity not resolved after " 
                      << MAX_IDENTITY_WAIT_MS << "ms" << std::endl;
            
            if (g_logger.is_ready()) {
                g_logger.log_native("CRITICAL", "TCP_IDENTITY_TIMEOUT");
            }
            return;
        }
        
        IdentitySnapshot snapshot = {g_profile_id, g_launch_id, true};
        id_lock.unlock();
        
        if (snapshot.profile_id.empty() || snapshot.launch_id.empty()) {
            std::cerr << "[TCP_THREAD] CRITICAL - Captured empty identity!" << std::endl;
            
            if (g_logger.is_ready()) {
                g_logger.log_native("CRITICAL", "TCP_ABORT Empty identity");
            }
            return;
        }
        
        std::cerr << "[TCP_THREAD] Identity validated:" << std::endl;
        std::cerr << "  ProfileID: " << snapshot.profile_id << std::endl;
        std::cerr << "  LaunchID:  " << snapshot.launch_id << std::endl;
        
        if (g_logger.is_ready()) {
            g_logger.log_native("INFO", "TCP_IDENTITY_VALIDATED ProfileID=" + 
                               snapshot.profile_id + " LaunchID=" + snapshot.launch_id);
        }
        
        int reconnect_attempts = 0;
        
        while (!shutdown_requested.load()) {
            socket_t sock = INVALID_SOCK;
            
            try {
                sock = socket(AF_INET, SOCK_STREAM, 0);
                if (sock == INVALID_SOCK) {
                    std::this_thread::sleep_for(std::chrono::milliseconds(RECONNECT_DELAY_MS));
                    continue;
                }

                sockaddr_in addr{};
                addr.sin_family = AF_INET;
                addr.sin_port = htons(SERVICE_PORT);
                addr.sin_addr.s_addr = inet_addr("127.0.0.1");

                if (g_logger.is_ready()) {
                    g_logger.log_native("INFO", "TCP_CONNECTING Port=" + std::to_string(SERVICE_PORT) +
                                       " Attempt=" + std::to_string(++reconnect_attempts));
                }

                if (connect(sock, (sockaddr*)&addr, sizeof(addr)) < 0) {
                    close_socket(sock);
                    if (g_logger.is_ready()) {
                        g_logger.log_native("WARN", "TCP_CONNECT_FAILED Retry in " + 
                                           std::to_string(RECONNECT_DELAY_MS) + "ms");
                    }
                    std::this_thread::sleep_for(std::chrono::milliseconds(RECONNECT_DELAY_MS));
                    continue;
                }

#ifdef _WIN32
                DWORD timeout = 1000;
                setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, (const char*)&timeout, sizeof(timeout));
#else
                struct timeval tv;
                tv.tv_sec = 1;
                tv.tv_usec = 0;
                setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
#endif
                
                if (g_logger.is_ready()) {
                    g_logger.log_native("INFO", "TCP_CONNECTED Socket=" + std::to_string(sock));
                }
                
                service_socket.store(sock);

                // ✅ CRÍTICO: Convertir TODOS los valores a string explícitamente
                std::string pid_str = std::to_string(PlatformUtils::get_current_pid());
                std::string build_str = std::to_string(BUILD);
                
                json reg = {
                    {"type", "REGISTER_HOST"},
                    {"pid", pid_str},              // ✅ String, no int
                    {"profile_id", snapshot.profile_id},
                    {"launch_id", snapshot.launch_id},
                    {"version", VERSION},
                    {"build", build_str}           // ✅ String, no int
                };
                
                std::string reg_payload = reg.dump();
                
                std::cerr << "[TCP_REGISTER] Sending payload:" << std::endl;
                std::cerr << "  Raw JSON: " << reg_payload << std::endl;
                std::cerr << "  PID: " << pid_str << " (string)" << std::endl;
                std::cerr << "  Build: " << build_str << " (string)" << std::endl;
                
                if (g_logger.is_ready()) {
                    g_logger.log_native("INFO", "TCP_REGISTERING Payload=" + reg_payload);
                }
                
                write_to_service(reg_payload);
                
                reconnect_attempts = 0;

                flush_pending_messages();

                // Bucle de recepción con manejo robusto de errores
                while (!shutdown_requested.load()) {
                    uint32_t net_len;
                    int received = recv(sock, (char*)&net_len, 4, 0);
                    
                    if (received <= 0) {
                        if (shutdown_requested.load()) break;
#ifdef _WIN32
                        if (WSAGetLastError() == WSAETIMEDOUT) continue;
#else
                        if (errno == EAGAIN || errno == EWOULDBLOCK) continue;
#endif
                        if (g_logger.is_ready()) {
                            g_logger.log_native("ERROR", "TCP_RECV_FAILED");
                        }
                        break;
                    }
                    
                    uint32_t len = ntohl(net_len);
                    if (len == 0 || len > MAX_MESSAGE_SIZE) {
                        if (g_logger.is_ready()) {
                            g_logger.log_native("ERROR", "TCP_INVALID_LENGTH=" + std::to_string(len));
                        }
                        break;
                    }
                    
                    std::vector<char> buf(len);
                    int rec = 0;
                    while (rec < (int)len) {
                        int r = recv(sock, buf.data() + rec, len - rec, 0);
                        if (r <= 0) break;
                        rec += r;
                    }
                    
                    if (rec == (int)len) {
                        std::string b_msg(buf.begin(), buf.end());
                        write_message_to_chrome(b_msg);
                    }
                }
                
            } catch (const std::exception& e) {
                std::cerr << "[TCP_LOOP] Exception: " << e.what() << std::endl;
                if (g_logger.is_ready()) {
                    g_logger.log_native("ERROR", "TCP_EXCEPTION: " + std::string(e.what()));
                }
            }
            
            service_socket.store(INVALID_SOCK);
            if (sock != INVALID_SOCK) {
                close_socket(sock);
            }
            
            if (g_logger.is_ready()) {
                g_logger.log_native("WARN", "TCP_DISCONNECTED Reconnecting");
            }
        }
        
    } catch (const std::exception& e) {
        std::cerr << "[TCP_THREAD] Fatal exception: " << e.what() << std::endl;
        if (g_logger.is_ready()) {
            g_logger.log_native("CRITICAL", "TCP_FATAL: " + std::string(e.what()));
        }
    }
}

// ============================================================================
// MAIN - CON PROTECCIÓN GLOBAL
// ============================================================================

int main(int argc, char* argv[]) {
    try {
        PlatformUtils::initialize_networking();
        PlatformUtils::setup_binary_io();
        
        std::string cli_profile_id = PlatformUtils::get_cli_argument(argc, argv, "--profile-id");
        std::string cli_launch_id = PlatformUtils::get_cli_argument(argc, argv, "--launch-id");
        
        std::cerr << "[HOST] Startup - Build " << BUILD << std::endl;
        std::cerr << "[HOST] CLI args: profile='" << cli_profile_id 
                  << "' launch='" << cli_launch_id << "'" << std::endl;
        
        if (!cli_profile_id.empty() && !cli_launch_id.empty()) {
            std::lock_guard<std::mutex> lock(g_identity_mutex);
            g_profile_id = cli_profile_id;
            g_launch_id = cli_launch_id;
            
            g_logger.initialize_with_profile_id(cli_profile_id);
            g_logger.initialize_with_launch_id(cli_launch_id);
            
            identity_resolved.store(true);
            g_identity_cv.notify_all();
            
            std::cerr << "[HOST] Identity from CLI arguments ✓" << std::endl;
        } else {
            std::cerr << "[HOST] CLI args missing - waiting for SYSTEM_HELLO" << std::endl;
        }

        std::thread tcp_thread(tcp_client_loop);

        while (!shutdown_requested.load()) {
            uint32_t len = 0;
            
            if (!std::cin.read(reinterpret_cast<char*>(&len), 4)) {
                if (g_logger.is_ready()) {
                    g_logger.log_native("INFO", "STDIN_EOF");
                }
                break;
            }
            
            if (len == 0 || len > MAX_MESSAGE_SIZE) {
                if (g_logger.is_ready()) {
                    g_logger.log_native("ERROR", "STDIN_INVALID_LENGTH=" + std::to_string(len));
                }
                continue;
            }
            
            std::vector<char> buf(len);
            if (!std::cin.read(buf.data(), len)) {
                if (g_logger.is_ready()) {
                    g_logger.log_native("ERROR", "STDIN_READ_INCOMPLETE");
                }
                break;
            }
            
            std::string msg_str(buf.begin(), buf.end());
            handle_chrome_message(msg_str);
        }

        shutdown_requested.store(true);
        g_identity_cv.notify_all();
        
        if (g_logger.is_ready()) {
            g_logger.log_native("INFO", "SHUTDOWN");
        }
        
        socket_t sock = service_socket.load();
        if (sock != INVALID_SOCK) {
            service_socket.store(INVALID_SOCK);
            close_socket(sock);
        }
        
        if (tcp_thread.joinable()) tcp_thread.join();

        PlatformUtils::cleanup_networking();
        
        return 0;
        
    } catch (const std::exception& e) {
        std::cerr << "[MAIN] Fatal exception: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "[MAIN] Unknown fatal exception" << std::endl;
        return 2;
    }
}
