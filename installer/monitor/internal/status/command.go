// Package status is the minimum placeholder domain command for the Monitor
// skeleton: it proves the CLI, logging and telemetry wiring end to end.
// Real observation, correlation and evaluation-selection logic is out of
// scope here and will be added incrementally.
package status

import (
	"encoding/json"
	"fmt"
	"github.com/spf13/cobra"
	"monitor/internal/core"
)

func init() { core.RegisterCommand("SYSTEM", createStatusCommand) }
func createStatusCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{Use: "status", Short: "Report that Monitor is running", Long: "Report minimal process status. Monitor is not yet wired to any runtime source; this only confirms the CLI, logging and telemetry registration path.", Args: cobra.NoArgs, Example: "  monitor status\n  monitor status --json", Annotations: map[string]string{"category": "SYSTEM", "json_response": `{"status":"ok"}`}, RunE: func(cmd *cobra.Command, args []string) error {
		if err := c.Logger.Success("status checked"); err != nil {
			return err
		}
		if c.JSON {
			return json.NewEncoder(c.Out).Encode(map[string]string{"status": "ok"})
		}
		_, err := fmt.Fprintln(c.Out, "Monitor: ok")
		return err
	}}
	return cmd
}
