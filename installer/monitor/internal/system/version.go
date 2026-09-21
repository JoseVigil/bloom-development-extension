// Package system provides SYSTEM-category commands (version, info) shared
// by every managed binary's CLI. Mirrors metamorph/internal/system so that
// metamorph inspect can query Monitor the same way it queries Nucleus,
// Sentinel and Metamorph.
package system

import (
	"encoding/json"
	"fmt"

	"monitor/internal/core"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("SYSTEM", createVersionCommand)
}

func createVersionCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Display version and build information",
		Long: `Display detailed version information including build number, date, and time.

Example:
  monitor version
  monitor --json version`,
		Args: cobra.NoArgs,
		Annotations: map[string]string{
			"category": "SYSTEM",
			"json_response": `{
  "name": "Monitor",
  "version": "1.0.0",
  "build_number": 2,
  "build_date": "2026-02-13",
  "build_time": "11:29:00",
  "full_version": "v1.0.0-build.2"
}`,
		},
		Example: `  monitor version
  monitor --json version`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := c.Logger.Success("version reported"); err != nil {
				return err
			}
			buildNumber := core.BuildNumber()
			if c.JSON {
				data := map[string]interface{}{
					"name":         core.AppName,
					"version":      core.Version,
					"build_number": buildNumber,
					"build_date":   core.BuildDate,
					"build_time":   core.BuildTime,
					"full_version": fmt.Sprintf("v%s-build.%d", core.Version, buildNumber),
				}
				return json.NewEncoder(c.Out).Encode(data)
			}
			fmt.Fprintf(c.Out, "%s v%s-build.%d\n", core.AppName, core.Version, buildNumber)
			fmt.Fprintf(c.Out, "Build: %d\n", buildNumber)
			fmt.Fprintf(c.Out, "Date: %s\n", core.BuildDate)
			fmt.Fprintf(c.Out, "Time: %s\n", core.BuildTime)
			return nil
		},
	}
}
