package cli

import (
	"os"

	"github.com/bloom/metamorph/internal/core"
	"github.com/spf13/cobra"
)

func Execute(c *core.Core) error {
	rootCmd := createRootCommand(c)
	core.BuildCommands(c, rootCmd)
	return rootCmd.Execute()
}

func createRootCommand(c *core.Core) *cobra.Command {
	jsonHelp := false

	rootCmd := &cobra.Command{
		Use:   "metamorph",
		Short: "System State Reconciler",
		Long: `Metamorph - A declarative system state reconciler
		
Metamorph manages system binaries and configuration through declarative
manifests, providing atomic updates, rollback capabilities, and state inspection.`,
		PersistentPreRun: func(cmd *cobra.Command, args []string) {
			if jsonFlag, _ := cmd.Flags().GetBool("json"); jsonFlag {
				c.Config.OutputJSON = true
			}
			if verboseFlag, _ := cmd.Flags().GetBool("verbose"); verboseFlag {
				c.Config.Verbose = true
			}
		},
	}

	// Flags globales
	rootCmd.PersistentFlags().BoolVar(&c.Config.OutputJSON, "json", false, "Output in JSON format")
	rootCmd.PersistentFlags().BoolVar(&c.Config.Verbose, "verbose", false, "Verbose logging")
	rootCmd.Flags().BoolVar(&jsonHelp, "json-help", false, "Output help in JSON format")

	// Custom help
	rootCmd.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		if jsonHelp {
			RenderHelpJSON(cmd)
		} else {
			config := DefaultMetamorphConfig()
			renderer := NewModernHelpRenderer(os.Stdout, config)
			RenderFullHelp(cmd, renderer)
		}
	})

	// Deshabilitar completado
	rootCmd.CompletionOptions.DisableDefaultCmd = true

	return rootCmd
}
