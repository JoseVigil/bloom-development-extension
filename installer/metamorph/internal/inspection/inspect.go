package inspection

import (
	"time"

	"github.com/bloom/metamorph/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("INSPECTION", createInspectCommand)
}

func createInspectCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "inspect",
		Short: "Inspect all binaries and show detailed info",
		Long: `Perform detailed inspection of all managed binaries and their metadata.

By default, inspects only managed binaries (updatable by Metamorph).
Use --all flag to include external binaries (Temporal, Ollama, Chromium, Node).

The inspection includes:
  • Version detection via --info or --version
  • SHA-256 hash calculation
  • File size and modification time
  • Health status verification
  • Capability discovery (managed binaries only)

Example:
  metamorph inspect              # Managed binaries only
  metamorph inspect --all        # Include external binaries
  metamorph --json inspect       # JSON output`,
		Annotations: map[string]string{
			"category": "INSPECTION",
			"json_response": `{
  "managed_binaries": [
    {
      "name": "Brain",
      "version": "3.2.0",
      "status": "healthy"
    }
  ],
  "summary": {
    "total_binaries": 7,
    "healthy_count": 7
  }
}`,
		},
		Example: `  metamorph inspect
  metamorph inspect --all
  metamorph --json inspect
  metamorph --json inspect --all`,
		RunE: func(cmd *cobra.Command, args []string) error {
			includeExternal, _ := cmd.Flags().GetBool("all")
			return runInspection(c, includeExternal)
		},
	}

	cmd.Flags().BoolP("all", "a", false, "Include external binaries (Temporal, Ollama, Chromium, Node)")
	return cmd
}

// runInspection performs the inspection and outputs results
func runInspection(c *core.Core, includeExternal bool) error {
	basePath := GetBasePath()

	// Inspect managed binaries
	managed, err := InspectAllManagedBinaries(basePath)
	if err != nil {
		return err
	}

	// Inspect external binaries if requested
	var external []ExternalBinary
	if includeExternal {
		external, err = InspectAllExternalBinaries(basePath)
		if err != nil {
			return err
		}
	}

	// Build result
	result := InspectionResult{
		ManagedBinaries:  managed,
		ExternalBinaries: external,
		Summary:          calculateSummary(managed, external),
		Timestamp:        time.Now().UTC().Format(time.RFC3339),
	}

	// Output
	if c.Config.OutputJSON {
		c.OutputJSON(result)
	} else {
		printInspectionTable(result, includeExternal)
	}

	return nil
}