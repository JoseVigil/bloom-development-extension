// internal/buildinfo/buildinfo.go

package buildinfo

import (
	"fmt"

	"bloom-sensor/internal/cmdregistry"
	"bloom-sensor/internal/core"
	"github.com/spf13/cobra"
)

var (
	Version     = "dev"
	Commit      = "unknown"
	BuildNumber = "0"
	Channel     = "stable"
	BinaryName  = "bloom-sensor"
)

// RegisterCommands registra los comandos de buildinfo en el registry global.
// Debe ser llamado desde main con el Core ya inicializado.
func RegisterCommands(c *core.Core) {
	cmdregistry.Register(func() *cobra.Command { return newVersionCommand(c) })
	cmdregistry.Register(func() *cobra.Command { return newInfoCommand(c) })
}

func newVersionCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Display version and build information",
		Annotations: map[string]string{
			"category": "SYSTEM",
			"json_response": `{
  "version": "1.0.0",
  "channel": "stable",
  "build": "42",
  "commit": "abc1234"
}`,
		},
		Example: `bloom-sensor version
bloom-sensor --json version`,
		Run: func(cmd *cobra.Command, args []string) {
			if c.Config.OutputJSON {
				result := map[string]string{
					"version": Version,
					"channel": Channel,
					"build":   BuildNumber,
					"commit":  Commit,
				}
				cmdregistry.PrintJSON(result) //nolint:errcheck
			} else {
				fmt.Printf("%s %s (%s) build=%s\n", BinaryName, Version, Channel, BuildNumber)
			}
		},
	}
}

func newInfoCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "info",
		Short: "Display identity, capabilities and Metamorph contract",
		Annotations: map[string]string{
			"category": "SYSTEM",
			"json_response": `{
  "name": "bloom-sensor",
  "version": "1.0.0",
  "channel": "stable",
  "capabilities": [
    "session_monitoring",
    "idle_detection",
    "cognitive_metrics_v1"
  ],
  "requires": {
    "sentinel": ">=1.5.0"
  }
}`,
		},
		Example: `bloom-sensor info
bloom-sensor --json info`,
		Run: func(cmd *cobra.Command, args []string) {
			result := map[string]interface{}{
				"name":    BinaryName,
				"version": Version,
				"channel": Channel,
				"capabilities": []string{
					"session_monitoring",
					"idle_detection",
					"cognitive_metrics_v1",
				},
				"requires": map[string]string{
					"sentinel": ">=1.5.0",
				},
			}
			cmdregistry.PrintJSON(result) //nolint:errcheck
		},
	}
}