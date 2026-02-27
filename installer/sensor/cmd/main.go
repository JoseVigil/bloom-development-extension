// cmd/main.go

package main

import (
	"fmt"
	"os"
	"time"

	"bloom-sensor/internal/buildinfo"
	"bloom-sensor/internal/cli"
	"bloom-sensor/internal/cmdregistry"
	"bloom-sensor/internal/core"
	"bloom-sensor/internal/runtime"
	"bloom-sensor/internal/startup"
	"bloom-sensor/pkg/events"
	"github.com/spf13/cobra"
)

func main() {
	cfg := &core.Config{
		Channel: "stable",
	}

	c := core.NewCore(cfg)
	defer c.Shutdown()

	// Registro explícito de comandos — cada paquete recibe el Core
	buildinfo.RegisterCommands(c)
	runtime.RegisterCommands(c)
	startup.RegisterCommands(c)
	registerExportCommand(c)

	root := buildRootCommand(c)

	if err := root.Execute(); err != nil {
		c.Logger.Error("fatal: %v", err)
		os.Exit(1)
	}
}

func buildRootCommand(c *core.Core) *cobra.Command {
	root := &cobra.Command{
		Use:           "bloom-sensor",
		Short:         "Human presence runtime for the Bloom ecosystem",
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	root.PersistentFlags().BoolVar(&c.Config.Debug, "debug", false, "Enable debug logging")
	root.PersistentFlags().StringVar(&c.Config.Channel, "channel", "stable", "Release channel (stable|beta)")
	root.PersistentFlags().StringVar(&c.Config.ConfigPath, "config", "", "Config file path")
	root.PersistentFlags().BoolVar(&c.Config.OutputJSON, "json", false, "Output in JSON format")

	for _, factory := range cmdregistry.Commands() {
		root.AddCommand(factory())
	}

	renderer := cli.NewModernHelpRenderer(os.Stdout, cli.DefaultSensorConfig())
	root.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		cli.RenderFullHelp(root, renderer)
	})

	return root
}

// ─── export ──────────────────────────────────────────────────────────────────
// Vive en main porque metrics no puede importar core (ciclo: core → metrics → core).

type exportEnvelope struct {
	Period             string              `json:"period"`
	Samples            int                 `json:"samples"`
	AvgEnergyIndex     float64             `json:"avg_energy_index"`
	TotalActiveMinutes int                 `json:"total_active_minutes"`
	Snapshots          []events.HumanState `json:"snapshots"`
}

func registerExportCommand(c *core.Core) {
	cmdregistry.Register(func() *cobra.Command {
		var lastDuration string
		var format string

		cmd := &cobra.Command{
			Use:   "export",
			Short: "Export presence snapshots from the in-memory ring buffer",
			Long: `Reads snapshots from the ring buffer (capacity: 1440 — 24h at 1 tick/min).

Each snapshot contains:
  - timestamp (UTC)
  - session_active / session_locked
  - idle_seconds
  - energy_index [0.0–1.0]
  - sequence number

Use --last to filter by duration (e.g. 1h, 30m, 90m).
Output is always JSON regardless of --json flag.`,
			Annotations: map[string]string{
				"category": "TELEMETRY",
				"json_response": `{
  "period": "24h",
  "samples": 1440,
  "avg_energy_index": 0.62,
  "total_active_minutes": 312,
  "snapshots": [
    {
      "timestamp": "2026-02-27T15:04:05Z",
      "session_active": true,
      "session_locked": false,
      "idle_seconds": 12,
      "energy_index": 0.99,
      "sequence": 47
    }
  ]
}`,
			},
			Example: `bloom-sensor export
bloom-sensor export --last 1h
bloom-sensor export --last 30m
bloom-sensor --json export --last 2h`,
			RunE: func(cmd *cobra.Command, args []string) error {
				var snapshots []events.HumanState
				period := "24h"

				if lastDuration != "" {
					d, err := time.ParseDuration(lastDuration)
					if err != nil {
						return fmt.Errorf("invalid duration %q: %w", lastDuration, err)
					}
					snapshots = c.Buffer.Since(d)
					period = lastDuration
				} else {
					snapshots = c.Buffer.Last(1440)
				}

				var sumEnergy float64
				totalActive := 0
				for _, s := range snapshots {
					sumEnergy += s.EnergyIndex
					if s.SessionActive {
						totalActive++
					}
				}
				avgEnergy := 0.0
				if len(snapshots) > 0 {
					avgEnergy = sumEnergy / float64(len(snapshots))
				}

				return cmdregistry.PrintJSON(exportEnvelope{
					Period:             period,
					Samples:            len(snapshots),
					AvgEnergyIndex:     avgEnergy,
					TotalActiveMinutes: totalActive,
					Snapshots:          snapshots,
				})
			},
		}
		cmd.Flags().StringVar(&lastDuration, "last", "", "Export snapshots from the last duration (e.g. 1h, 30m, 90m)")
		cmd.Flags().StringVar(&format, "format", "json", "Output format (json)")
		return cmd
	})
}