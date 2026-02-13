#include "platform_utils.h"
#include <iostream>

#ifdef _WIN32
    #include <fcntl.h>
    #include <io.h>
    #include <process.h>
#else
    #include <unistd.h>
#endif

namespace PlatformUtils {

bool initialize_networking() {
#ifdef _WIN32
    WSADATA wsa;
    return WSAStartup(MAKEWORD(2, 2), &wsa) == 0;
#else
    return true; // Unix no requiere inicialización
#endif
}

void cleanup_networking() {
#ifdef _WIN32
    WSACleanup();
#endif
}

void setup_binary_io() {
#ifdef _WIN32
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
#endif
}

int get_current_pid() {
#ifdef _WIN32
    return _getpid();
#else
    return getpid();
#endif
}

std::string get_cli_argument(int argc, char* argv[], const std::string& flag) {
    for (int i = 1; i < argc - 1; ++i) {
        if (std::string(argv[i]) == flag) {
            return std::string(argv[i + 1]);
        }
    }
    return "";
}

} // namespace PlatformUtils