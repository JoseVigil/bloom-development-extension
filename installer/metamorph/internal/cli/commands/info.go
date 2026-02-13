package commands

import (
	"encoding/json"
	"fmt"

	"github.com/bloom/metamorph/internal/core"
	"github.com/spf13/cobra"
)

// infoCmd representa el comando info
var infoCmd = &cobra.Command{
	Use:   "info",
	Short: "Display detailed system information",
	Long: `Display comprehensive system information including version, capabilities,
runtime environment, and configured paths.

Example:
  metamorph info
  metamorph info --json`,
	RunE: func(cmd *cobra.Command, args []string) error {
		paths, err := InitPaths()
		if err != nil {
			return err
		}

		if GetJSONOutput() {
			printInfoJSON(paths)
		} else {
			printInfoText(paths)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(infoCmd)
}

// printInfoJSON imprime la información del sistema en formato JSON
func printInfoJSON(paths *core.PathConfig) {
	data := map[string]interface{}{
		"name":         core.AppName,
		"version":      core.Version,
		"build_number": core.BuildNumber,
		"build_date":   core.BuildDate,
		"channel":      "stable",
		"capabilities": []string{
			"state_inspection",
			"manifest_reconciliation",
			"atomic_updates",
			"service_management",
			"rollback",
		},
		"requires": map[string]string{},
		"runtime": map[string]string{
			"os":   "windows",
			"arch": "amd64",
		},
		"paths": map[string]string{
			"root":    paths.Root,
			"bin":     paths.BinDir,
			"logs":    paths.Logs,
			"config":  paths.Config,
			"staging": paths.Staging,
		},
	}

	bytes, _ := json.MarshalIndent(data, "", "  ")
	fmt.Println(string(bytes))
}

// printInfoText imprime la información del sistema en formato texto
func printInfoText(paths *core.PathConfig) {
	fmt.Println("Metamorph System Information")
	fmt.Println("=============================")
	fmt.Printf("Version: v%s-build.%d\n", core.Version, core.BuildNumber)
	fmt.Printf("Build: %d\n", core.BuildNumber)
	fmt.Printf("Channel: stable\n")
	fmt.Println()
	fmt.Println("Capabilities:")
	fmt.Println("  • State inspection")
	fmt.Println("  • Manifest reconciliation")
	fmt.Println("  • Atomic updates")
	fmt.Println("  • Service management")
	fmt.Println("  • Rollback")
	fmt.Println()
	fmt.Println("Paths:")
	fmt.Printf("  Root:    %s\n", paths.Root)
	fmt.Printf("  Bin:     %s\n", paths.BinDir)
	fmt.Printf("  Logs:    %s\n", paths.Logs)
	fmt.Printf("  Config:  %s\n", paths.Config)
	fmt.Printf("  Staging: %s\n", paths.Staging)
}
