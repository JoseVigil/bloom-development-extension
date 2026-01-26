package main

import (
	"os"
	"sentinel/cli"
	"sentinel/internal/core"
	"sentinel/internal/startup"
	"github.com/spf13/cobra"

	// Registro de comandos mediante imports en blanco
	_ "sentinel/internal/boot"
	_ "sentinel/internal/bridge"
	_ "sentinel/internal/health"
	_ "sentinel/internal/ignition"
	_ "sentinel/internal/seed"
	_ "sentinel/internal/ui"
)

func main() {
	// DETECCIÓN TEMPRANA: Verificar si es un comando de help antes de inicializar
	isHelpCommand := false
	isJSONHelp := false
	
	for _, arg := range os.Args {
		if arg == "--help" || arg == "-h" {
			isHelpCommand = true
		}
		if arg == "--json-help" {
			isJSONHelp = true
			isHelpCommand = true
		}
	}
	
	// Si es comando de help, inicializar en modo silencioso
	var c *core.Core
	var err error
	
	if isHelpCommand {
		// Modo silencioso: solo inicializar lo mínimo necesario
		c, err = core.InitializeSilent()
		if err != nil {
			os.Exit(1)
		}
	} else {
		// Modo normal: inicialización completa con logs
		c, err = core.Initialize()
		if err != nil {
			os.Exit(1)
		}
		
		// FASE STARTUP (solo en modo normal)
		if err := startup.Initialize(c); err != nil {
			c.Logger.Error("Fallo crítico en fase Startup: %v", err)
			os.Exit(1)
		}
	}
	defer c.Close()

	// Configuración del Comando Raíz
	rootCmd := &cobra.Command{
		Use:   "sentinel",
		Short: "Sentinel Base v" + c.Config.Version,
		Run: func(cmd *cobra.Command, args []string) {
			c.Logger.Success("Sentinel Base v%s activa y sincronizada.", c.Config.Version)
		},
	}

	// Flags Globales (Persistent Flags)
	var jsonHelp bool
	var jsonOutput bool
	rootCmd.PersistentFlags().BoolVar(&jsonHelp, "json-help", false, "Exporta el help en formato JSON para integración con Electron")
	rootCmd.PersistentFlags().BoolVar(&jsonOutput, "json", false, "Output en formato JSON para integración programática")

	// Configuración del Help Renderer (cli/)
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
		
		// Inyectamos metadatos de categoría para el renderizador visual
		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["category"] = reg.Category
		
		rootCmd.AddCommand(cmd)
	}

	// Intercepción de flags globales antes de la ejecución
	_ = rootCmd.ParseFlags(os.Args)
	
	// Capturamos el valor de --json y lo inyectamos en Core
	if jsonOutput {
		c.SetJSONMode(true)
	}
	
	// Si es --json-help, renderizar y salir inmediatamente
	if isJSONHelp {
		cli.RenderHelpJSON(rootCmd)
		return
	}

	// Ejecución del motor CLI
	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}