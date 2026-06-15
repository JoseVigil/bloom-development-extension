// internal/cli/hcu.go

package cli

import (
	"fmt"
	"time"

	"bloom-sensor/internal/cmdregistry"
	"bloom-sensor/internal/core"
	"github.com/spf13/cobra"
)

// RegisterHCUCommands registra el comando hcu en el registry global.
func RegisterHCUCommands(c *core.Core) {
	cmdregistry.Register(func() *cobra.Command { return newHCUCommand(c) })
}

func newHCUCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "hcu",
		Short: "Compute and inspect Human Cognitive Units for mandates",
		Long: `HCU (Human Cognitive Unit) measures the cognitive load invested
in a mandate over a time window.

It combines energy_index and focus_score into a normalized value [0.0–1.0]
that represents how much real cognitive work was done, not just elapsed time.

Formula: hcu_value = (avg_focus_score × 0.6) + (avg_energy_index × 0.4)

Subcommands:
  compute <mandate-id>   Compute HCU for a specific mandate
  summary                Print a summary of the current ring buffer window`,
		Annotations: map[string]string{
			"category": "COGNITION",
		},
	}

	cmd.AddCommand(newHCUComputeCommand(c))
	cmd.AddCommand(newHCUSummaryCommand(c))
	return cmd
}

func newHCUComputeCommand(c *core.Core) *cobra.Command {
	var nucleusPath string

	cmd := &cobra.Command{
		Use:   "compute <mandate-id>",
		Short: "Compute the Human Cognitive Unit for a given mandate",
		Long: `Computes the HCU value for a mandate using all snapshots currently
in the ring buffer (up to 1440 — the last 24h at 1 tick/min).

The mandate ID is used as metadata for correlation with Nucleus.
If --nucleus-path is provided, it is recorded in the output for traceability
and future cross-system correlation (Sensor does not read the Nucleus file).

Output fields:
  mandate_id        The mandate identifier
  computed_at       UTC timestamp of computation
  window_start      Timestamp of the earliest snapshot used
  window_end        Timestamp of the latest snapshot used
  samples           Number of snapshots used
  avg_energy_index  Average energy_index across the window
  avg_focus_score   Average focus_score across the window
  hcu_value         Normalized cognitive load [0.0–1.0]
  dominant_state    Most frequent cognitive state in the window
  flow_minutes      Minutes spent in FLOW state
  focused_minutes   Minutes spent in FOCUSED state
  fatigued_minutes  Minutes spent in FATIGUED state
  nucleus_path      Path recorded for correlation (omitted if not provided)`,
		Annotations: map[string]string{
			"category": "COGNITION",
			"json_response": `{
  "mandate_id": "M-2024-001",
  "computed_at": "2026-02-27T16:00:00Z",
  "window_start": "2026-02-27T08:00:00Z",
  "window_end": "2026-02-27T15:59:00Z",
  "samples": 480,
  "avg_energy_index": 0.74,
  "avg_focus_score": 0.68,
  "hcu_value": 0.71,
  "dominant_state": "FOCUSED",
  "flow_minutes": 42,
  "focused_minutes": 210,
  "fatigued_minutes": 18,
  "nucleus_path": "~/.bloom/.nucleus-acme"
}`,
		},
		Example: `bloom-sensor hcu compute M-2024-001
bloom-sensor hcu compute M-2024-001 --nucleus-path ~/.bloom/.nucleus-acme
bloom-sensor --json hcu compute M-2024-001`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			mandateID := args[0]
			if mandateID == "" {
				return fmt.Errorf("mandate-id no puede estar vacío")
			}

			hcu, err := c.ComputeMandateHCU(mandateID, nucleusPath)
			if err != nil {
				return fmt.Errorf("no se pudo computar HCU: %w", err)
			}

			if c.Config.OutputJSON {
				return cmdregistry.PrintJSON(hcu)
			}

			// Output human-readable
			fmt.Printf("=== Human Cognitive Unit ===\n")
			fmt.Printf("mandate_id:       %s\n", hcu.MandateID)
			fmt.Printf("computed_at:      %s\n", hcu.ComputedAt.Format(time.RFC3339))
			fmt.Printf("window:           %s → %s\n",
				hcu.WindowStart.Format(time.RFC3339),
				hcu.WindowEnd.Format(time.RFC3339))
			fmt.Printf("samples:          %d\n", hcu.Samples)
			fmt.Printf("avg_energy_index: %.4f\n", hcu.AvgEnergyIndex)
			fmt.Printf("avg_focus_score:  %.4f\n", hcu.AvgFocusScore)
			fmt.Printf("hcu_value:        %.4f\n", hcu.HCUValue)
			fmt.Printf("dominant_state:   %s\n", string(hcu.DominantState))
			fmt.Printf("flow_minutes:     %d\n", hcu.FlowMinutes)
			fmt.Printf("focused_minutes:  %d\n", hcu.FocusedMinutes)
			fmt.Printf("fatigued_minutes: %d\n", hcu.FatiguedMinutes)
			if hcu.NucleusPath != "" {
				fmt.Printf("nucleus_path:     %s\n", hcu.NucleusPath)
			}
			return nil
		},
	}

	cmd.Flags().StringVar(&nucleusPath, "nucleus-path", "", "Path to the Nucleus instance for correlation metadata (e.g. ~/.bloom/.nucleus-acme)")
	return cmd
}

func newHCUSummaryCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "summary",
		Short: "Print a cognitive summary of the current ring buffer window",
		Long: `Prints an overview of the cognitive state distribution in the current
ring buffer without computing HCU for a specific mandate.

Useful for a quick health check of the current session's cognitive quality
before committing HCU values to a mandate.

Shows:
  - Total snapshots in buffer
  - Average energy_index and focus_score
  - Time distribution per cognitive state (FLOW / FOCUSED / FATIGUED / IDLE / ABSENT)
  - Dominant state for the full window`,
		Annotations: map[string]string{
			"category": "COGNITION",
			"json_response": `{
  "buffer_samples": 240,
  "avg_energy_index": 0.71,
  "avg_focus_score": 0.63,
  "dominant_state": "FOCUSED",
  "state_distribution": {
    "FLOW": 18,
    "FOCUSED": 142,
    "FATIGUED": 31,
    "IDLE": 44,
    "ABSENT": 3,
    "UNKNOWN": 2
  }
}`,
		},
		Example: `bloom-sensor hcu summary
bloom-sensor --json hcu summary`,
		RunE: func(cmd *cobra.Command, args []string) error {
			snapshots := c.Buffer.Last(1440)
			if len(snapshots) == 0 {
				return fmt.Errorf("ring buffer vacío — ejecutá 'bloom-sensor run --once' primero")
			}

			var sumEnergy, sumFocus float64
			stateDist := make(map[string]int)

			for _, s := range snapshots {
				sumEnergy += s.EnergyIndex
				sumFocus += s.FocusScore
				stateDist[string(s.CognitiveState)]++
			}

			n := float64(len(snapshots))
			avgEnergy := sumEnergy / n
			avgFocus := sumFocus / n

			// Estado dominante (excluyendo UNKNOWN)
			dominantState := "UNKNOWN"
			dominantCount := 0
			for state, count := range stateDist {
				if state != "UNKNOWN" && count > dominantCount {
					dominantCount = count
					dominantState = state
				}
			}

			if c.Config.OutputJSON {
				result := map[string]interface{}{
					"buffer_samples":     len(snapshots),
					"avg_energy_index":   avgEnergy,
					"avg_focus_score":    avgFocus,
					"dominant_state":     dominantState,
					"state_distribution": stateDist,
				}
				return cmdregistry.PrintJSON(result)
			}

			fmt.Printf("=== Cognitive Session Summary ===\n")
			fmt.Printf("buffer_samples:   %d/1440\n", len(snapshots))
			fmt.Printf("avg_energy_index: %.4f\n", avgEnergy)
			fmt.Printf("avg_focus_score:  %.4f\n", avgFocus)
			fmt.Printf("dominant_state:   %s\n", dominantState)
			fmt.Printf("\nState distribution:\n")
			states := []string{"FLOW", "FOCUSED", "FATIGUED", "IDLE", "ABSENT", "UNKNOWN"}
			for _, s := range states {
				count := stateDist[s]
				if count > 0 {
					pct := float64(count) / n * 100
					fmt.Printf("  %-12s %4d  (%.1f%%)\n", s, count, pct)
				}
			}
			return nil
		},
	}
}
