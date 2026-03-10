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
    _setmode(_fileno(stdin),  _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
    // FIX: stderr debe quedar unbuffered para que host_stderr.txt reciba
    // contenido aunque el proceso termine abruptamente. _setmode solo cambia
    // la traducción CR/LF; el buffering lo controla setvbuf por separado.
    // _IONBF = sin buffer: cada write va directo al handle del archivo.
    setvbuf(stderr, nullptr, _IONBF, 0);
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
    // BUG FIX: era `i < argc - 1`, lo que excluía el último par posible
    // cuando Chrome agrega la origin como arg extra al final del manifest args,
    // desplazando --user-base-dir al penúltimo slot. Correcto: iterar hasta
    // argc (excluyendo), tomando argv[i+1] solo si i+1 < argc.
    for (int i = 1; i < argc; ++i) {
        if (std::string(argv[i]) == flag) {
            if (i + 1 < argc) {
                return std::string(argv[i + 1]);
            }
        }
    }
    return "";
}

} // namespace PlatformUtils
