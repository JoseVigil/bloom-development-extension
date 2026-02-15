package inspection

import (
	"fmt"
	"time"

	"github.com/bloom/metamorph/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("INSPECTION", createStatusCommand)
}

func createStatusCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Display current system state",
		Long: `Display the current operational status of the Metamorph system,
including health checks and active reconciliation state.

This command provides a quick overview of system health by inspecting
all managed binaries and reporting their status.

Example:
  metamorph status
  metamorph --json status`,
		Annotations: map[string]string{
			"category": "INSPECTION",
			"json_response": `{
  "timestamp": "2026-02-15T10:00:00Z",
  "system_healthy": true,
  "status": "operational",
  "summary": {
    "total_binaries": 7,
    "healthy_count": 7,
    "missing_count": 0
  }
}`,
		},
		Example: `  metamorph status
  metamorph --json status`,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runStatus(c)
		},
	}
}

// runStatus checks system health and displays status
func runStatus(c *core.Core) error {
	basePath := GetBasePath()

	// Inspect managed binaries only (fast check)
	managed, err := InspectAllManagedBinaries(basePath)
	if err != nil {
		return err
	}

	// Calculate summary
	summary := calculateSummary(managed, []ExternalBinary{})

	// Determine overall system health
	systemHealthy := summary.MissingCount == 0 && summary.CorruptedCount == 0
	status := "operational"
	if summary.MissingCount > 0 {
		status = "degraded"
	}
	if summary.HealthyCount == 0 {
		status = "critical"
	}

	if c.Config.OutputJSON {
		data := map[string]interface{}{
			"timestamp":      time.Now().UTC().Format(time.RFC3339),
			"system_healthy": systemHealthy,
			"status":         status,
			"summary": map[string]interface{}{
				"total_binaries":  summary.TotalBinaries,
				"healthy_count":   summary.HealthyCount,
				"missing_count":   summary.MissingCount,
				"corrupted_count": summary.CorruptedCount,
			},
		}
		c.OutputJSON(data)
	} else {
		printStatusText(systemHealthy, status, summary)
	}

	return nil
}

// printStatusText prints status in human-readable format
func printStatusText(systemHealthy bool, status string, summary InspectionSummary) {
	fmt.Println("System Status")
	fmt.Println("=============")
	fmt.Println()

	// Overall status
	statusSymbol := "✓"
	if !systemHealthy {
		statusSymbol = "✗"
	}
	fmt.Printf("%s Status: %s\n", statusSymbol, status)
	fmt.Println()

	// Component summary
	fmt.Println("Components:")
	fmt.Printf("  • Total: %d binaries\n", summary.TotalBinaries)
	fmt.Printf("  • Healthy: %d\n", summary.HealthyCount)
	
	if summary.MissingCount > 0 {
		fmt.Printf("  • Missing: %d ⚠️\n", summary.MissingCount)
	}
	if summary.CorruptedCount > 0 {
		fmt.Printf("  • Corrupted: %d ⚠️\n", summary.CorruptedCount)
	}

	fmt.Println()
	fmt.Printf("Last checked: %s\n", time.Now().Format("2006-01-02 15:04:05"))
	
	if !systemHealthy {
		fmt.Println()
		fmt.Println("Run 'metamorph inspect' for detailed information.")
	}
}