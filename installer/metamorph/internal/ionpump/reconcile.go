package ionpump

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"metamorph/internal/core"
	"metamorph/internal/inspection"
	"github.com/spf13/cobra"
)

func createReconcileCommand(c *core.Core) *cobra.Command {
	var (
		manifest  string
		forceSwap bool
		dryRun    bool
	)

	cmd := &cobra.Command{
		Use:   "reconcile",
		Short: "Reconcile installed ions against a manifest",
		Long: `Reads the given manifest, compares installed ion versions and SHA-256 hashes,
and performs atomic swaps for outdated or missing ions.

For each ion in the manifest:
  1. Checks if the installed version + hash already match (skip if so)
  2. Extracts the bundled .ion ZIP to staging
  3. Verifies SHA-256 of every declared file in staging
  4. Signals Brain to quiesce the domain (skipped with --force-swap)
  5. Swaps staging into live via two atomic renames
  6. Signals Brain to reload the domain
  7. Rolls back from backup if Brain reports a reload error

With --force-swap, bypasses the Brain quiesce/reload signals. Required for
bootstrap execution from Conductor Setup before Nucleus is initialised.`,

		Args: cobra.NoArgs,

		Annotations: map[string]string{
			"category": "IONPUMP",
			"json_response": `{
  "success": true,
  "manifest": "installer/native/ionpump/bootstrap-ions.json",
  "ions_processed": 1,
  "ions_swapped": 1,
  "ions_skipped": 0,
  "ions_failed": 0,
  "force_swap": true,
  "results": [
    {
      "domain": "github.com",
      "status": "swapped",
      "version_before": null,
      "version_after": "1.0.0",
      "backup_path": null
    }
  ]
}`,
		},

		Example: `  metamorph ion-pump reconcile --manifest installer/native/ionpump/bootstrap-ions.json --force-swap
  metamorph ion-pump reconcile --manifest /path/to/batcave-manifest.json
  metamorph ion-pump reconcile --manifest bootstrap-ions.json --force-swap --dry-run
  metamorph --json ion-pump reconcile --manifest bootstrap-ions.json --force-swap`,

		RunE: func(cmd *cobra.Command, args []string) error {
			if manifest == "" {
				return fmt.Errorf("--manifest is required")
			}

			result, err := runReconcile(c, manifest, forceSwap, dryRun)
			if err != nil {
				c.Logger.Error("❌ Reconcile failed: %v", err)
				return err
			}

			if c.Config.OutputJSON {
				c.OutputJSON(result)
				return nil
			}

			icon := "✅"
			if !result.Success {
				icon = "⚠️ "
			}
			c.Logger.Info("%s Reconcile complete — %d swapped, %d skipped, %d failed",
				icon, result.IonsSwapped, result.IonsSkipped, result.IonsFailed)
			return nil
		},
	}

	cmd.Flags().StringVarP(&manifest, "manifest", "m", "", "Path to ion reconciliation manifest (required)")
	cmd.Flags().BoolVar(&forceSwap, "force-swap", false, "Bypass Brain signal — for bootstrap/testing without Nucleus")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Simulate reconciliation without writing to ionsites/")

	return cmd
}

// ─────────────────────────────────────────────────────────────────────────────
// Core logic
// ─────────────────────────────────────────────────────────────────────────────

func runReconcile(c *core.Core, manifestPath string, forceSwap bool, dryRun bool) (*ReconcileResult, error) {
	m, err := loadManifest(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("loading manifest: %w", err)
	}

	ionsitesPath := resolveIonSitesPathFromCore(c)
	if _, err := os.Stat(ionsitesPath); os.IsNotExist(err) {
		c.Logger.Info("📁 ionsites directory not found, creating: %s", ionsitesPath)
		if err := os.MkdirAll(ionsitesPath, 0755); err != nil {
			return nil, fmt.Errorf("failed to create ionsites directory %s: %w", ionsitesPath, err)
		}
	}

	var client inspection.IonPumpClient
	if forceSwap {
		c.Logger.Info("⚠️  --force-swap: Brain quiesce/reload signals skipped")
		client = &inspection.NoopIonPumpClient{}
	} else {
		port := resolveIonPumpPort()
		client = inspection.NewHttpIonPumpClient(port)
	}

	if dryRun {
		c.Logger.Info("🔍 Dry run — no filesystem changes will be made")
	}

	result := &ReconcileResult{
		Manifest:  manifestPath,
		ForceSwap: forceSwap,
	}

	for _, entry := range m.Ions {
		// In bootstrap mode, ZipPath points to a local file. Stage it at the
		// path ReconcileIonRecipe expects (_staging/downloads/<domain>.ion).
		if entry.ZipPath != "" && entry.DownloadURL == "" {
			if err := stageLocalZIP(ionsitesPath, entry); err != nil {
				result.IonsProcessed++
				result.IonsFailed++
				after := entry.Version
				result.Results = append(result.Results, IonSwapResult{
					Domain:       entry.Domain,
					Status:       "failed",
					VersionAfter: after,
				})
				c.Logger.Error("  ✗ %s: failed to stage local ZIP: %v", entry.Domain, err)
				continue
			}
		}

		// Bridge IonEntry → inspection.IonRecipeUpdate.
		update := inspection.IonRecipeUpdate{
			Site:        entry.Domain,
			Version:     entry.Version,
			SHA256:      entry.SHA256,
			DownloadURL: entry.DownloadURL,
		}

		r := inspection.ReconcileIonRecipe(ionsitesPath, update, client, dryRun, forceSwap)
		result.IonsProcessed++

		swap := buildSwapResult(r)
		result.Results = append(result.Results, swap)

		switch r.Action {
		case "skipped":
			result.IonsSkipped++
			c.Logger.Info("  → %s: already up-to-date (%s)", entry.Domain, entry.Version)
		case "swapped":
			result.IonsSwapped++
			c.Logger.Info("  ✓ %s: swapped → %s", entry.Domain, entry.Version)
		default:
			result.IonsFailed++
			c.Logger.Error("  ✗ %s: %s [%s: %s]", entry.Domain, r.Action, r.Phase, r.Error)
		}
	}

	result.Success = result.IonsFailed == 0
	return result, nil
}

// stageLocalZIP copies a bundled ZIP to the download staging path that
// inspection.ReconcileIonRecipe expects: _staging/downloads/<domain>.ion
func stageLocalZIP(ionsitesPath string, entry IonEntry) error {
	downloadsDir := filepath.Join(ionsitesPath, "_staging", "downloads")
	if err := os.MkdirAll(downloadsDir, 0755); err != nil {
		return fmt.Errorf("could not create staging downloads dir: %w", err)
	}

	dest := filepath.Join(downloadsDir, entry.Domain+".ion")

	src := entry.ZipPath
	if !filepath.IsAbs(src) {
		if cwd, err := os.Getwd(); err == nil {
			src = filepath.Join(cwd, src)
		}
	}

	return copyFileTo(src, dest)
}

func copyFileTo(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}

// buildSwapResult maps an inspection.ReconcileResult to our IonSwapResult.
func buildSwapResult(r inspection.ReconcileResult) IonSwapResult {
	swap := IonSwapResult{
		Domain:       r.Site,
		VersionAfter: r.NewVersion,
	}
	if r.PreviousVersion != "" {
		prev := r.PreviousVersion
		swap.VersionBefore = &prev
	}
	switch r.Action {
	case "swapped":
		swap.Status = "swapped"
	case "skipped":
		swap.Status = "skipped"
	default:
		swap.Status = "failed"
	}
	return swap
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest loading
// ─────────────────────────────────────────────────────────────────────────────

func loadManifest(path string) (*IonManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("cannot read manifest %q: %w", path, err)
	}

	var m IonManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("invalid manifest JSON: %w", err)
	}

	if len(m.Ions) == 0 {
		return nil, fmt.Errorf("manifest contains no ions")
	}

	return &m, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Path + port resolution — shared across all subcommands in this package
// ─────────────────────────────────────────────────────────────────────────────

// resolveIonSitesPathFromCore returns the ionsites directory path using the
// canonical BloomNucleus AppData location.
func resolveIonSitesPathFromCore(_ *core.Core) string {
	return filepath.Join(core.GetBaseAppDataPath(), "bin", "cortex", "ionsites")
}

// resolveIonPumpPort reads the Brain/IonPump port from nucleus.json, falling
// back to 7700 (IonPump default) if the config is absent or unparseable.
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
