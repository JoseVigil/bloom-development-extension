package main

import (
	"fmt"
	"os"

	"nucleus/internal/cli"
	"nucleus/internal/core"

	// Importar comandos (auto-registro via init())
	_ "nucleus/internal/commands/system"

	"github.com/spf13/cobra"
)

func main() {
	// Detectar si se está solicitando ayuda
	isHelp := false
	jsonHelp := false
	for _, arg := range os.Args[1:] {
		if arg == "--help" || arg == "-h" {
			isHelp = true
		}
		if arg == "--json-help" {
			jsonHelp = true
			isHelp = true
		}
	}

	// Inicializar Core (silencioso si es help)
	var c *core.Core
	var err error

	if isHelp {
		c, err = core.NewCoreSilent()
	} else {
		c, err = core.NewCore(os.Stdout)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "Error initializing nucleus: %v\n", err)
		os.Exit(1)
	}
	defer c.Close()

	rootCmd := &cobra.Command{
		Use:   "nucleus",
		Short: "Core CLI for Bloom Ecosystem",
		Long:  "Nucleus is the governance layer for the Bloom organization, managing roles, identity, and authority.",
		PersistentPreRun: func(cmd *cobra.Command, args []string) {
			// Configurar modo JSON si el flag está presente
			if jsonFlag, _ := cmd.Flags().GetBool("json"); jsonFlag {
				c.SetJSONMode(true)
			}
		},
	}

	// Flags globales
	rootCmd.PersistentFlags().Bool("json", false, "Output in JSON format")
	rootCmd.PersistentFlags().Bool("verbose", false, "Verbose logging")

	// Flag especial para help en JSON
	rootCmd.Flags().BoolVar(&jsonHelp, "json-help", false, "Output help in JSON format")

	// Custom help
	rootCmd.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		if jsonHelp {
			cli.RenderHelpJSON(cmd)
		} else {
			config := cli.DefaultNucleusConfig()
			renderer := cli.NewModernHelpRenderer(os.Stdout, config)
			cli.RenderFullHelp(cmd, renderer)
		}
	})

	// Registrar comandos
	core.BuildCommands(c, rootCmd)

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}