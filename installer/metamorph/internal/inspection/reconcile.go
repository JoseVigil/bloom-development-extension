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
	core.RegisterCommand("GOVERNANCE", createReconcileIonRecipesCommand)
}

func createReconcileIonRecipesCommand(c *core.Core) *cobra.Command {
	var (
		manifestPath string
		dryRun       bool
		forceSwap    bool
	)

	cmd := &cobra.Command{
		Use:   "reconcile-ion-recipes",
		Short: "Reconcile ion recipe packages from manifest",
		Long: `Reconcile ion recipe packages from a manifest produced by Nucleus.

Reads a JSON manifest describing which sites need updating, then for each site:
  1. Checks if the installed version already matches (skip if so)
  2. Extracts the downloaded .ion package to staging
  3. Verifies SHA-256 of every declared file
  4. Signals Brain to quiesce the site
  5. Swaps staging into live via two atomic renames
  6. Signals Brain to reload the site
  7. Rolls back from backup if Brain reports a reload error

The manifest can be piped via stdin or provided with --manifest.

Use --dry-run to inspect and verify without making any filesystem changes.
Use --force-swap to skip Brain quiesce signaling (emergency use only — unsafe).`,

		Args: cobra.NoArgs,

		Annotations: map[string]string{
			"category": "GOVERNANCE",
			"json_response": `{
  "reconcile_results": [
    {
      "site": "github.com",
      "previous_version": "1.0.0",
      "new_version": "1.1.0",
      "action": "swapped",
      "phase": "",
      "duration_ms": 342,
      "swapped_at": "2026-05-02T12:00:00Z"
    }
  ],
  "summary": {
    "total_sites": 1,
    "skipped": 0,
    "swapped": 1,
    "rolled_back": 0,
    "failed": 0
  },
  "timestamp": "2026-05-02T12:00:00Z"
}`,
		},

		Example: `  metamorph reconcile-ion-recipes --manifest manifest.json
  metamorph reconcile-ion-recipes --dry-run
  metamorph reconcile-ion-recipes --manifest manifest.json --force-swap
  metamorph --json reconcile-ion-recipes --manifest manifest.json
  echo '{"ion_recipes":[...]}' | metamorph reconcile-ion-recipes`,

		Run: func(cmd *cobra.Command, args []string) {
			result, err := runReconcileIonRecipes(c, manifestPath, dryRun, forceSwap)
			if err != nil {
				c.Logger.Error("❌ Reconciliation failed: %v", err)
				return
			}

			if c.Config.OutputJSON {
				c.OutputJSON(result)
				return
			}

			printReconcileResult(c, result, dryRun)
		},
	}

	cmd.Flags().StringVarP(&manifestPath, "manifest", "m", "", "Path to reconciliation manifest JSON file (reads stdin if omitted)")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Inspect and verify without swapping")
	cmd.Flags().BoolVar(&forceSwap, "force-swap", false, "Swap without waiting for Brain quiesce (unsafe)")

	return cmd
}

// ─────────────────────────────────────────────────────────────────────────────
// Core logic
// ─────────────────────────────────────────────────────────────────────────────

type reconcileManifest struct {
	IonRecipes []IonRecipeUpdate `json:"ion_recipes"`
}

func runReconcileIonRecipes(
	c *core.Core,
	manifestPath string,
	dryRun bool,
	forceSwap bool,
) (*ReconcileAllResult, error) {
	var data []byte
	var err error

	if manifestPath != "" {
		data, err = os.ReadFile(manifestPath)
		if err != nil {
			return nil, fmt.Errorf("cannot read manifest file %q: %w", manifestPath, err)
		}
	} else {
		data, err = readStdin()
		if err != nil {
			return nil, fmt.Errorf("cannot read manifest from stdin: %w", err)
		}
	}

	var manifest reconcileManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("invalid manifest JSON: %w", err)
	}

	if len(manifest.IonRecipes) == 0 {
		return &ReconcileAllResult{
			Results:   []ReconcileResult{},
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	ionsitesPath := resolveIonSitesPath(c.Config)

	if _, err := os.Stat(ionsitesPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("ionsites directory not found: %s (Nucleus must create it)", ionsitesPath)
	}

	var client IonPumpClient
	if forceSwap {
		c.Logger.Info("⚠️  --force-swap: Brain quiesce/reload signals skipped")
		client = &NoopIonPumpClient{}
	} else {
		port := resolveIonPumpPort()
		client = NewHttpIonPumpClient(port)
	}

	if dryRun {
		c.Logger.Info("🔍 Dry run — no filesystem changes will be made")
	}

	result := ReconcileAllIonRecipes(ionsitesPath, manifest.IonRecipes, client, dryRun, forceSwap)
	return &result, nil
}

// resolveIonPumpPort reads the Brain/IonPump port from the shared Nucleus config.
// Falls back to 7700 (default IonPump port) if the config is unavailable.
func resolveIonPumpPort() int {
	const defaultPort = 7700

	configPath := filepath.Join(core.GetConfigPath(), "nucleus.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return defaultPort
	}

	var cfg struct {
		IonPumpPort int `json:"ionpump_port"`
	}
	if err := json.Unmarshal(data, &cfg); err != nil || cfg.IonPumpPort == 0 {
		return defaultPort
	}

	return cfg.IonPumpPort
}

// readStdin reads all available bytes from stdin.
func readStdin() ([]byte, error) {
	return os.ReadFile("/dev/stdin")
}

// ─────────────────────────────────────────────────────────────────────────────
// Human-readable output
// ─────────────────────────────────────────────────────────────────────────────

func printReconcileResult(c *core.Core, result *ReconcileAllResult, dryRun bool) {
	header := "Ion Recipe Reconciliation"
	if dryRun {
		header += " (dry run)"
	}

	c.Logger.Info("")
	c.Logger.Info(header)
	c.Logger.Info("────────────────────────────────────────────────────────────")

	if len(result.Results) == 0 {
		c.Logger.Info("No sites to reconcile.")
		return
	}

	for _, r := range result.Results {
		icon := actionIcon(r.Action)
		versionInfo := fmt.Sprintf("%s → %s", r.PreviousVersion, r.NewVersion)
		if r.PreviousVersion == "" {
			versionInfo = r.NewVersion + " (new)"
		}

		line := fmt.Sprintf("%-20s  %-30s  %s  (%dms)",
			r.Site, versionInfo, icon, r.DurationMs)

		if r.Error != "" {
			line += fmt.Sprintf("  [%s: %s]", r.Phase, r.Error)
		}

		c.Logger.Info(line)
	}

	c.Logger.Info("────────────────────────────────────────────────────────────")
	c.Logger.Info("Total: %d sites   Swapped: %d   Skipped: %d   Rolled back: %d   Failed: %d",
		result.Summary.TotalSites,
		result.Summary.Swapped,
		result.Summary.Skipped,
		result.Summary.RolledBack,
		result.Summary.Failed,
	)
}

func actionIcon(action string) string {
	switch action {
	case "swapped":
		return "✅ swapped"
	case "skipped":
		return "⏭  skipped"
	case "rolled_back":
		return "↩️  rolled back"
	default:
		return "❌ failed"
	}
}
