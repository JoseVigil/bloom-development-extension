package commands

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/spf13/cobra"
)

// statusCmd representa el comando status
var statusCmd = &cobra.Command{
	Use:   "status",
	Short: "Display current system state",
	Long: `Display the current operational status of the Metamorph system,
including health checks and active reconciliation state.

Example:
  metamorph status
  metamorph status --json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		paths, err := InitPaths()
		if err != nil {
			return err
		}

		if GetJSONOutput() {
			printStatusJSON(paths)
		} else {
			printStatusText(paths)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(statusCmd)
}

// printStatusJSON imprime el estado en formato JSON
func printStatusJSON(paths interface{}) {
	data := map[string]interface{}{
		"timestamp":      time.Now().UTC().Format(time.RFC3339),
		"system_healthy": true,
		"message":        "Status inspection not yet implemented",
		"status":         "placeholder",
	}
	bytes, _ := json.MarshalIndent(data, "", "  ")
	fmt.Println(string(bytes))
}

// printStatusText imprime el estado en formato texto
func printStatusText(paths interface{}) {
	fmt.Println("System Status")
	fmt.Println("=============")
	fmt.Println("⚠️  Status inspection not yet implemented")
	fmt.Println()
	fmt.Println("This feature will display:")
	fmt.Println("  • System health status")
	fmt.Println("  • Active reconciliation state")
	fmt.Println("  • Last update timestamp")
	fmt.Println("  • Binary checksums")
}
