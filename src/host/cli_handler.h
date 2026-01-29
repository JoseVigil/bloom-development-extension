#ifndef CLI_HANDLER_H
#define CLI_HANDLER_H

#include <string>

// Retorna true si manejó un comando CLI (--version o --info) y el programa debe salir
// Retorna false si debe continuar con el flujo normal
bool handle_cli_args(int argc, char* argv[]);

#endif // CLI_HANDLER_H
