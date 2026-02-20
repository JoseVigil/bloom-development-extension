package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"bloom-launcher/internal/executor"
	"bloom-launcher/internal/info"
	"bloom-launcher/internal/logger"
	"bloom-launcher/internal/pipe"
	"bloom-launcher/internal/startup"
)

func main() {
	// Detectar flag global --json (puede aparecer en cualquier posición)
	jsonMode := hasFlag("--json")
	// Args sin el flag --json para el switch de comandos
	args := stripFlag(os.Args[1:], "--json")

	if len(args) > 0 {
		switch args[0] {
		case "version", "--version":
			info.PrintVersion(jsonMode)
			os.Exit(0)

		case "info":
			info.PrintInfo(jsonMode)
			os.Exit(0)

		case "install":
			exePath, _ := os.Executable()
			if err := startup.Register(exePath); err != nil {
				fmt.Fprintf(os.Stderr, "ERROR: no se pudo registrar en startup: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("OK: bloom-launcher registrado en startup del usuario")
			os.Exit(0)

		case "uninstall":
			if err := startup.Unregister(); err != nil {
				fmt.Fprintf(os.Stderr, "ERROR: no se pudo desregistrar: %v\n", err)
				os.Exit(1)
			}
			fmt.Println("OK: bloom-launcher removido del startup")
			os.Exit(0)

		case "status":
			if pipe.IsRunning() {
				fmt.Println("RUNNING")
			} else {
				fmt.Println("STOPPED")
			}
			os.Exit(0)

		case "serve":
			runDaemon(logger.New())

		default:
			fmt.Fprintf(os.Stderr, "comando desconocido: %s\n", args[0])
			fmt.Fprintf(os.Stderr, "uso: bloom-launcher.exe [--json] [serve|install|uninstall|status|version|info]\n")
			os.Exit(1)
		}
	} else {
		// Sin argumentos → daemon
		runDaemon(logger.New())
	}
}

func runDaemon(log *logger.Logger) {
	log.Info("bloom-launcher iniciando...")
	log.Info("Modo: daemon (named pipe server)")

	// Auto-reparar entrada de startup si fue borrada
	exePath, err := os.Executable()
	if err == nil {
		if !startup.IsRegistered() {
			log.Info("Startup entry missing — auto-reparando...")
			if err := startup.Register(exePath); err != nil {
				log.Warn("No se pudo auto-reparar startup: %v", err)
			} else {
				log.Info("Startup entry restaurada")
			}
		}
	}

	// Crear el servidor de named pipe
	server, err := pipe.NewServer(executor.HandleLaunch, log)
	if err != nil {
		log.Error("No se pudo crear pipe server: %v", err)
		os.Exit(1)
	}

	// Arrancar en goroutine
	go func() {
		if err := server.Listen(); err != nil {
			log.Error("Pipe server error: %v", err)
			os.Exit(1)
		}
	}()

	log.Info("Escuchando en: \\\\.\\pipe\\bloom-launcher")
	log.Info("Listo para recibir órdenes de lanzamiento")

	// Esperar señal de cierre
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
	<-sig

	log.Info("Cerrando bloom-launcher...")
	server.Close()
}

// hasFlag busca un flag en os.Args independientemente de su posición.
func hasFlag(flag string) bool {
	for _, a := range os.Args[1:] {
		if a == flag {
			return true
		}
	}
	return false
}

// stripFlag devuelve args sin las ocurrencias de flag.
func stripFlag(args []string, flag string) []string {
	out := make([]string, 0, len(args))
	for _, a := range args {
		if a != flag {
			out = append(out, a)
		}
	}
	return out
}