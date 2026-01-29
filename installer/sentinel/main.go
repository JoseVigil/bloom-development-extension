package main

import (
	"fmt"
	"os"
	"sentinel/cli"
	"sentinel/internal/core"
	"sentinel/internal/eventbus"
	"sentinel/internal/startup"
	"github.com/spf13/cobra"

	// Registro de comandos mediante imports en blanco
	_ "sentinel/internal/boot"
	_ "sentinel/internal/bridge"
	_ "sentinel/internal/health"
	_ "sentinel/internal/ignition"
	_ "sentinel/internal/seed"
	_ "sentinel/internal/system"
	_ "sentinel/internal/ui"
)

func main() {
	// DETECCIÓN TEMPRANA: Verificar modo de operación
	operationMode := detectOperationMode()
	
	switch operationMode {
	case "daemon":
		// Modo Daemon: iniciar como proceso persistente (sidecar)
		runDaemonMode()
		
	case "help":
		// Modo Help: mostrar ayuda sin inicialización completa
		runHelpMode()
		
	default:
		// Modo Normal: ejecución estándar de comandos CLI
		runNormalMode()
	}
}

// detectOperationMode analiza los argumentos para determinar el modo
func detectOperationMode() string {
	for _, arg := range os.Args {
		if arg == "--mode" {
			// Buscar el valor después de --mode
			for i, a := range os.Args {
				if a == "--mode" && i+1 < len(os.Args) {
					return os.Args[i+1]
				}
			}
		}
		if arg == "--help" || arg == "-h" || arg == "--json-help" {
			return "help"
		}
	}
	return "normal"
}

// runDaemonMode ejecuta Sentinel como proceso persistente (Sidecar)
func runDaemonMode() {
	// ============================================================
	// MODO DAEMON - REGLA DE ORO DE STDOUT/STDERR
	// ============================================================
	// - STDOUT: Exclusivo para eventos JSON (consumo de Electron)
	// - STDERR: Toda telemetría, logs, y mensajes de diagnóstico
	// ============================================================
	
	fmt.Fprintf(os.Stderr, "[DAEMON] ========================================\n")
	fmt.Fprintf(os.Stderr, "[DAEMON] Sentinel - Modo Sidecar Persistente\n")
	fmt.Fprintf(os.Stderr, "[DAEMON] ========================================\n")
	
	// Determinar dirección del Brain desde variable de entorno o default
	brainAddr := os.Getenv("BRAIN_ADDR")
	if brainAddr == "" {
		brainAddr = "127.0.0.1:5678"
	}
	
	// Crear e iniciar el modo daemon
	daemon := eventbus.NewDaemonMode(brainAddr)
	
	if err := daemon.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "[FATAL] Error iniciando modo daemon: %v\n", err)
		os.Exit(1)
	}
}

// runHelpMode muestra la ayuda sin inicialización completa
func runHelpMode() {
	// Modo silencioso: solo inicializar lo mínimo necesario
	c, err := core.InitializeSilent()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error inicializando core: %v\n", err)
		os.Exit(1)
	}
	defer c.Close()
	
	// Construir el comando raíz solo para el help
	rootCmd := buildRootCommand(c)
	
	// Verificar si es JSON help
	isJSONHelp := false
	for _, arg := range os.Args {
		if arg == "--json-help" {
			isJSONHelp = true
			break
		}
	}
	
	if isJSONHelp {
		cli.RenderHelpJSON(rootCmd)
	} else {
		cli.RenderFullDiscoveryHelp(rootCmd)
	}
}

// runNormalMode ejecuta Sentinel en modo CLI estándar
func runNormalMode() {
	// Modo normal: inicialización completa con logs
	c, err := core.Initialize()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error inicializando core: %v\n", err)
		os.Exit(1)
	}
	defer c.Close()
	
	// FASE STARTUP (solo en modo normal)
	if err := startup.Initialize(c); err != nil {
		c.Logger.Error("Fallo crítico en fase Startup: %v", err)
		os.Exit(1)
	}
	
	// Construir comando raíz
	rootCmd := buildRootCommand(c)
	
	// Intercepción de flags globales antes de la ejecución
	var jsonOutput bool
	rootCmd.PersistentFlags().BoolVar(&jsonOutput, "json", false, "Output en formato JSON para integración programática")
	
	_ = rootCmd.ParseFlags(os.Args)
	
	// Inyectar modo JSON en Core si está activo
	if jsonOutput {
		c.SetJSONMode(true)
	}
	
	// Ejecución del motor CLI
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

// buildRootCommand construye el comando raíz con todos los subcomandos
func buildRootCommand(c *core.Core) *cobra.Command {
	rootCmd := &cobra.Command{
		Use:   "sentinel",
		Short: "Sentinel Base v" + c.Config.Version,
		Long: `Sentinel - Modular Orchestrator for Bloom
		
Modos de operación:
  sentinel <command>           Ejecuta un comando específico (modo CLI)
  sentinel --mode daemon       Inicia como proceso persistente (Sidecar)
  sentinel --help              Muestra esta ayuda

Modo Daemon (Sidecar):
  El modo daemon convierte a Sentinel en un proceso persistente que:
  - Realiza auditoría de inicio (reconciliation logic)
  - Monitorea la salud de perfiles activos (Guardian)
  - Limpia procesos zombies de Chromium
  - Se comunica con Brain a través del EventBus
  - Emite eventos JSON en stdout para integración con Electron

  Uso: sentinel --mode daemon

  Variables de entorno:
    BRAIN_ADDR      Dirección del Brain (default: 127.0.0.1:5678)
    LOCALAPPDATA    Ruta base de datos (default: %LOCALAPPDATA%/BloomNucleus)`,
		Run: func(cmd *cobra.Command, args []string) {
			c.Logger.Success("Sentinel Base v%s activa y sincronizada.", c.Config.Version)
		},
	}
	
	// Flags Globales (Persistent Flags)
	var jsonHelp bool
	rootCmd.PersistentFlags().BoolVar(&jsonHelp, "json-help", false, "Exporta el help en formato JSON para integración con Electron")
	
	// Configuración del Help Renderer
	rootCmd.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		if jsonHelp {
			cli.RenderHelpJSON(cmd)
		} else {
			cli.RenderFullDiscoveryHelp(cmd)
		}
	})
	
	// Integración de comandos registrados en los paquetes internos
	for _, reg := range core.CommandRegistry {
		cmd := reg.Factory(c)
		
		// Inyectar metadatos de categoría para el renderizador visual
		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["category"] = reg.Category
		
		rootCmd.AddCommand(cmd)
	}
	
	return rootCmd
}