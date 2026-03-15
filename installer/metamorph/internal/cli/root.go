package cli

import (
	"os"

	"github.com/bloom/metamorph/internal/core"
	"github.com/spf13/cobra"
)

// commandCategoryToLogCategory maps the command annotation "category" (used by
// RegisterCommand) to the log file category written by InitLogger.
//
// Log files produced:
//   metamorph_core_YYYYMMDD.log        — SYSTEM commands (info, version, status)
//   metamorph_operations_YYYYMMDD.log  — MAINTENANCE + ROLLBACK (rollout, cleanup, rollback)
//   metamorph_inspection_YYYYMMDD.log  — INSPECTION + RECONCILIATION (inspect, verify-sync, reconcile, generate-manifest)
var commandCategoryToLogCategory = map[string]string{
	"SYSTEM":          "CORE",
	"INSPECTION":      "INSPECTION",
	"RECONCILIATION":  "INSPECTION",
	"ROLLBACK":        "OPERATIONS",
	"MAINTENANCE":     "OPERATIONS",
}

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

			// Resolve the log category from the command's registered category.
			// Falls back to "CORE" for any command without an annotation.
			cmdCategory := cmd.Annotations["category"]
			logCategory, ok := commandCategoryToLogCategory[cmdCategory]
			if !ok {
				logCategory = "CORE"
			}

			// Initialize the logger now that we know which command is running.
			// This ensures each category writes to its own dedicated log file,
			// and the logger is opened exactly once per process execution.
			if err := c.InitLoggerForCategory(logCategory); err != nil {
				// Logger failure is non-fatal — commands degrade gracefully.
				// The empty Logger{} from NewCore already guards all log calls.
				_ = err
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