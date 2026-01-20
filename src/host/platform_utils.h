#pragma once

#include <string>

#if defined(_WIN32) || defined(__MINGW32__) || defined(__MINGW64__)
    #ifndef _WIN32
        #define _WIN32
    #endif
    #ifndef WIN32_LEAN_AND_MEAN
        #define WIN32_LEAN_AND_MEAN
    #endif
    #include <winsock2.h>
    #include <ws2tcpip.h>
    #include <windows.h>

    typedef SOCKET socket_t;
    #define INVALID_SOCK INVALID_SOCKET
    #define close_socket closesocket
#else
    #include <sys/socket.h>
    #include <netinet/in.h>
    #include <unistd.h>
    #include <arpa/inet.h>

    typedef int socket_t;
    #define INVALID_SOCK -1
    #define close_socket close
#endif

/**
 * @brief Utilidades específicas de plataforma
 * 
 * Namespace que agrupa funciones de inicialización de red,
 * manejo de I/O binario y parsing de argumentos CLI.
 */
namespace PlatformUtils {
    /**
     * @brief Inicializa subsistemas de red según el SO
     * @return true si exitoso
     */
    bool initialize_networking();
    
    /**
     * @brief Limpia subsistemas de red
     */
    void cleanup_networking();
    
    /**
     * @brief Configura stdin/stdout como binario (Windows)
     */
    void setup_binary_io();
    
    /**
     * @brief Obtiene el PID del proceso actual
     * @return Process ID
     */
    int get_current_pid();
    
    /**
     * @brief Extrae valor de argumento de línea de comandos
     * @param argc Número de argumentos
     * @param argv Array de argumentos
     * @param flag Nombre del flag (e.g., "--launch-id")
     * @return Valor del argumento, o string vacío si no existe
     */
    std::string get_cli_argument(int argc, char* argv[], const std::string& flag);
}  // namespace PlatformUtils
