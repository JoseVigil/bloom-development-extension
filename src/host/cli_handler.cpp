#include "cli_handler.h"
#include "build_info.h"
#include <iostream>
#include <string>
#include <vector>
#include <map>
#include <algorithm>
#include <chrono>
#include <ctime>
#include <cstdio>
#include <cstring>
#include <sstream>

#ifdef _WIN32
    #include <windows.h>
#else
    #include <unistd.h>
#endif

// Constantes duplicadas (necesarias para evitar dependencias de linkeo)
const std::string VERSION = "2.1.0";
const int SERVICE_PORT = 5678;
const size_t MAX_MESSAGE_SIZE = 50 * 1024 * 1024;
const size_t MAX_CHROME_MSG_SIZE = 1020000;
const int RECONNECT_DELAY_MS = 500;
const size_t MAX_QUEUED_MESSAGES = 500;
const int MAX_IDENTITY_WAIT_MS = 10000;
const int HEARTBEAT_INTERVAL_SEC = 10;

// Detectar OS
std::string detect_os() {
#ifdef _WIN32
    return "Windows";
#elif defined(__APPLE__)
    return "macOS";
#else
    return "Linux";
#endif
}

// Detectar arquitectura
std::string detect_architecture() {
    if (sizeof(void*) == 8) {
        return "x86_64";
    } else {
        return "x86";
    }
}

// Detectar compilador y versión
std::string detect_runtime_version() {
#ifdef __GNUC__
    return "GCC " + std::to_string(__GNUC__) + "." + 
           std::to_string(__GNUC_MINOR__) + "." + 
           std::to_string(__GNUC_PATCHLEVEL__);
#elif defined(_MSC_VER)
    return "MSVC " + std::to_string(_MSC_VER);
#else
    return "Unknown";
#endif
}

// Extraer nombre de aplicación desde argv[0]
std::string get_application_name(const char* argv0) {
    std::string path = argv0;
    size_t last_slash = path.find_last_of("/\\");
    std::string name = (last_slash != std::string::npos) ? path.substr(last_slash + 1) : path;
    
    // Remover extensión .exe en Windows
    size_t ext_pos = name.find(".exe");
    if (ext_pos != std::string::npos) {
        name = name.substr(0, ext_pos);
    }
    
    return name;
}

// Obtener path completo del ejecutable
std::string get_executable_path(const char* argv0) {
#ifdef _WIN32
    char buffer[MAX_PATH];
    GetModuleFileNameA(NULL, buffer, MAX_PATH);
    return std::string(buffer);
#else
    char buffer[1024];
    ssize_t len = readlink("/proc/self/exe", buffer, sizeof(buffer) - 1);
    if (len != -1) {
        buffer[len] = '\0';
        return std::string(buffer);
    }
    return argv0;
#endif
}

// Ejecutar comando y capturar output
std::string exec_command(const std::string& cmd) {
    std::string result;
    FILE* pipe = popen(cmd.c_str(), "r");
    if (!pipe) return "";
    
    char buffer[256];
    while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
        result += buffer;
    }
    pclose(pipe);
    return result;
}

// Detectar dependencias según el OS
std::string detect_dependencies(const std::string& exe_path) {
    std::string os = detect_os();
    std::vector<std::string> libs;
    
    if (os == "Linux") {
        std::string cmd = "ldd \"" + exe_path + "\" 2>/dev/null";
        std::string output = exec_command(cmd);
        
        std::istringstream stream(output);
        std::string line;
        while (std::getline(stream, line)) {
            // Buscar .so en la línea
            size_t so_pos = line.find(".so");
            if (so_pos != std::string::npos) {
                // Extraer nombre de lib (antes del =>)
                size_t start = line.find_first_not_of(" \t");
                if (start != std::string::npos) {
                    std::string lib_name = line.substr(start);
                    size_t arrow = lib_name.find("=>");
                    if (arrow != std::string::npos) {
                        lib_name = lib_name.substr(0, arrow);
                    }
                    size_t end = lib_name.find(".so");
                    if (end != std::string::npos) {
                        lib_name = lib_name.substr(0, end + 3);
                    }
                    
                    // Limpiar espacios
                    lib_name.erase(lib_name.find_last_not_of(" \t") + 1);
                    
                    // Ignorar libs del sistema comunes
                    if (lib_name.find("libc.so") == std::string::npos &&
                        lib_name.find("libm.so") == std::string::npos &&
                        lib_name.find("libpthread.so") == std::string::npos &&
                        lib_name.find("libdl.so") == std::string::npos &&
                        lib_name.find("ld-linux") == std::string::npos) {
                        libs.push_back(lib_name + "=unknown");
                    }
                }
            }
        }
    } else if (os == "macOS") {
        std::string cmd = "otool -L \"" + exe_path + "\" 2>/dev/null";
        std::string output = exec_command(cmd);
        
        std::istringstream stream(output);
        std::string line;
        bool first_line = true;
        while (std::getline(stream, line)) {
            if (first_line) {
                first_line = false;
                continue;
            }
            
            size_t dylib_pos = line.find(".dylib");
            if (dylib_pos != std::string::npos) {
                size_t start = line.find_first_not_of(" \t");
                if (start != std::string::npos) {
                    std::string lib_path = line.substr(start);
                    size_t space = lib_path.find(" ");
                    if (space != std::string::npos) {
                        lib_path = lib_path.substr(0, space);
                    }
                    
                    // Extraer solo el nombre
                    size_t last_slash = lib_path.find_last_of("/");
                    std::string lib_name = (last_slash != std::string::npos) ? 
                                          lib_path.substr(last_slash + 1) : lib_path;
                    
                    // Ignorar libs del sistema
                    if (lib_path.find("/usr/lib/") == std::string::npos &&
                        lib_path.find("/System/") == std::string::npos) {
                        libs.push_back(lib_name + "=unknown");
                    }
                }
            }
        }
    } else if (os == "Windows") {
        std::string cmd = "dumpbin /dependents \"" + exe_path + "\" 2>nul";
        std::string output = exec_command(cmd);
        
        std::istringstream stream(output);
        std::string line;
        bool in_deps = false;
        while (std::getline(stream, line)) {
            if (line.find("dependencies") != std::string::npos) {
                in_deps = true;
                continue;
            }
            
            if (in_deps && line.find(".dll") != std::string::npos) {
                size_t start = line.find_first_not_of(" \t");
                if (start != std::string::npos) {
                    std::string dll_name = line.substr(start);
                    dll_name.erase(dll_name.find_last_not_of(" \t\r\n") + 1);
                    
                    // Ignorar DLLs del sistema
                    std::string lower = dll_name;
                    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
                    if (lower.find("kernel32") == std::string::npos &&
                        lower.find("msvcr") == std::string::npos &&
                        lower.find("ucrtbase") == std::string::npos &&
                        lower.find("vcruntime") == std::string::npos &&
                        lower.find("api-ms-win") == std::string::npos) {
                        libs.push_back(dll_name + "=unknown");
                    }
                }
            }
            
            if (in_deps && line.find("Summary") != std::string::npos) {
                break;
            }
        }
    }
    
    if (libs.empty()) {
        return "none";
    }
    
    // Ordenar y unir
    std::sort(libs.begin(), libs.end());
    std::string result;
    for (size_t i = 0; i < libs.size(); i++) {
        if (i > 0) result += ", ";
        result += libs[i];
    }
    return result;
}

// Timestamp actual
std::string get_current_timestamp() {
    auto now = std::chrono::system_clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch());
    return std::to_string(ms.count());
}

// Imprimir --version
void print_version() {
    std::cout << "bloom-host version " << VERSION 
              << " build " << BUILD_NUMBER << std::endl;
}

// Imprimir --info
void print_info(const char* argv0) {
    std::map<std::string, std::string> info;
    
    info["application_name"] = get_application_name(argv0);
    info["application_version"] = VERSION;
    info["architecture"] = detect_architecture();
    info["build_date"] = __DATE__;
    info["build_number"] = std::to_string(BUILD_NUMBER);
    info["custom_heartbeat_interval_sec"] = std::to_string(HEARTBEAT_INTERVAL_SEC);
    info["custom_max_chrome_msg_size"] = std::to_string(MAX_CHROME_MSG_SIZE);
    info["custom_max_identity_wait_ms"] = std::to_string(MAX_IDENTITY_WAIT_MS);
    info["custom_max_message_size"] = std::to_string(MAX_MESSAGE_SIZE);
    info["custom_max_queued_messages"] = std::to_string(MAX_QUEUED_MESSAGES);
    info["custom_reconnect_delay_ms"] = std::to_string(RECONNECT_DELAY_MS);
    info["custom_service_port"] = std::to_string(SERVICE_PORT);
    
    std::string exe_path = get_executable_path(argv0);
    info["dependencies"] = detect_dependencies(exe_path);
    
    info["os"] = detect_os();
    info["runtime_type"] = "C++";
    info["runtime_version"] = detect_runtime_version();
    info["timestamp"] = get_current_timestamp();
    
    // Imprimir ordenado alfabéticamente
    for (const auto& pair : info) {
        std::cout << pair.first << ": " << pair.second << std::endl;
    }
}

// Handler principal
bool handle_cli_args(int argc, char* argv[]) {
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        
        if (arg == "--version" || arg == "-v") {
            print_version();
            return true;
        }
        
        if (arg == "--info" || arg == "-i") {
            print_info(argv[0]);
            return true;
        }
    }
    
    return false;
}
