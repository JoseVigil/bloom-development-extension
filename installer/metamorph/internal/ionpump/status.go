package ionpump

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"metamorph/internal/core"
	"metamorph/internal/inspection"
	"github.com/spf13/cobra"
)

func createStatusCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "status [domain]",
		Short: "Show installed ion site status",
		Long: `Display the current status of all installed ion sites in ionsites/.

For each site, reports the installed version, SHA-256 hash, deploy timestamp,
deploy source, whether a backup copy is available for rollback, and whether
domain.manifest.json parses correctly.

Optionally filter to a single domain by passing it as an argument.`,

		Args: cobra.MaximumNArgs(1),

		Annotations: map[string]string{
			"category": "IONPUMP",
			"json_response": `{
  "ionsites_path": "C:\\Users\\user\\AppData\\Local\\BloomNucleus\\bin\\cortex\\ionsites",
  "ions": [
    {
      "domain": "github.com",
      "version": "1.0.0",
      "sha256": "a3f1c2d4e5b6...",
      "deployed_at": "2026-05-15T10:30:00Z",
      "source": "bootstrap",
      "has_backup": false,
      "manifest_valid": true
    }
  ]
}`,
		},

		Example: `  metamorph ion-pump status
  metamorph ion-pump status github.com
  metamorph --json ion-pump status
  metamorph --json ion-pump status github.com`,

		RunE: func(cmd *cobra.Command, args []string) error {
			var domain string
			if len(args) == 1 {
				domain = args[0]
			}

			result, err := runStatus(c, domain)
			if err != nil {
				return err
			}

			if c.Config.OutputJSON {
				c.OutputJSON(result)
				return nil
			}

			printIonStatus(result)
			return nil
		},
	}
}

func runStatus(c *core.Core, domain string) (*StatusResult, error) {
	ionsitesPath := resolveIonSitesPathFromCore(c)

	if _, err := os.Stat(ionsitesPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("ionsites directory not found: %s", ionsitesPath)
	}

	// Load versions.json for installed metadata.
	vf, err := readVersionsJSON(ionsitesPath)
	if err != nil {
		return nil, fmt.Errorf("could not read versions.json: %w", err)
	}

	result := &StatusResult{
		IonSitesPath: ionsitesPath,
		Ions:         []IonSiteStatus{},
	}

	if domain != "" {
		// Single-domain query.
		s, err := buildSiteStatus(ionsitesPath, domain, vf)
		if err != nil {
			return nil, err
		}
		result.Ions = append(result.Ions, s)
		return result, nil
	}

	// All domains.
	entries, err := os.ReadDir(ionsitesPath)
	if err != nil {
		return nil, fmt.Errorf("cannot read ionsites directory: %w", err)
	}

	for _, e := range entries {
		if !e.IsDir() || len(e.Name()) > 0 && e.Name()[0] == '_' {
			continue
		}
		s, err := buildSiteStatus(ionsitesPath, e.Name(), vf)
		if err != nil {
			continue // non-fatal — best-effort listing
		}
		result.Ions = append(result.Ions, s)
	}

	return result, nil
}

// buildSiteStatus constructs a single IonSiteStatus from disk + versions.json.
func buildSiteStatus(ionsitesPath, domain string, vf *versionsFile) (IonSiteStatus, error) {
	siteDir := filepath.Join(ionsitesPath, domain)
	if _, err := os.Stat(siteDir); os.IsNotExist(err) {
		return IonSiteStatus{}, fmt.Errorf("domain %q not found in ionsites", domain)
	}

	backupDir := filepath.Join(ionsitesPath, "_backup", domain)
	_, backupErr := os.Stat(backupDir)
	hasBackup := backupErr == nil

	// Check manifest validity via the shared inspection helper.
	_, manifestErr := inspection.InspectIonRecipe(siteDir)
	manifestValid := manifestErr == nil

	// Pull metadata from versions.json if available.
	var version, sha256, deployedAt, source string
	if entry, ok := vf.Sites[domain]; ok {
		version = entry.Version
		sha256 = entry.SHA256
		deployedAt = entry.InstalledAt
		source = entry.Source
	}

	return IonSiteStatus{
		Domain:        domain,
		Version:       version,
		SHA256:        sha256,
		DeployedAt:    deployedAt,
		Source:        source,
		HasBackup:     hasBackup,
		ManifestValid: manifestValid,
	}, nil
}

func printIonStatus(result *StatusResult) {
	fmt.Println("Ion Site Status")
	fmt.Println("===============")
	fmt.Printf("Path: %s\n\n", result.IonSitesPath)

	if len(result.Ions) == 0 {
		fmt.Println("No ion sites installed.")
		return
	}

	for _, ion := range result.Ions {
		backupIcon := " "
		if ion.HasBackup {
			backupIcon = "↩"
		}
		manifestIcon := "✓"
		if !ion.ManifestValid {
			manifestIcon = "✗"
		}

		deployedAt := ion.DeployedAt
		if deployedAt == "" {
			deployedAt = "unknown"
		}

		fmt.Printf("  %s %s  v%s  [%s]  manifest:%s  deployed:%s\n",
			backupIcon,
			padRight(ion.Domain, 24),
			padRight(ion.Version, 8),
			padRight(ion.Source, 10),
			manifestIcon,
			formatTime(deployedAt),
		)
	}

	fmt.Printf("\n%d site(s) listed at %s\n", len(result.Ions), time.Now().Format("2006-01-02 15:04:05"))
}

func padRight(s string, n int) string {
	for len(s) < n {
		s += " "
	}
	return s
}

func formatTime(iso string) string {
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		return iso
	}
	return t.Local().Format("2006-01-02 15:04")
}

// ─────────────────────────────────────────────────────────────────────────────
// versions.json reader — local copy so this subcommand avoids a circular import
// with internal/inspection. The authoritative implementation lives in
// inspection/ionrecipes.go; any schema changes must be mirrored here.
// ─────────────────────────────────────────────────────────────────────────────

type versionsEntry struct {
	Version     string `json:"version"`
	InstalledAt string `json:"installed_at"`
	SHA256      string `json:"sha256"`
	SwapCount   int    `json:"swap_count"`
	Status      string `json:"status"`
	Source      string `json:"source"`
}

type versionsFile struct {
	SchemaVersion string                   `json:"schema_version"`
	Sites         map[string]versionsEntry `json:"sites"`
	LastUpdated   string                   `json:"last_updated"`
}

func readVersionsJSON(ionsitesPath string) (*versionsFile, error) {
	path := filepath.Join(ionsitesPath, "_meta", "versions.json")

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &versionsFile{Sites: map[string]versionsEntry{}}, nil
		}
		return nil, err
	}

	var vf versionsFile
	if err := json.Unmarshal(data, &vf); err != nil {
		return nil, err
	}
	if vf.Sites == nil {
		vf.Sites = map[string]versionsEntry{}
	}

	return &vf, nil
}
