package system

import (
	"encoding/json"
	"fmt"

	"sentinel/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("SYSTEM", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "version",
			Short: "Display version and build information",
			Long: `Shows the current release version and build number of Sentinel.

This command displays the semantic version (e.g., 2.1.0) and the 
incremental build counter that is automatically updated during compilation.

Example output:
  sentinel release 2.1.0 build 42`,

			Args: cobra.NoArgs,

			Run: func(cmd *cobra.Command, args []string) {
				// Leer el flag PRIMERO y configurar el logger antes de cualquier log
				jsonOutput, _ := cmd.Flags().GetBool("json")
				if jsonOutput {
					c.Logger.SetJSONMode(true) // redirige [INFO] a stderr, stdout queda limpio
				}

				c.Logger.Info("Executing %s command", cmd.Name())

				info := core.GetVersionInfo()

				if jsonOutput {
					output, _ := json.MarshalIndent(info, "", "  ")
					fmt.Println(string(output))
				} else {
					fmt.Println(info.FullRelease)
				}
			},
		}

		return cmd
	})
}