// internal/cli/replay.go

package cli

import (
	"fmt"
	"time"

	"bloom-sensor/internal/cmdregistry"
	"bloom-sensor/internal/core"
	"bloom-sensor/internal/metrics"
	"bloom-sensor/pkg/events"
	"github.com/spf13/cobra"
)

// RegisterReplayCommands registra el comando replay en el registry global.
func RegisterReplayCommands(c *core.Core) {
	cmdregistry.Register(func() *cobra.Command { return newReplayCommand(c) })
}

// replayEntry representa un snapshot enriquecido con inferencia cognitiva
// re-computada en tiempo de replay sobre una ventana deslizante.
type replayEntry struct {
	Timestamp      time.Time             `json:"timestamp"`
	SessionActive  bool                  `json:"session_active"`
	SessionLocked  bool                  `json:"session_locked"`
	IdleSeconds    uint32                `json:"idle_seconds"`
	EnergyIndex    float64               `json:"energy_index"`
	FocusScore     float64               `json:"focus_score"`
	CognitiveState events.CognitiveState `json:"cognitive_state"`
	Sequence       uint64                `json:"sequence"`
}

// replayEnvelope es el envelope JSON de salida del comando replay.
type replayEnvelope struct {
	Period          string         `json:"period"`
	Samples         int            `json:"samples"`
	AvgEnergyIndex  float64        `json:"avg_energy_index"`
	AvgFocusScore   float64        `json:"avg_focus_score"`
	DominantState   string         `json:"dominant_state"`
	Entries         []replayEntry  `json:"entries"`
}

func newReplayCommand(c *core.Core) *cobra.Command {
	var lastDuration string
	var windowSize int

	cmd := &cobra.Command{
		Use:   "replay",
		Short: "Re-run cognitive inference over historical ring buffer snapshots",
		Long: `Replays the ring buffer and re-computes cognitive state for each snapshot
using a sliding window of N past samples.

This is useful for auditing or debugging how the cognitive state would have
been inferred at each point in time, without modifying the live buffer.

The sliding window uses the N snapshots preceding each entry (inclusive).
If fewer than 3 active samples are available, cognitive_state is UNKNOWN.

Use --last to restrict the replay window (e.g. 1h, 30m).
Use --window to control the sliding window size for inference (default: 5).

Output is always JSON.`,
		Annotations: map[string]string{
			"category": "COGNITION",
			"json_response": `{
  "period": "1h",
  "samples": 60,
  "avg_energy_index": 0.72,
  "avg_focus_score": 0.65,
  "dominant_state": "FOCUSED",
  "entries": [
    {
      "timestamp": "2026-02-27T15:04:05Z",
      "session_active": true,
      "session_locked": false,
      "idle_seconds": 18,
      "energy_index": 0.96,
      "focus_score": 0.84,
      "cognitive_state": "FLOW",
      "sequence": 47
    }
  ]
}`,
		},
		Example: `bloom-sensor replay
bloom-sensor replay --last 1h
bloom-sensor replay --last 30m --window 10
bloom-sensor --json replay --last 2h`,
		RunE: func(cmd *cobra.Command, args []string) error {
			// Obtener snapshots del ring buffer
			var snapshots []events.HumanState
			period := "24h"

			if lastDuration != "" {
				d, err := time.ParseDuration(lastDuration)
				if err != nil {
					return fmt.Errorf("duración inválida %q: %w", lastDuration, err)
				}
				snapshots = c.Buffer.Since(d)
				period = lastDuration
			} else {
				snapshots = c.Buffer.Last(1440)
			}

			if len(snapshots) == 0 {
				return fmt.Errorf("ring buffer vacío — ejecutá 'bloom-sensor run --once' primero")
			}

			// Re-computar inferencia cognitiva con ventana deslizante
			entries := make([]replayEntry, 0, len(snapshots))
			var sumEnergy, sumFocus float64
			stateCounts := make(map[events.CognitiveState]int)

			for i, s := range snapshots {
				// Ventana: los windowSize snapshots anteriores (inclusive el actual)
				start := i - windowSize + 1
				if start < 0 {
					start = 0
				}
				window := snapshots[start : i+1]

				focusScore := c.MetricsEngine.ComputeFocusScore(window)
				cogState := metrics.DetectPattern(window)

				entry := replayEntry{
					Timestamp:      s.Timestamp,
					SessionActive:  s.SessionActive,
					SessionLocked:  s.SessionLocked,
					IdleSeconds:    s.IdleSeconds,
					EnergyIndex:    s.EnergyIndex,
					FocusScore:     focusScore,
					CognitiveState: cogState,
					Sequence:       s.Sequence,
				}
				entries = append(entries, entry)

				sumEnergy += s.EnergyIndex
				sumFocus += focusScore
				stateCounts[cogState]++
			}

			n := float64(len(entries))
			avgEnergy := sumEnergy / n
			avgFocus := sumFocus / n

			// Estado dominante (excluyendo UNKNOWN)
			var dominantState events.CognitiveState
			var dominantCount int
			for state, count := range stateCounts {
				if state != events.CognitiveStateUnknown && count > dominantCount {
					dominantCount = count
					dominantState = state
				}
			}
			if dominantState == "" {
				dominantState = events.CognitiveStateUnknown
			}

			return cmdregistry.PrintJSON(replayEnvelope{
				Period:         period,
				Samples:        len(entries),
				AvgEnergyIndex: avgEnergy,
				AvgFocusScore:  avgFocus,
				DominantState:  string(dominantState),
				Entries:        entries,
			})
		},
	}

	cmd.Flags().StringVar(&lastDuration, "last", "", "Replay snapshots from the last duration (e.g. 1h, 30m, 90m)")
	cmd.Flags().IntVar(&windowSize, "window", 5, "Sliding window size for cognitive inference (min 3 for meaningful results)")
	return cmd
}
