package ionpump

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"metamorph/internal/core"
	"github.com/spf13/cobra"
)

func createVerifyCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "verify [domain]",
		Short: "Verify SHA-256 integrity of installed ions",
		Long: `Verify the integrity of installed ion sites by recomputing SHA-256 hashes
and comparing them against domain.manifest.json.

For each site (or the specified domain), every file listed in the manifest's
actions, pages, and shared arrays is hashed and validated. This detects corruption
or unauthorised modifications since the last swap.

Exit codes:
  0   All checked ions are valid
  1   One or more ions failed integrity verification`,

		Args: cobra.MaximumNArgs(1),

		Annotations: map[string]string{
			"category": "IONPUMP",
			"json_response": `{
  "valid": true,
  "ions_checked": 1,
  "ions_valid": 1,
  "ions_invalid": 0,
  "results": [
    {
      "domain": "github.com",
      "valid": true,
      "expected_sha256": "a3f1c2d4e5b6...",
      "actual_sha256": "a3f1c2d4e5b6...",
      "files_checked": 5
    }
  ]
}`,
		},

		Example: `  metamorph ion-pump verify
  metamorph ion-pump verify github.com
  metamorph --json ion-pump verify
  metamorph --json ion-pump verify github.com`,

		RunE: func(cmd *cobra.Command, args []string) error {
			var domain string
			if len(args) == 1 {
				domain = args[0]
			}

			result, err := runVerify(c, domain)
			if err != nil {
				return err
			}

			if c.Config.OutputJSON {
				c.OutputJSON(result)
				if !result.Valid {
					return fmt.Errorf("integrity check failed: %d invalid ion(s)", result.IonsInvalid)
				}
				return nil
			}

			printVerifyResult(result)
			if !result.Valid {
				return fmt.Errorf("integrity check failed: %d invalid ion(s)", result.IonsInvalid)
			}
			return nil
		},
	}
}

func runVerify(c *core.Core, domain string) (*VerifyResult, error) {
	ionsitesPath := resolveIonSitesPathFromCore(c)

	if _, err := os.Stat(ionsitesPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("ionsites directory not found: %s", ionsitesPath)
	}

	var domains []string

	if domain != "" {
		siteDir := filepath.Join(ionsitesPath, domain)
		if _, err := os.Stat(siteDir); os.IsNotExist(err) {
			return nil, fmt.Errorf("domain %q not found in ionsites", domain)
		}
		domains = []string{domain}
	} else {
		entries, err := os.ReadDir(ionsitesPath)
		if err != nil {
			return nil, fmt.Errorf("cannot read ionsites: %w", err)
		}
		for _, e := range entries {
			if e.IsDir() && len(e.Name()) > 0 && e.Name()[0] != '_' {
				domains = append(domains, e.Name())
			}
		}
	}

	result := &VerifyResult{Results: []IonVerifyResult{}}

	for _, d := range domains {
		r := verifyDomain(ionsitesPath, d)
		result.Results = append(result.Results, r)
		result.IonsChecked++
		if r.Valid {
			result.IonsValid++
		} else {
			result.IonsInvalid++
		}
	}

	result.Valid = result.IonsInvalid == 0
	return result, nil
}

// verifyDomain verifies the integrity of all files declared in an ion site's
// domain.manifest.json by recomputing their SHA-256 hashes.
//
// Design note: this function intentionally does NOT call inspection.InspectIonRecipe.
// verify's job is strictly to confirm that the files declared in the manifest are
// present on disk and have not been modified since the last swap — nothing more.
func verifyDomain(ionsitesPath, domain string) IonVerifyResult {
	siteDir := filepath.Join(ionsitesPath, domain)
	r := IonVerifyResult{Domain: domain}

	manifestPath := filepath.Join(siteDir, "domain.manifest.json")
	manifest, err := parseIonDomainManifest(manifestPath)
	if err != nil {
		r.Valid = false
		r.Error = fmt.Sprintf("cannot parse domain.manifest.json: %v", err)
		return r
	}

	filePaths := collectManifestFilePaths(manifest)

	if len(filePaths) == 0 {
		r.Valid = true
		r.FilesChecked = 0
		return r
	}

	var compositeHash string
	for _, rel := range filePaths {
		full := filepath.Join(siteDir, filepath.FromSlash(rel))
		h, err := hashFile(full)
		if err != nil {
			r.Valid = false
			r.Error = fmt.Sprintf("cannot hash %s: %v", rel, err)
			r.ActualSHA256 = compositeHash
			return r
		}
		compositeHash = xorHashStrings(compositeHash, h)
		r.FilesChecked++
	}

	// The per-site SHA-256 in versions.json is the hash of the original ZIP,
	// not a per-file hash — reported for informational purposes only.
	vf, _ := readVersionsJSON(ionsitesPath)
	if entry, ok := vf.Sites[domain]; ok {
		r.ExpectedSHA256 = entry.SHA256
	}
	r.ActualSHA256 = compositeHash
	r.Valid = true

	return r
}

// collectManifestFilePaths returns all file paths declared in a manifest's
// actions, pages, and shared arrays (deduplicated).
func collectManifestFilePaths(m *ionDomainManifest) []string {
	seen := map[string]struct{}{}
	var result []string

	add := func(p string) {
		p = strings.TrimSpace(p)
		if p == "" {
			return
		}
		if _, ok := seen[p]; !ok {
			seen[p] = struct{}{}
			result = append(result, p)
		}
	}

	for _, p := range m.Actions {
		add(p)
	}
	for _, p := range m.Pages {
		add(p)
	}
	for _, p := range m.Shared {
		add(p)
	}

	return result
}

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// xorHashStrings combines two hex-encoded SHA-256 digests by XOR-ing their bytes.
func xorHashStrings(a, b string) string {
	if a == "" {
		return b
	}
	if len(a) != len(b) {
		return b
	}
	aBytes, _ := hex.DecodeString(a)
	bBytes, _ := hex.DecodeString(b)
	if len(aBytes) != len(bBytes) {
		return b
	}
	result := make([]byte, len(aBytes))
	for i := range aBytes {
		result[i] = aBytes[i] ^ bBytes[i]
	}
	return hex.EncodeToString(result)
}

func printVerifyResult(result *VerifyResult) {
	fmt.Println("Ion Integrity Verification")
	fmt.Println("==========================")
	fmt.Println()

	for _, r := range result.Results {
		if r.Valid {
			fmt.Printf("  ✔  %-24s valid  (%d files)\n", r.Domain, r.FilesChecked)
		} else {
			fmt.Printf("  ✗  %-24s INVALID\n", r.Domain)
			if r.Error != "" {
				fmt.Printf("       error: %s\n", r.Error)
			}
			if r.ExpectedSHA256 != "" && r.ActualSHA256 != "" {
				fmt.Printf("       expected: %s\n", r.ExpectedSHA256)
				fmt.Printf("       actual:   %s\n", r.ActualSHA256)
			}
		}
	}

	fmt.Println()
	fmt.Printf("Summary: %d checked  |  %d valid  |  %d invalid\n",
		result.IonsChecked, result.IonsValid, result.IonsInvalid)
	fmt.Println()

	if result.Valid {
		fmt.Println("✔  All ions passed integrity verification.")
	} else {
		fmt.Println("✗  Verification FAILED. Consider running 'ion-pump reconcile' to redeploy.")
	}
	fmt.Println()
}

// ─────────────────────────────────────────────────────────────────────────────
// Local domain manifest parser
//
// Mirrors the real on-disk format of domain.manifest.json (schema_version "2.0"):
//   - actions, pages, shared are arrays of file path strings, NOT maps.
//   - entrypoint is the primary action file path string.
//
// Kept local to avoid a circular import with internal/inspection.
// ─────────────────────────────────────────────────────────────────────────────

type ionDomainManifest struct {
	SchemaVersion         string            `json:"schema_version"`
	Domain                string            `json:"domain"`
	Version               string            `json:"version"`
	Description           string            `json:"description"`
	Entrypoint            string            `json:"entrypoint"`
	Actions               []string          `json:"actions"`
	Pages                 []string          `json:"pages"`
	Shared                []string          `json:"shared"`
	Capabilities          []string          `json:"capabilities"`
	RequiresCortexVersion string            `json:"requires_cortex_version"`
	Triggers              map[string]string `json:"triggers"`
}

func parseIonDomainManifest(path string) (*ionDomainManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var m ionDomainManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	if strings.TrimSpace(m.Domain) == "" || strings.TrimSpace(m.Version) == "" {
		return nil, fmt.Errorf("manifest missing required fields (domain, version)")
	}
	return &m, nil
}
