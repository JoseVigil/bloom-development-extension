package inspection

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/bloom/metamorph/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("INSPECTION", createVerifySyncCommand)
}

func createVerifySyncCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "verify-sync",
		Short: "Verify deployed binaries match the last build",
		Long: `Compare each binary currently on disk against the state recorded in
metamorph.json, which is written automatically at the end of every build
by 'metamorph inspect'.

For each managed component, verify-sync computes the SHA-256 hash of the
binary on disk and compares it against the hash stored in metamorph.json.
This confirms that every binary matches exactly what was deployed during
the last build — no binary was missed, corrupted, or left at a previous version.

Source of truth:
  %LOCALAPPDATA%\BloomNucleus\config\metamorph.json

Exit codes:
  0   All components are in sync with the last build
  1   One or more components are out of sync or missing

Example:
  metamorph verify-sync
  metamorph --json verify-sync`,
		Annotations: map[string]string{
			"category": "INSPECTION",
			"json_response": `{
  "timestamp": "2026-02-27T12:00:00Z",
  "in_sync": true,
  "reference": "C:\\Users\\josev\\AppData\\Local\\BloomNucleus\\config\\metamorph.json",
  "summary": {
    "total": 9,
    "synced": 9,
    "drifted": 0,
    "missing": 0
  },
  "components": [
    {
      "name": "Brain",
      "status": "synced",
      "expected_hash": "b716e2...",
      "actual_hash":   "b716e2...",
      "path": "C:\\Users\\josev\\AppData\\Local\\BloomNucleus\\bin\\brain\\brain.exe"
    }
  ]
}`,
		},
		Example: `  metamorph verify-sync
  metamorph --json verify-sync`,
		RunE: func(cmd *cobra.Command, args []string) error {
			nativeMode, _ := cmd.Flags().GetBool("native")
			return runVerifySync(c, nativeMode)
		},
	}
	cmd.Flags().Bool("native", false, "Verify native/bin/<platform>/ build output instead of AppData (reads native_metamorph.json)")
	return cmd
}

// syncStatus represents the result of comparing a single component.
type syncStatus string

const (
	statusSynced  syncStatus = "synced"
	statusDrifted syncStatus = "drifted"
	statusMissing syncStatus = "missing"
)

// componentSyncResult holds the comparison result for one binary.
type componentSyncResult struct {
	Name         string     `json:"name"`
	Status       syncStatus `json:"status"`
	ExpectedHash string     `json:"expected_hash,omitempty"`
	ActualHash   string     `json:"actual_hash,omitempty"`
	Path         string     `json:"path"`
}

// syncSummary holds aggregate counts.
type syncSummary struct {
	Total   int `json:"total"`
	Synced  int `json:"synced"`
	Drifted int `json:"drifted"`
	Missing int `json:"missing"`
}

// verifySyncResult is the complete output of the command.
type verifySyncResult struct {
	Timestamp  string                `json:"timestamp"`
	InSync     bool                  `json:"in_sync"`
	Reference  string                `json:"reference"`
	Summary    syncSummary           `json:"summary"`
	Components []componentSyncResult `json:"components"`
}

// metamorphConfig mirrors the structure of metamorph.json written by inspect.
type metamorphConfig struct {
	ManagedBinaries []struct {
		Name string `json:"name"`
		Path string `json:"path"`
		Hash string `json:"hash"`
	} `json:"managed_binaries"`
}

// runVerifySync is the main entry point for the verify-sync command.
func runVerifySync(c *core.Core, nativeMode bool) error {
	var configPath string
	var err error
	if nativeMode {
		configPath, err = resolveNativeMetamorphConfigPath()
	} else {
		configPath, err = resolveMetamorphConfigPath()
	}
	if err != nil {
		return fmt.Errorf("could not resolve metamorph config path: %w", err)
	}

	// Load metamorph.json as source of truth
	config, err := loadMetamorphConfig(configPath)
	if err != nil {
		return fmt.Errorf("could not load metamorph.json from %s: %w\n\nRun 'metamorph inspect' first to generate the reference file", configPath, err)
	}

	var components []componentSyncResult

	for _, entry := range config.ManagedBinaries {
		comp := compareAgainstReference(entry.Name, entry.Path, entry.Hash)
		components = append(components, comp)
	}

	// Build summary
	summary := syncSummary{Total: len(components)}
	for _, comp := range components {
		switch comp.Status {
		case statusSynced:
			summary.Synced++
		case statusDrifted:
			summary.Drifted++
		case statusMissing:
			summary.Missing++
		}
	}

	inSync := summary.Synced == summary.Total

	result := verifySyncResult{
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
		InSync:     inSync,
		Reference:  configPath,
		Summary:    summary,
		Components: components,
	}

	if c.Config.OutputJSON {
		c.OutputJSON(result)
	} else {
		printVerifySyncText(result)
	}

	if !inSync {
		return fmt.Errorf("sync check failed: %d drifted, %d missing",
			summary.Drifted, summary.Missing)
	}
	return nil
}

// compareAgainstReference hashes the binary at path and compares against expectedHash.
func compareAgainstReference(name, path, expectedHash string) componentSyncResult {
	result := componentSyncResult{
		Name:         name,
		Path:         path,
		ExpectedHash: expectedHash,
	}

	actualHash, err := hashFileSHA256(path)
	if err != nil {
		result.Status = statusMissing
		return result
	}

	result.ActualHash = actualHash
	if actualHash == expectedHash {
		result.Status = statusSynced
	} else {
		result.Status = statusDrifted
	}
	return result
}

// hashFileSHA256 computes the SHA-256 hash of a file and returns the hex string.
func hashFileSHA256(path string) (string, error) {
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

// loadMetamorphConfig reads and parses metamorph.json.
func loadMetamorphConfig(path string) (*metamorphConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var config metamorphConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}
	if len(config.ManagedBinaries) == 0 {
		return nil, fmt.Errorf("no managed binaries found in reference file")
	}
	return &config, nil
}

// printVerifySyncText renders the result in human-readable format.
func printVerifySyncText(result verifySyncResult) {
	fmt.Println("Sync Verification")
	fmt.Println("=================")
	fmt.Println()
	fmt.Printf("Reference: %s\n", result.Reference)
	fmt.Println()

	for _, comp := range result.Components {
		switch comp.Status {
		case statusSynced:
			fmt.Printf("  ✔  %-14s synced\n", comp.Name)
		case statusDrifted:
			fmt.Printf("  ✗  %-14s DRIFTED\n", comp.Name)
			fmt.Printf("       expected: %s\n", comp.ExpectedHash)
			fmt.Printf("       actual:   %s\n", comp.ActualHash)
		case statusMissing:
			fmt.Printf("  ⚠  %-14s MISSING — %s\n", comp.Name, comp.Path)
		}
	}

	fmt.Println()
	fmt.Printf("Summary: %d total  |  %d synced  |  %d drifted  |  %d missing\n",
		result.Summary.Total,
		result.Summary.Synced,
		result.Summary.Drifted,
		result.Summary.Missing,
	)
	fmt.Println()

	if result.InSync {
		fmt.Println("✔  All components are in sync with the last build.")
	} else {
		fmt.Println("✗  Sync check FAILED. Run 'metamorph rollout' to redeploy.")
	}

	fmt.Println()
	fmt.Printf("Checked: %s\n", result.Timestamp)
}