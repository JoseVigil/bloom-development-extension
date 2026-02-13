package commands

import (
	"encoding/json"
	"fmt"

	"github.com/bloom/metamorph/internal/core"
	"github.com/spf13/cobra"
)

// versionCmd representa el comando version
var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Display version and build information",
	Long: `Display detailed version information including build number, date, and time.

Example:
  metamorph version
  metamorph version --json`,
	Run: func(cmd *cobra.Command, args []string) {
		if GetJSONOutput() {
			printVersionJSON()
		} else {
			printVersionText()
		}
	},
}

func init() {
	rootCmd.AddCommand(versionCmd)
}

// printVersionJSON imprime la versión en formato JSON
func printVersionJSON() {
	data := map[string]interface{}{
		"name":         core.AppName,
		"version":      core.Version,
		"build_number": core.BuildNumber,
		"build_date":   core.BuildDate,
		"build_time":   core.BuildTime,
		"full_version": fmt.Sprintf("v%s-build.%d", core.Version, core.BuildNumber),
	}
	bytes, _ := json.MarshalIndent(data, "", "  ")
	fmt.Println(string(bytes))
}

// printVersionText imprime la versión en formato texto
func printVersionText() {
	fmt.Printf("%s v%s-build.%d\n", core.AppName, core.Version, core.BuildNumber)
	fmt.Printf("Build: %d\n", core.BuildNumber)
	fmt.Printf("Date: %s\n", core.BuildDate)
	fmt.Printf("Time: %s\n", core.BuildTime)
}
