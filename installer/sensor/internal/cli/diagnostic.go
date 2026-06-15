// internal/cli/diagnostic.go

package cli

import (
	"fmt"
	"time"

	"bloom-sensor/internal/cmdregistry"
	"bloom-sensor/internal/core"
	"bloom-sensor/internal/input"
	"bloom-sensor/internal/metrics"
	"bloom-sensor/pkg/events"
	"github.com/spf13/cobra"
)

// RegisterDiagnosticCommands registra el comando diagnostic en el registry global.
func RegisterDiagnosticCommands(c *core.Core) {
	cmdregistry.Register(func() *cobra.Command { return newDiagnosticCommand(c) })
}

func newDiagnosticCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "diagnostic",
		Short: "Inspect the runtime state of the presence detection engine",
		Long: `Provides diagnostic tools for inspecting the live state of Sensor.

Subcommands:
  tick    Execute a single presence tick and print full metric detail.

Use 'bloom-sensor diagnostic tick' to get an immediate snapshot
with energy_index, focus_score, cognitive_state and sentinel status.`,
		Annotations: map[string]string{
			"category": "RUNTIME",
		},
		// Sin RunE propio: cobra muestra el help del padre si no se pasa subcomando.
	}

	cmd.AddCommand(newDiagnosticTickCommand(c))
	return cmd
}

func newDiagnosticTickCommand(c *core.Core) *cobra.Command {
	var window int

	cmd := &cobra.Command{
		Use:   "tick",
		Short: "Execute a single presence tick and print full metric detail",
		Long: `Collects a single presence snapshot without starting the engine loop.

Prints:
  - Session state (active / locked)
  - Idle time in seconds
  - energy_index [0.0–1.0]
  - focus_score [0.0–1.0] computed over the last N snapshots in the ring buffer
  - cognitive_state inferred from the ring buffer window
  - Sentinel connection status
  - Ring buffer occupancy

Use --window to control how many past snapshots are used for focus and
cognitive inference (default: 5). If the buffer has fewer snapshots than
the window, all available are used.`,
		Annotations: map[string]string{
			"category": "RUNTIME",
			"json_response": `{
  "timestamp": "2026-02-27T15:04:05Z",
  "session_active": true,
  "session_locked": false,
  "idle_seconds": 42,
  "energy_index": 0.94,
  "focus_score": 0.81,
  "cognitive_state": "FLOW",
  "sequence": 87,
  "sentinel_connected": true,
  "buffer_size": 42
}`,
		},
		Example: `bloom-sensor diagnostic tick
bloom-sensor diagnostic tick --window 10
bloom-sensor --json diagnostic tick`,
		RunE: func(cmd *cobra.Command, args []string) error {
			sessionActive := c.SessionManager.IsSessionActive()
			idleSeconds := input.IdleSeconds()
			energy := c.MetricsEngine.ComputeEnergyIndex(idleSeconds, sessionActive)
			seq := c.Sequence.Add(1)

			buf := c.Buffer.Last(window)
			focusScore := c.MetricsEngine.ComputeFocusScore(buf)
			cognitiveState := metrics.DetectPattern(buf)

			state := events.HumanState{
				Timestamp:      time.Now().UTC(),
				SessionActive:  sessionActive,
				SessionLocked:  !sessionActive,
				IdleSeconds:    idleSeconds,
				EnergyIndex:    energy,
				FocusScore:     focusScore,
				CognitiveState: cognitiveState,
				Sequence:       seq,
			}
			c.Buffer.Push(state)

			bufferSize := len(c.Buffer.Last(1440))
			sentinelConnected := c.SentinelClient.IsConnected()

			if c.Config.OutputJSON {
				result := map[string]interface{}{
					"timestamp":          state.Timestamp,
					"session_active":     state.SessionActive,
					"session_locked":     state.SessionLocked,
					"idle_seconds":       state.IdleSeconds,
					"energy_index":       state.EnergyIndex,
					"focus_score":        state.FocusScore,
					"cognitive_state":    string(state.CognitiveState),
					"sequence":           state.Sequence,
					"sentinel_connected": sentinelConnected,
					"buffer_size":        bufferSize,
				}
				return cmdregistry.PrintJSON(result)
			}

			sessionStr := map[bool]string{true: "active", false: "locked"}[sessionActive]
			fmt.Printf("=== Sensor Diagnostic Tick ===\n")
			fmt.Printf("timestamp:          %s\n", state.Timestamp.Format(time.RFC3339))
			fmt.Printf("session:            %s\n", sessionStr)
			fmt.Printf("idle:               %ds\n", state.IdleSeconds)
			fmt.Printf("energy_index:       %.4f\n", state.EnergyIndex)
			fmt.Printf("focus_score:        %.4f  (window=%d samples)\n", state.FocusScore, len(buf))
			fmt.Printf("cognitive_state:    %s\n", string(state.CognitiveState))
			fmt.Printf("sequence:           %d\n", state.Sequence)
			fmt.Printf("sentinel:           %s\n", map[bool]string{true: "connected", false: "disconnected"}[sentinelConnected])
			fmt.Printf("buffer_size:        %d/1440\n", bufferSize)
			return nil
		},
	}

	cmd.Flags().IntVar(&window, "window", 5, "Number of past snapshots to use for focus and cognitive inference")
	return cmd
}
