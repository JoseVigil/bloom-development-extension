package main

import (
	"os"
	"sentinel/cli" // Importamos tu nuevo paquete de UI
	"sentinel/internal/core"
	"sentinel/internal/startup"
	"github.com/spf13/cobra"

	_ "sentinel/internal/boot"
	_ "sentinel/internal/bridge"
	_ "sentinel/internal/health"
	_ "sentinel/internal/ignition"
	_ "sentinel/internal/seed"
	_ "sentinel/internal/ui"
)

func main() {
	c, err := core.Initialize()
	if err != nil {
		os.Exit(1)
	}
	defer c.Close()

	if err := startup.Initialize(c); err != nil {
		c.Logger.Error("Fallo crítico: %v", err)
		os.Exit(1)
	}

	rootCmd := &cobra.Command{
		Use:   "sentinel",
		Short: "Sentinel Base v" + c.Config.Version,
	}

	// Delegación al renderizador del paquete cli
	rootCmd.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		cli.RenderFullDiscoveryHelp(cmd)
	})

	for _, reg := range core.CommandRegistry {
		cmd := reg.Factory(c)
		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["category"] = reg.Category
		rootCmd.AddCommand(cmd)
	}

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}