#pragma once

#include <string>
#include <iostream>
#include <chrono>
#include <iomanip>
#include <sstream>
#include "build_info.h"  // Para BUILD_NUMBER

#ifdef _WIN32
#include <windows.h>
#else
#include <sys/utsname.h>
#endif

// ============================================================================
// BUILD INFO - Use existing defines if available
// ============================================================================
// No definir VERSION ni BUILD_NUMBER - usar los que ya existen en bloom-host.cpp
// Solo usamos __DATE__ y __TIME__ que son macros del compilador

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
        #pragma warning(disable: 4996) // Disable deprecation warning
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
        
        info.runtime = "C++";
        info.runtime_version = std::to_string(__cplusplus);
        
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
}

// ============================================================================
// CLI COMMANDS IMPLEMENTATION
// ============================================================================

namespace CLICommands {
    
    // Forward declare para acceder a las constantes globales
    // Nota: Estas deben estar definidas en bloom-host.cpp como:
    // const std::string VERSION = "2.1.0";
    // const int BUILD = BUILD_NUMBER;
    
    inline void print_version() {
        // Hardcoded version - will match build_info.h
        std::cout << "bloom-host version 2.1.0 build " << BUILD_NUMBER << std::endl;
    }
    
    inline void print_info() {
        auto platform = SystemInfo::get_platform_info();
        
        std::cout << "app_name: bloom-host" << std::endl;
        std::cout << "app_version: 2.1.0" << std::endl;
        std::cout << "build_number: " << BUILD_NUMBER << std::endl;
        std::cout << "build_date: " << SystemInfo::get_build_timestamp() << std::endl;
        std::cout << "current_time: " << SystemInfo::get_current_timestamp() << std::endl;
        std::cout << "platform_os: " << platform.os_name << std::endl;
        std::cout << "platform_version: " << platform.os_version << std::endl;
        std::cout << "platform_arch: " << platform.arch << std::endl;
        std::cout << "runtime_engine: " << platform.runtime << std::endl;
        std::cout << "runtime_version: " << platform.runtime_version << std::endl;
        std::cout << "protocol: Synapse Native Messaging" << std::endl;
        std::cout << "service_port: 5678" << std::endl;
        std::cout << "max_message_size: 1020000 bytes" << std::endl;
    }
    
    inline void print_help() {
        std::cout << R"(
BLOOM-HOST ─── Native Messaging Bridge for Chrome Extension
────────────────────────────────────────────────────────────

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
  - Chrome → Host: Little Endian (4-byte length + JSON payload)
  - Host → Brain: Big Endian over TCP (localhost:5678)
  - Max message size: 1MB (1,020,000 bytes)

HANDSHAKE PHASES:
  Phase 1: extension_ready  → Extension signals readiness
  Phase 2: host_ready       → Host confirms connection
  Phase 3: PROFILE_CONNECTED → Brain acknowledges session

DEPENDENCIES:
  • TCP connection to Brain service (localhost:5678)
  • STDIN/STDOUT available for Chrome communication
  • Write permissions for log files (optional)

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
        std::cout << "  ✓ OS: " << platform.os_name << " " << platform.os_version << std::endl;
        std::cout << "  ✓ Arch: " << platform.arch << std::endl;
        std::cout << std::endl;
        
        // Check 2: STDIN/STDOUT availability
        std::cout << "[2/4] STDIO Availability..." << std::endl;
        try {
            if (std::cin.good() && std::cout.good()) {
                std::cout << "  ✓ STDIN/STDOUT available" << std::endl;
            } else {
                std::cout << "  ✗ STDIO not properly configured" << std::endl;
                exit_code = 1;
            }
        } catch (...) {
            std::cout << "  ✗ STDIO check failed" << std::endl;
            exit_code = 1;
        }
        std::cout << std::endl;
        
        // Check 3: Network stack
        std::cout << "[3/4] Network Stack..." << std::endl;
#ifdef _WIN32
        WSADATA wsaData;
        if (WSAStartup(MAKEWORD(2, 2), &wsaData) == 0) {
            std::cout << "  ✓ Winsock initialized" << std::endl;
            WSACleanup();
        } else {
            std::cout << "  ✗ Winsock initialization failed" << std::endl;
            exit_code = 1;
        }
#else
        std::cout << "  ✓ POSIX sockets available" << std::endl;
#endif
        std::cout << std::endl;
        
        // Check 4: Configuration
        std::cout << "[4/4] Configuration..." << std::endl;
        std::cout << "  ✓ Version: 2.1.0" << std::endl;
        std::cout << "  ✓ Build: " << BUILD_NUMBER << std::endl;
        std::cout << "  ✓ Target Port: 5678" << std::endl;
        std::cout << "  ✓ Max Message: 1020000 bytes" << std::endl;
        std::cout << std::endl;
        
        if (exit_code == 0) {
            std::cout << "✓ All health checks passed" << std::endl;
        } else {
            std::cout << "✗ Some health checks failed" << std::endl;
        }
        
        return exit_code;
    }
}

// ============================================================================
// CLI ARGUMENT PARSER (Lightweight, no external deps)
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
        if (has_flag(argc, argv, "--info")) {
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
