package system

import (
	"fmt"

	"github.com/spf13/cobra"
	"metamorph/internal/core"
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
  metamorph version
  metamorph version --json`,
		Annotations: map[string]string{
			"category": "SYSTEM",
			"json_response": `{
  "name": "Metamorph",
  "version": "1.0.0",
  "build_number": 2,
  "build_date": "2026-02-13",
  "build_time": "11:29:00",
  "full_version": "v1.0.0-build.2"
}`,
		},
		Example: `  metamorph version
  metamorph --json version`,
		Run: func(cmd *cobra.Command, args []string) {
			if c.Config.OutputJSON {
				printVersionJSON(c)
			} else {
				printVersionText()
			}
		},
	}
}

func printVersionJSON(c *core.Core) {
	buildNumber := core.BuildNumber()
	data := map[string]interface{}{
		"name":         core.AppName,
		"version":      core.Version,
		"build_number": buildNumber,
		"build_date":   core.BuildDate,
		"build_time":   core.BuildTime,
		"full_version": fmt.Sprintf("v%s-build.%d", core.Version, buildNumber),
	}
	c.OutputJSON(data)
}

func printVersionText() {
	buildNumber := core.BuildNumber()
	fmt.Printf("%s v%s-build.%d\n", core.AppName, core.Version, buildNumber)
	fmt.Printf("Build: %d\n", buildNumber)
	fmt.Printf("Date: %s\n", core.BuildDate)
	fmt.Printf("Time: %s\n", core.BuildTime)
}
