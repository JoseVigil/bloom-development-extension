package inspection

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
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

Results are always written to:
  %LOCALAPPDATA%\BloomNucleus\config\metamorph.json

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

// runInspection performs the inspection, writes metamorph.json, and outputs results.
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

	// Always persist to config/metamorph.json
	if err := writeMetamorphConfig(result); err != nil {
		// Non-fatal: log the error but don't stop the command
		fmt.Fprintf(os.Stderr, "warning: could not write metamorph.json: %v\n", err)
	}

	// Output to stdout
	if c.Config.OutputJSON {
		c.OutputJSON(result)
	} else {
		printInspectionTable(result, includeExternal)
	}

	return nil
}

// writeMetamorphConfig persists the inspection result to:
//
//	%LOCALAPPDATA%\BloomNucleus\config\metamorph.json
//
// The file contains the full versioned state of all components and is
// overwritten on every inspect run. It is the authoritative source of
// system state for Nucleus and other consumers.
func writeMetamorphConfig(result InspectionResult) error {
	configPath, err := resolveMetamorphConfigPath()
	if err != nil {
		return fmt.Errorf("could not resolve config path: %w", err)
	}

	// Ensure the config directory exists
	if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
		return fmt.Errorf("could not create config directory: %w", err)
	}

	// Marshal with indentation for human readability
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return fmt.Errorf("could not marshal inspection result: %w", err)
	}

	// Write atomically: write to .tmp then rename
	tmpPath := configPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("could not write temp file: %w", err)
	}
	if err := os.Rename(tmpPath, configPath); err != nil {
		_ = os.Remove(tmpPath) // cleanup on failure
		return fmt.Errorf("could not rename temp file: %w", err)
	}

	return nil
}

// resolveMetamorphConfigPath returns the absolute path to metamorph.json.
// Respects BLOOM_NUCLEUS_HOME if set, otherwise uses the platform default.
func resolveMetamorphConfigPath() (string, error) {
	// Check environment override first
	if home := os.Getenv("BLOOM_NUCLEUS_HOME"); home != "" {
		return filepath.Join(home, "config", "metamorph.json"), nil
	}

	// Platform default: %LOCALAPPDATA%\BloomNucleus\config\metamorph.json
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		// Fallback for non-Windows or missing env var
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("could not determine home directory: %w", err)
		}
		localAppData = filepath.Join(homeDir, "AppData", "Local")
	}

	return filepath.Join(localAppData, "BloomNucleus", "config", "metamorph.json"), nil
}