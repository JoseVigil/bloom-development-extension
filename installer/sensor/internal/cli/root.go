// internal/cli/root.go

package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"bloom-sensor/internal/buildinfo"
	"bloom-sensor/internal/core"
	"bloom-sensor/internal/runtime"
	"bloom-sensor/internal/startup"
	"bloom-sensor/pkg/events"
	"github.com/spf13/cobra"
)

// BuildRootCommand construye el árbol de comandos Cobra de Sensor.
// Todos los comandos se registran explícitamente (no auto-discovery).
func BuildRootCommand(c *core.Core) *cobra.Command {
	root := &cobra.Command{
		Use:           "bloom-sensor",
		Short:         "Human presence runtime for the Bloom ecosystem",
		SilenceUsage:  true,
		SilenceErrors: true,
	}

	// Flags globales — vinculados directamente al Config del Core
	root.PersistentFlags().BoolVar(&c.Config.Debug, "debug", false, "Enable debug logging")
	root.PersistentFlags().StringVar(&c.Config.Channel, "channel", "stable", "Release channel (stable|beta)")
	root.PersistentFlags().StringVar(&c.Config.ConfigPath, "config", "", "Config file path")
	root.PersistentFlags().BoolVar(&c.Config.OutputJSON, "json", false, "Output in JSON format")

	// Registro explícito de los 7 comandos
	root.AddCommand(createVersionCommand(c)) // SYSTEM
	root.AddCommand(createInfoCommand(c))    // SYSTEM
	root.AddCommand(createRunCommand(c))     // RUNTIME
	root.AddCommand(createStatusCommand(c))  // RUNTIME
	root.AddCommand(createEnableCommand(c))  // LIFECYCLE
	root.AddCommand(createDisableCommand(c)) // LIFECYCLE
	root.AddCommand(createExportCommand(c))  // TELEMETRY

	// Help renderer real — homólogo a Nucleus
	renderer := NewModernHelpRenderer(os.Stdout, DefaultSensorConfig())
	root.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		RenderFullHelp(root, renderer)
	})

	return root
}

// ─── SYSTEM ──────────────────────────────────────────────────────────────────

func createVersionCommand(c *core.Core) *cobra.Command {
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
					"version": buildinfo.Version,
					"channel": buildinfo.Channel,
					"build":   buildinfo.BuildNumber,
					"commit":  buildinfo.Commit,
				}
				printJSON(result) //nolint:errcheck
			} else {
				fmt.Printf("%s %s (%s) build=%s\n",
					buildinfo.BinaryName, buildinfo.Version, buildinfo.Channel, buildinfo.BuildNumber)
			}
		},
	}
}

func createInfoCommand(c *core.Core) *cobra.Command {
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
				"name":    buildinfo.BinaryName,
				"version": buildinfo.Version,
				"channel": buildinfo.Channel,
				"capabilities": []string{
					"session_monitoring",
					"idle_detection",
					"cognitive_metrics_v1",
				},
				"requires": map[string]string{
					"sentinel": ">=1.5.0",
				},
			}
			printJSON(result) //nolint:errcheck
		},
	}
}

// ─── RUNTIME ────────────────────────────────────────────────────────────────

func createRunCommand(c *core.Core) *cobra.Command {
	var once bool
	var foreground bool
	var diagnostic bool

	cmd := &cobra.Command{
		Use:   "run",
		Short: "Start the human presence detection loop",
		Long: `Starts the persistent presence detection engine.

The engine runs a tick loop every 60 seconds, collecting:
  - Windows session state (active / locked)
  - Idle time via GetLastInputInfo
  - energy_index [0.0–1.0] computed deterministically

On start, emits HUMAN_SESSION_ACTIVE to Sentinel.
On stop (SIGINT / context cancel), emits HUMAN_SESSION_LOCKED.

Use --once for a single diagnostic tick.
Use --foreground to keep stdout open for debugging.
Use --diagnostic to print each tick with full metric detail.`,
		Annotations: map[string]string{
			"category": "RUNTIME",
			"json_response": `{
  "status": "running",
  "pid": 1234,
  "session": "active",
  "sentinel_connected": true
}`,
		},
		Example: `bloom-sensor run
bloom-sensor run --once
bloom-sensor run --diagnostic
bloom-sensor --json run --once`,
		RunE: func(cmd *cobra.Command, args []string) error {
			engine := runtime.NewEngine(c)
			if once {
				state := engine.RunOnce()
				if c.Config.OutputJSON {
					result := map[string]interface{}{
						"status":             "running",
						"pid":                os.Getpid(),
						"session":            map[bool]string{true: "active", false: "locked"}[state.SessionActive],
						"sentinel_connected": c.SentinelClient.IsConnected(),
					}
					return printJSON(result)
				}
				fmt.Printf("tick: energy=%.2f idle=%ds session_active=%v seq=%d\n",
					state.EnergyIndex, state.IdleSeconds, state.SessionActive, state.Sequence)
				return nil
			}
			if c.Config.OutputJSON {
				result := map[string]interface{}{
					"status":             "running",
					"pid":                os.Getpid(),
					"session":            "active",
					"sentinel_connected": c.SentinelClient.IsConnected(),
				}
				printJSON(result) //nolint:errcheck
			}
			_ = foreground
			_ = diagnostic
			engine.Run()
			return nil
		},
	}
	cmd.Flags().BoolVar(&once, "once", false, "Execute a single tick and exit (diagnostic mode)")
	cmd.Flags().BoolVar(&foreground, "foreground", false, "Keep stdout open (useful for debugging)")
	cmd.Flags().BoolVar(&diagnostic, "diagnostic", false, "Print each tick to stdout with full metric detail")
	return cmd
}

func createStatusCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Report current sensor process, autostart and Sentinel connection status",
		Annotations: map[string]string{
			"category": "RUNTIME",
			"json_response": `{
  "process_running": true,
  "pid": 1234,
  "autostart_registered": true,
  "sentinel_connected": true,
  "last_state_update": "2026-02-24T15:04:05Z"
}`,
		},
		Example: `bloom-sensor status
bloom-sensor --json status`,
		RunE: func(cmd *cobra.Command, args []string) error {
			enabled, _ := startup.IsEnabled()

			var lastStateUpdate string
			if c.CurrentState != nil && !c.CurrentState.Timestamp.IsZero() {
				lastStateUpdate = c.CurrentState.Timestamp.UTC().Format(time.RFC3339)
			}

			status := map[string]interface{}{
				"process_running":      true,
				"pid":                  os.Getpid(),
				"autostart_registered": enabled,
				"sentinel_connected":   c.SentinelClient.IsConnected(),
				"last_state_update":    lastStateUpdate,
			}
			return printJSON(status)
		},
	}
}

// ─── LIFECYCLE ───────────────────────────────────────────────────────────────

func createEnableCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "enable",
		Short: "Register bloom-sensor for automatic startup at user login (HKCU\\Run)",
		Long: `Writes BloomSensor to HKCU\Software\Microsoft\Windows\CurrentVersion\Run.

The registered value is:
  "C:\path\to\bloom-sensor.exe" run

If the legacy BloomLauncher key exists, it is removed automatically.
The operation is idempotent — safe to run multiple times.`,
		Annotations: map[string]string{
			"category": "LIFECYCLE",
			"json_response": `{
  "success": true,
  "registry_key": "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\BloomSensor",
  "value": "C:\\Bloom\\bloom-sensor.exe run"
}`,
		},
		Example: `bloom-sensor enable
bloom-sensor --json enable`,
		RunE: func(cmd *cobra.Command, args []string) error {
			exePath, err := os.Executable()
			if err != nil {
				return fmt.Errorf("could not determine executable path: %w", err)
			}
			// Strip the exe filename to get the install directory
			dir := exePath[:len(exePath)-len("bloom-sensor.exe")]
			if err := startup.Enable(dir); err != nil {
				return err
			}
			c.Logger.Info("autostart enabled: %s", dir)
			result := map[string]interface{}{
				"success":      true,
				"registry_key": `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\BloomSensor`,
				"value":        exePath + " run",
			}
			return printJSON(result)
		},
	}
}

func createDisableCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "disable",
		Short: "Remove bloom-sensor from automatic startup (HKCU\\Run)",
		Long: `Deletes the BloomSensor key from HKCU\Software\Microsoft\Windows\CurrentVersion\Run.

Does NOT kill the running process. The current session continues until
the process exits normally or is stopped externally.
The operation is idempotent — safe to run even if the key does not exist.`,
		Annotations: map[string]string{
			"category": "LIFECYCLE",
			"json_response": `{
  "success": true,
  "removed": true
}`,
		},
		Example: `bloom-sensor disable
bloom-sensor --json disable`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := startup.Disable(); err != nil {
				return err
			}
			c.Logger.Info("autostart disabled")
			result := map[string]interface{}{
				"success": true,
				"removed": true,
			}
			return printJSON(result)
		},
	}
}

// ─── TELEMETRY ───────────────────────────────────────────────────────────────

// ExportEnvelope wraps the snapshots array with aggregated export metadata.
type ExportEnvelope struct {
	Period             string              `json:"period"`
	Samples            int                 `json:"samples"`
	AvgEnergyIndex     float64             `json:"avg_energy_index"`
	TotalActiveMinutes int                 `json:"total_active_minutes"`
	Snapshots          []events.HumanState `json:"snapshots"`
}

func createExportCommand(c *core.Core) *cobra.Command {
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
			period := "all"

			if lastDuration != "" {
				d, err := time.ParseDuration(lastDuration)
				if err != nil {
					return fmt.Errorf("invalid duration %q: %w", lastDuration, err)
				}
				snapshots = c.Buffer.Since(d)
				period = lastDuration
			} else {
				snapshots = c.Buffer.Last(1440)
				period = "24h"
			}

			// Compute aggregates
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

			envelope := ExportEnvelope{
				Period:             period,
				Samples:            len(snapshots),
				AvgEnergyIndex:     avgEnergy,
				TotalActiveMinutes: totalActive,
				Snapshots:          snapshots,
			}
			return printJSON(envelope)
		},
	}
	cmd.Flags().StringVar(&lastDuration, "last", "", "Export snapshots from the last duration (e.g. 1h, 30m, 90m)")
	cmd.Flags().StringVar(&format, "format", "json", "Output format (json)")
	return cmd
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func printJSON(v interface{}) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}