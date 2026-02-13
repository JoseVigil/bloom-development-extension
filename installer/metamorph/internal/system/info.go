package system

import (
	"fmt"

	"github.com/bloom/metamorph/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("SYSTEM", createInfoCommand)
}

func createInfoCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "info",
		Short: "Display detailed system information",
		Long: `Display comprehensive system information including version, capabilities,
runtime environment, and configured paths.

Example:
  metamorph info
  metamorph info --json`,
		Annotations: map[string]string{
			"category": "SYSTEM",
			"json_response": `{
  "name": "Metamorph",
  "version": "1.0.0",
  "build_number": 2,
  "capabilities": ["state_inspection", "manifest_reconciliation"],
  "paths": {...}
}`,
		},
		Example: `  metamorph info
  metamorph --json info`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if c.Config.OutputJSON {
				return printInfoJSON(c)
			}
			return printInfoText(c)
		},
	}
}

func printInfoJSON(c *core.Core) error {
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
			"root":    c.Paths.Root,
			"bin":     c.Paths.BinDir,
			"logs":    c.Paths.Logs,
			"config":  c.Paths.Config,
			"staging": c.Paths.Staging,
		},
	}
	c.OutputJSON(data)
	return nil
}

func printInfoText(c *core.Core) error {
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
	fmt.Printf("  Root:    %s\n", c.Paths.Root)
	fmt.Printf("  Bin:     %s\n", c.Paths.BinDir)
	fmt.Printf("  Logs:    %s\n", c.Paths.Logs)
	fmt.Printf("  Config:  %s\n", c.Paths.Config)
	fmt.Printf("  Staging: %s\n", c.Paths.Staging)
	return nil
}
