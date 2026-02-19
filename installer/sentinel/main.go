package main

import (
	"fmt"
	"os"
	"sentinel/cli"
	"sentinel/internal/core"
	"sentinel/internal/startup"
	"github.com/spf13/cobra"

	// Registro de comandos mediante imports en blanco
	_ "sentinel/internal/bridge"
	_ "sentinel/internal/eventbus"
	_ "sentinel/internal/ignition"
	_ "sentinel/internal/seed"
	_ "sentinel/internal/system"
	_ "sentinel/internal/ui"	
	_ "sentinel/internal/temporal"
	_ "sentinel/internal/ollama"
)

func main() {
	// DETECCIÓN TEMPRANA: Verificar modo de operación
	operationMode := detectOperationMode()
	
	switch operationMode {
	case "help":
		// Modo Help: mostrar ayuda sin inicialización completa
		runHelpMode()
		
	case "daemon":
		// Modo Daemon: inicialización completa con startup
		runDaemonMode()
		
	default:
		// Modo Command: ejecución de comandos CLI sin startup
		runCommandMode()
	}
}

// detectOperationMode analiza los argumentos para determinar el modo
func detectOperationMode() string {
	for _, arg := range os.Args {
		if arg == "--help" || arg == "-h" || arg == "--json-help" {
			return "help"
		}
		if arg == "daemon" {
			return "daemon"
		}
	}
	return "command"
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

// runDaemonMode ejecuta Sentinel como proceso persistente
func runDaemonMode() {
	// Modo daemon: inicialización completa con logs Y startup
	c, err := core.Initialize()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error inicializando core: %v\n", err)
		os.Exit(1)
	}
	defer c.Close()
	
	// FASE STARTUP (solo en modo daemon)
	if err := startup.Initialize(c); err != nil {
		c.Logger.Error("Fallo crítico en fase Startup: %v", err)
		os.Exit(1)
	}
	
	// Construir comando raíz
	rootCmd := buildRootCommand(c)
	
	// Intercepción de flags globales
	var jsonOutput bool
	rootCmd.PersistentFlags().BoolVar(&jsonOutput, "json", false, "Output en formato JSON")
	_ = rootCmd.ParseFlags(os.Args[1:]) // Args[0] es el binario, no un flag
	
	if jsonOutput {
		c.Logger.SetSilentMode(true)
	}
	
	// Ejecución del motor CLI
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

// runCommandMode ejecuta comandos CLI SIN startup
func runCommandMode() {
	// Modo command: inicialización básica SIN startup
	c, err := core.Initialize()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error inicializando core: %v\n", err)
		os.Exit(1)
	}
	defer c.Close()
	
	// NO ejecutar startup.Initialize() - solo comandos CLI
	
	// Construir comando raíz
	rootCmd := buildRootCommand(c)
	
	// Intercepción de flags globales
	var jsonOutput bool
	rootCmd.PersistentFlags().BoolVar(&jsonOutput, "json", false, "Output en formato JSON")
	_ = rootCmd.ParseFlags(os.Args[1:]) // Args[0] es el binario, no un flag
	
	if jsonOutput {
		c.Logger.SetSilentMode(true)
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
  sentinel daemon              Inicia como proceso persistente (Sidecar)
  sentinel --help              Muestra esta ayuda

Modo Daemon (Sidecar):
  El modo daemon convierte a Sentinel en un proceso persistente que:
  - Realiza auditoría de inicio (reconciliation logic)
  - Monitorea la salud de perfiles activos (Guardian)
  - Limpia procesos zombies de Chromium
  - Se comunica con Brain a través del EventBus
  - Emite eventos JSON en stdout para integración con Electron`,
		Run: func(cmd *cobra.Command, args []string) {
			c.Logger.Success("Sentinel Base v%s activa y sincronizada.", c.Config.Version)
		},
	}
	
	// Flags Globales (Persistent Flags)
	var jsonHelp bool
	rootCmd.PersistentFlags().BoolVar(&jsonHelp, "json-help", false, "Exporta el help en formato JSON")
	
	// Configuración del Help Renderer
	rootCmd.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		if jsonHelp {
			cli.RenderHelpJSON(cmd)
		} else {
			cli.RenderFullDiscoveryHelp(cmd)
		}
	})
	
	// Integración de comandos registrados
	for _, reg := range core.CommandRegistry {
		cmd := reg.Factory(c)
		
		// Inyectar metadatos de categoría
		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["category"] = reg.Category
		
		rootCmd.AddCommand(cmd)
	}
	
	return rootCmd
}