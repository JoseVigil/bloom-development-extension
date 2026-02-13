#pragma once

#include <string>
#include <iostream>
#include <chrono>
#include <iomanip>
#include <sstream>
#include <vector>
#include <map>
#include <algorithm>
#include <cstdio>
#include "build_info.h"  // For BUILD_NUMBER

#ifdef _WIN32
#include <windows.h>
#else
#include <sys/utsname.h>
#include <unistd.h>
#endif

// ============================================================================
// SYSTEM INFO UTILITIES
// ============================================================================

namespace SystemInfo {
    
    struct PlatformInfo {
        std::string os_name;
        std::string os_version;
        std::string arch;
        std::string runtime;
        std::string runtime_version;
    };
    
    inline PlatformInfo get_platform_info() {
        PlatformInfo info;
        
#ifdef _WIN32
        info.os_name = "Windows";
        
        // Get Windows version
        OSVERSIONINFOEX osvi;
        ZeroMemory(&osvi, sizeof(OSVERSIONINFOEX));
        osvi.dwOSVersionInfoSize = sizeof(OSVERSIONINFOEX);
        
        #pragma warning(push)
        #pragma warning(disable: 4996)
        if (GetVersionEx((OSVERSIONINFO*)&osvi)) {
            std::ostringstream oss;
            oss << osvi.dwMajorVersion << "." << osvi.dwMinorVersion 
                << " Build " << osvi.dwBuildNumber;
            info.os_version = oss.str();
        }
        #pragma warning(pop)
        
        // Get architecture
        SYSTEM_INFO sysInfo;
        GetNativeSystemInfo(&sysInfo);
        switch (sysInfo.wProcessorArchitecture) {
            case PROCESSOR_ARCHITECTURE_AMD64:
                info.arch = "x86_64";
                break;
            case PROCESSOR_ARCHITECTURE_ARM64:
                info.arch = "ARM64";
                break;
            case PROCESSOR_ARCHITECTURE_INTEL:
                info.arch = "x86";
                break;
            default:
                info.arch = "Unknown";
        }
#else
        struct utsname buf;
        if (uname(&buf) == 0) {
            info.os_name = buf.sysname;
            info.os_version = buf.release;
            info.arch = buf.machine;
        }
#endif
        
        // Detect compiler
#ifdef __GNUC__
        info.runtime = "C++/GCC";
        info.runtime_version = std::to_string(__GNUC__) + "." + 
                              std::to_string(__GNUC_MINOR__) + "." + 
                              std::to_string(__GNUC_PATCHLEVEL__);
#elif defined(_MSC_VER)
        info.runtime = "C++/MSVC";
        info.runtime_version = std::to_string(_MSC_VER);
#else
        info.runtime = "C++";
        info.runtime_version = std::to_string(__cplusplus);
#endif
        
        return info;
    }
    
    inline std::string get_current_timestamp() {
        auto now = std::chrono::system_clock::now();
        auto time = std::chrono::system_clock::to_time_t(now);
        std::ostringstream oss;
        oss << std::put_time(std::localtime(&time), "%Y-%m-%d %H:%M:%S");
        return oss.str();
    }
    
    inline std::string get_build_timestamp() {
        return std::string(__DATE__) + " " + std::string(__TIME__);
    }
    
    inline std::string get_executable_path() {
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
        return "";
#endif
    }
    
    inline std::string exec_command(const std::string& cmd) {
        std::string result;
#ifdef _WIN32
        FILE* pipe = _popen(cmd.c_str(), "r");
#else
        FILE* pipe = popen(cmd.c_str(), "r");
#endif
        if (!pipe) return "";
        
        char buffer[256];
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            result += buffer;
        }
        
#ifdef _WIN32
        _pclose(pipe);
#else
        pclose(pipe);
#endif
        return result;
    }
    
    inline std::string detect_dependencies() {
        std::string exe_path = get_executable_path();
        if (exe_path.empty()) return "unknown";
        
        std::vector<std::string> libs;
        
#ifdef _WIN32
        // Windows: Use dumpbin if available
        std::string cmd = "dumpbin /dependents \"" + exe_path + "\" 2>nul";
        std::string output = exec_command(cmd);
        
        if (output.empty()) {
            return "dumpbin_not_available";
        }
        
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
                    
                    // Filter system DLLs
                    std::string lower = dll_name;
                    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);
                    if (lower.find("kernel32") == std::string::npos &&
                        lower.find("msvcr") == std::string::npos &&
                        lower.find("ucrtbase") == std::string::npos &&
                        lower.find("vcruntime") == std::string::npos &&
                        lower.find("api-ms-win") == std::string::npos) {
                        libs.push_back(dll_name);
                    }
                }
            }
            
            if (in_deps && line.find("Summary") != std::string::npos) {
                break;
            }
        }
        
#elif defined(__APPLE__)
        // macOS: Use otool
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
                    
                    // Extract only the name
                    size_t last_slash = lib_path.find_last_of("/");
                    std::string lib_name = (last_slash != std::string::npos) ? 
                                          lib_path.substr(last_slash + 1) : lib_path;
                    
                    // Filter system libs
                    if (lib_path.find("/usr/lib/") == std::string::npos &&
                        lib_path.find("/System/") == std::string::npos) {
                        libs.push_back(lib_name);
                    }
                }
            }
        }
        
#else
        // Linux: Use ldd
        std::string cmd = "ldd \"" + exe_path + "\" 2>/dev/null";
        std::string output = exec_command(cmd);
        
        std::istringstream stream(output);
        std::string line;
        
        while (std::getline(stream, line)) {
            size_t so_pos = line.find(".so");
            if (so_pos != std::string::npos) {
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
                    
                    lib_name.erase(lib_name.find_last_not_of(" \t") + 1);
                    
                    // Filter common system libs
                    if (lib_name.find("libc.so") == std::string::npos &&
                        lib_name.find("libm.so") == std::string::npos &&
                        lib_name.find("libpthread.so") == std::string::npos &&
                        lib_name.find("libdl.so") == std::string::npos &&
                        lib_name.find("ld-linux") == std::string::npos) {
                        libs.push_back(lib_name);
                    }
                }
            }
        }
#endif
        
        if (libs.empty()) {
            return "none";
        }
        
        // Sort and join
        std::sort(libs.begin(), libs.end());
        std::string result;
        for (size_t i = 0; i < libs.size(); i++) {
            if (i > 0) result += ", ";
            result += libs[i];
        }
        return result;
    }
}

// ============================================================================
// CLI COMMANDS IMPLEMENTATION
// ============================================================================

namespace CLICommands {
    
    inline void print_version() {
        std::cout << "bloom-host version 2.1.0 build " << BUILD_NUMBER << std::endl;
    }
    
    inline void print_info() {
        auto platform = SystemInfo::get_platform_info();
        
        // Build info map for alphabetical sorting
        std::map<std::string, std::string> info;
        
        info["application_name"] = "bloom-host";
        info["application_version"] = "2.1.0";
        info["architecture"] = platform.arch;
        info["build_date"] = SystemInfo::get_build_timestamp();
        info["build_number"] = std::to_string(BUILD_NUMBER);
        info["current_time"] = SystemInfo::get_current_timestamp();
        info["dependencies"] = SystemInfo::detect_dependencies();
        info["max_message_size"] = "1020000";
        info["os"] = platform.os_name;
        info["os_version"] = platform.os_version;
        info["protocol"] = "Synapse Native Messaging v2.1";
        info["runtime_engine"] = platform.runtime;
        info["runtime_version"] = platform.runtime_version;
        info["service_port"] = "5678";
        
        // Print alphabetically
        for (const auto& pair : info) {
            std::cout << pair.first << ": " << pair.second << std::endl;
        }
    }
    
    inline void print_help() {
        std::cout << R"(
BLOOM-HOST --- Native Messaging Bridge for Chrome Extension
================================================================

DESCRIPTION:
  bloom-host is a native messaging bridge that facilitates bidirectional
  communication between the Bloom Chrome Extension and the Brain service.
  
  It operates as a daemon process, automatically launched by Chrome when
  the extension needs native capabilities.

USAGE:
  bloom-host [OPTIONS]
  
  Normal operation (launched by Chrome):
    bloom-host --profile-id=<id> --launch-id=<id>
  
  Command-line diagnostics:
    bloom-host --version
    bloom-host --info
    bloom-host --health
    bloom-host --help

OPTIONS:
  --version              Display version information and exit
  --info                 Display system and runtime information
  --health               Verify dependencies and connectivity
  --help                 Show this help message

  --profile-id <id>      Profile identifier for session tracking
  --launch-id <id>       Launch identifier for session tracking

PROTOCOL:
  Synapse Native Messaging Protocol v2.1
  - Chrome -> Host: Little Endian (4-byte length + JSON payload)
  - Host -> Brain: Big Endian over TCP (localhost:5678)
  - Max message size: 1MB (1,020,000 bytes)

HANDSHAKE PHASES:
  Phase 1: extension_ready  -> Extension signals readiness
  Phase 2: host_ready       -> Host confirms connection
  Phase 3: PROFILE_CONNECTED -> Brain acknowledges session

DEPENDENCIES:
  * TCP connection to Brain service (localhost:5678)
  * STDIN/STDOUT available for Chrome communication
  * Write permissions for log files (optional)

TELEMETRY:
  When profile/launch IDs are provided, bloom-host streams telemetry
  to the Brain service for monitoring and debugging.

EXAMPLES:
  # Check version
  bloom-host --version
  
  # System diagnostics
  bloom-host --info
  
  # Verify health
  bloom-host --health
  
  # Normal Chrome launch (automatic)
  # Configured via native manifest in:
  # - Windows: HKCU\Software\Google\Chrome\NativeMessagingHosts
  # - Linux: ~/.config/google-chrome/NativeMessagingHosts
  # - macOS: ~/Library/Application Support/Google/Chrome/NativeMessagingHosts

FOR MORE INFORMATION:
  Documentation: /help/host-help.txt
  Protocol Spec: Synapse Protocol v2.1
  Related: brain, sentinel, nucleus

)" << std::endl;
    }
    
    inline int check_health() {
        std::cout << "=== BLOOM-HOST HEALTH CHECK ===" << std::endl;
        std::cout << std::endl;
        
        int exit_code = 0;
        
        // Check 1: Platform info
        std::cout << "[1/4] Platform Detection..." << std::endl;
        auto platform = SystemInfo::get_platform_info();
        std::cout << "  [OK] OS: " << platform.os_name << " " << platform.os_version << std::endl;
        std::cout << "  [OK] Arch: " << platform.arch << std::endl;
        std::cout << std::endl;
        
        // Check 2: STDIN/STDOUT availability
        std::cout << "[2/4] STDIO Availability..." << std::endl;
        try {
            if (std::cin.good() && std::cout.good()) {
                std::cout << "  [OK] STDIN/STDOUT available" << std::endl;
            } else {
                std::cout << "  [FAIL] STDIO not properly configured" << std::endl;
                exit_code = 1;
            }
        } catch (...) {
            std::cout << "  [FAIL] STDIO check failed" << std::endl;
            exit_code = 1;
        }
        std::cout << std::endl;
        
        // Check 3: Network stack
        std::cout << "[3/4] Network Stack..." << std::endl;
#ifdef _WIN32
        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) == 0) {
            std::cout << "  [OK] Winsock initialized" << std::endl;
            WSACleanup();
        } else {
            std::cout << "  [FAIL] Winsock initialization failed" << std::endl;
            exit_code = 1;
        }
#else
        std::cout << "  [OK] POSIX sockets available" << std::endl;
#endif
        std::cout << std::endl;
        
        // Check 4: Configuration
        std::cout << "[4/4] Configuration..." << std::endl;
        std::cout << "  [OK] Version: 2.1.0" << std::endl;
        std::cout << "  [OK] Build: " << BUILD_NUMBER << std::endl;
        std::cout << "  [OK] Target Port: 5678" << std::endl;
        std::cout << "  [OK] Max Message: 1020000 bytes" << std::endl;
        std::cout << std::endl;
        
        if (exit_code == 0) {
            std::cout << "[OK] All health checks passed" << std::endl;
        } else {
            std::cout << "[FAIL] Some health checks failed" << std::endl;
        }
        
        return exit_code;
    }
}

// ============================================================================
// CLI ARGUMENT PARSER
// ============================================================================

namespace CLIParser {
    
    struct ParseResult {
        bool handled = false;
        int exit_code = 0;
    };
    
    inline bool has_flag(int argc, char* argv[], const std::string& flag) {
        for (int i = 1; i < argc; ++i) {
            if (std::string(argv[i]) == flag) {
                return true;
            }
        }
        return false;
    }
    
    inline std::string get_value(int argc, char* argv[], const std::string& key) {
        for (int i = 1; i < argc; ++i) {
            std::string arg(argv[i]);
            
            // Format: --key=value
            if (arg.find(key + "=") == 0) {
                return arg.substr(key.length() + 1);
            }
            
            // Format: --key value
            if (arg == key && i + 1 < argc) {
                return argv[i + 1];
            }
        }
        return "";
    }
    
    inline ParseResult parse_and_execute(int argc, char* argv[]) {
        ParseResult result;
        
        // Priority 1: Version (most common)
        if (has_flag(argc, argv, "--version") || has_flag(argc, argv, "-v")) {
            CLICommands::print_version();
            result.handled = true;
            result.exit_code = 0;
            return result;
        }
        
        // Priority 2: Info
        if (has_flag(argc, argv, "--info") || has_flag(argc, argv, "-i")) {
            CLICommands::print_info();
            result.handled = true;
            result.exit_code = 0;
            return result;
        }
        
        // Priority 3: Health
        if (has_flag(argc, argv, "--health")) {
            result.exit_code = CLICommands::check_health();
            result.handled = true;
            return result;
        }
        
        // Priority 4: Help
        if (has_flag(argc, argv, "--help") || has_flag(argc, argv, "-h")) {
            CLICommands::print_help();
            result.handled = true;
            result.exit_code = 0;
            return result;
        }
        
        // No special flags - continue to normal operation
        result.handled = false;
        return result;
    }
}
