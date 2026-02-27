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
		Use:      "version",
		Short:    "Display version and build information",
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
    "human_presence_detection",
    "session_monitoring",
    "idle_detection",
    "energy_metrics",
    "sentinel_publish"
  ],
  "requires": ["session_1", "windows"]
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
					"human_presence_detection",
					"session_monitoring",
					"idle_detection",
					"energy_metrics",
					"sentinel_publish",
				},
				"requires": []string{
					"session_1",
					"windows",
				},
			}
			printJSON(result) //nolint:errcheck
		},
	}
}

// ─── RUNTIME ────────────────────────────────────────────────────────────────

func createRunCommand(c *core.Core) *cobra.Command {
	var once bool

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

Use --once for a single diagnostic tick.`,
		Annotations: map[string]string{
			"category":      "RUNTIME",
			"json_response": "false",
		},
		Example: `bloom-sensor run
bloom-sensor run --once
bloom-sensor --json run --once`,
		RunE: func(cmd *cobra.Command, args []string) error {
			engine := runtime.NewEngine(c)
			if once {
				state := engine.RunOnce()
				if c.Config.OutputJSON {
					return printJSON(state)
				}
				fmt.Printf("tick: energy=%.2f idle=%ds session_active=%v seq=%d\n",
					state.EnergyIndex, state.IdleSeconds, state.SessionActive, state.Sequence)
				return nil
			}
			engine.Run()
			return nil
		},
	}
	cmd.Flags().BoolVar(&once, "once", false, "Execute a single tick and exit (diagnostic mode)")
	return cmd
}

func createStatusCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Report current sensor process, autostart and Sentinel connection status",
		Annotations: map[string]string{
			"category": "RUNTIME",
			"json_response": `{
  "sentinel_connected": true,
  "autostart_enabled": true,
  "autostart_value": "\"C:\\Bloom\\bloom-sensor.exe\" run",
  "channel": "stable",
  "version": "1.0.0"
}`,
		},
		Example: `bloom-sensor status
bloom-sensor --json status`,
		RunE: func(cmd *cobra.Command, args []string) error {
			enabled, regValue := startup.IsEnabled()
			status := map[string]interface{}{
				"sentinel_connected": c.SentinelClient.IsConnected(),
				"autostart_enabled":  enabled,
				"autostart_value":    regValue,
				"channel":            c.Config.Channel,
				"version":            buildinfo.Version,
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
  "enabled": true,
  "path": "C:\\Bloom"
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
			result := map[string]interface{}{"enabled": true, "path": dir}
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
  "enabled": false
}`,
		},
		Example: `bloom-sensor disable
bloom-sensor --json disable`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := startup.Disable(); err != nil {
				return err
			}
			c.Logger.Info("autostart disabled")
			result := map[string]interface{}{"enabled": false}
			return printJSON(result)
		},
	}
}

// ─── TELEMETRY ───────────────────────────────────────────────────────────────

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
			"json_response": `[
  {
    "timestamp": "2026-02-27T15:04:05Z",
    "session_active": true,
    "session_locked": false,
    "idle_seconds": 12,
    "energy_index": 0.99,
    "sequence": 47
  }
]`,
		},
		Example: `bloom-sensor export
bloom-sensor export --last 1h
bloom-sensor export --last 30m
bloom-sensor --json export --last 2h`,
		RunE: func(cmd *cobra.Command, args []string) error {
			var snapshots []events.HumanState

			if lastDuration != "" {
				d, err := time.ParseDuration(lastDuration)
				if err != nil {
					return fmt.Errorf("invalid duration %q: %w", lastDuration, err)
				}
				snapshots = c.Buffer.Since(d)
			} else {
				snapshots = c.Buffer.Last(100)
			}

			return printJSON(snapshots)
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
