package inspection

import (
	"archive/zip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"metamorph/internal/core"
)

func init() {
	core.RegisterCommand("INSPECTION", createInspectCommand)
}

func createInspectCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "inspect",
		Short: "Inspect all binaries (AppData or native build output)",
		Long: `Perform detailed inspection of all managed binaries and their metadata.

By default, inspects only managed binaries (updatable by Metamorph).
Use --all flag to include external binaries (Temporal, Ollama, Chromium, Node).
Use --native flag to inspect build output in native/bin/<platform>/ instead of AppData.

The inspection includes:
  • Version detection via --info or --version
  • SHA-256 hash calculation
  • File size and modification time
  • Health status verification

Results are always written to <BloomNucleus config dir>/metamorph.json
(or .../native/native_metamorph.json with --native), where the BloomNucleus
config dir is platform-specific:
  Windows : %LOCALAPPDATA%\BloomNucleus\config
  macOS   : ~/Library/BloomNucleus/config
  Linux   : ~/.local/share/BloomNucleus/config
Override with the BLOOM_NUCLEUS_HOME environment variable.

Example:
  metamorph inspect                    # Managed binaries only (AppData)
  metamorph inspect --all              # Include external binaries (AppData)
  metamorph inspect --native           # Inspect native/bin/<platform>/ build output
  metamorph inspect --native --all     # Native + external binaries
  metamorph --json inspect             # JSON output
  metamorph --json inspect --native    # JSON output from native`,
		Annotations: map[string]string{
			"category": "INSPECTION",
			"json_response": `{
  "managed_binaries": [
    {
      "name": "Brain",
      "version": "3.2.0",
      "hash": "a3f1c2...",
      "size_bytes": 18432000,
      "last_modified": "2026-03-15T14:00:00Z",
      "status": "healthy",
      "updatable_by_metamorph": true
    }
  ],
  "summary": {
    "total_binaries": 11,
    "managed_count": 11,
    "healthy_count": 11,
    "missing_count": 0
  },
  "timestamp": "2026-03-15T14:16:43Z"
}

  Written to (default):  <BloomNucleus config dir>/metamorph.json
  Written to (--native): <BloomNucleus config dir>/native/native_metamorph.json
  (BloomNucleus config dir is platform-specific — see core.GetConfigPath)`,
		},
		Example: `  metamorph inspect
  metamorph inspect --all
  metamorph inspect --native
  metamorph inspect --native --all
  metamorph --json inspect
  metamorph --json inspect --native
  metamorph --json inspect --all`,
		RunE: func(cmd *cobra.Command, args []string) error {
			includeExternal, _ := cmd.Flags().GetBool("all")
			nativeMode, _ := cmd.Flags().GetBool("native")
			includeIonRecipes, _ := cmd.Flags().GetBool("ion-recipes")
			showPending, _ := cmd.Flags().GetBool("show-pending")
			showBackups, _ := cmd.Flags().GetBool("show-backups")
			return runInspection(c, includeExternal, nativeMode, includeIonRecipes, showPending, showBackups)
		},
	}

	cmd.Flags().BoolP("all", "a", false, "Include external binaries (Temporal, Ollama, Chromium, Node)")
	cmd.Flags().Bool("native", false, "Inspect native/bin/<platform>/ build output instead of AppData")
	cmd.Flags().Bool("ion-recipes", false, "Inspect ion automation recipes")
	cmd.Flags().Bool("show-pending", false, "Show sites with pending status (use with --ion-recipes)")
	cmd.Flags().Bool("show-backups", false, "Show available backup versions (use with --ion-recipes)")
	return cmd
}

// runInspection performs the inspection, writes the result JSON, and outputs results.
func runInspection(c *core.Core, includeExternal bool, nativeMode bool, includeIonRecipes bool, showPending bool, showBackups bool) error {
	var basePath string
	var bootstrapBase string

	if nativeMode {
		// Resolve native/bin/<platform>/ relative to the executable location
		nativePlatformPath, err := resolveNativeBasePath()
		if err != nil {
			return fmt.Errorf("could not resolve native base path: %w", err)
		}
		basePath = nativePlatformPath

		// Bootstrap and VSCode have no platform subfolder — they live in native/bin/
		nativeBinPath, err := resolveNativeBinPath()
		if err != nil {
			return fmt.Errorf("could not resolve native bin path: %w", err)
		}
		bootstrapBase = nativeBinPath
	} else {
		basePath = GetBasePath()
		bootstrapBase = basePath
	}

	// Inspect managed binaries
	managed, err := InspectAllManagedBinaries(basePath)
	if err != nil {
		return err
	}

	// Bootstrap and VSCode live under bin/ within bootstrapBase.
	// In AppData mode bootstrapBase == BloomNucleus/, so we append "bin/" here
	// so that inspectBootstrap resolves bin/bootstrap/bootstrap.meta.json and
	// inspectVSCodeExtension resolves bin/vscode/bloom-extension.vsix correctly.
	bootstrapBinBase := filepath.Join(bootstrapBase, "bin")

	// Inspect Bootstrap — uses bootstrapBinBase (cross-platform, no platform subfolder)
	bootstrap, err := inspectBootstrap(bootstrapBinBase)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not inspect bootstrap: %v\n", err)
	} else {
		managed = append(managed, bootstrap)
	}

	// Inspect VSCode extension — uses bootstrapBinBase (cross-platform, no platform subfolder)
	vsix, err := inspectVSCodeExtension(bootstrapBinBase)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not inspect vscode extension: %v\n", err)
	} else {
		managed = append(managed, vsix)
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
	// The top-level TotalSizeBytes field mirrors Summary.TotalSizeBytes for
	// consumers that read it directly (e.g. Nucleus). Without this it stays
	// at its Go zero-value (0), which is misleading — see summary field below
	// for the authoritative, correctly-computed total.
	result.TotalSizeBytes = result.Summary.TotalSizeBytes

	// Persist to the appropriate config file
	if nativeMode {
		if err := writeNativeMetamorphConfig(result); err != nil {
			fmt.Fprintf(os.Stderr, "warning: could not write native_metamorph.json: %v\n", err)
		}
	} else {
		if err := writeMetamorphConfig(result); err != nil {
			fmt.Fprintf(os.Stderr, "warning: could not write metamorph.json: %v\n", err)
		}
	}

	// Output to stdout
	if c.Config.OutputJSON {
		c.OutputJSON(result)
	} else {
		printInspectionTable(result, includeExternal)
	}

	// Ion recipes — independent of managed/external inspection
	if includeIonRecipes {
		ionsitesPath := resolveIonSitesPath(c.Config)
		ionResult, err := InspectAllIonRecipes(ionsitesPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "warning: ion recipes inspection: %v\n", err)
		} else {
			if c.Config.OutputJSON {
				c.OutputJSON(map[string]interface{}{
					"ion_recipes": ionResult,
				})
			} else {
				printIonRecipesTable(ionResult, showPending, showBackups)
			}
		}
	}

	return nil
}

// ─── Native path resolution ───────────────────────────────────────────────────

// resolveNativeBasePath returns native/bin/<platform>/ resolved relative to
// the running executable. The exe lives at:
//
//	native/bin/win64/metamorph/metamorph.exe
//
// resolveNativeBinPath() climbs to native/bin/, then we append the detected
// platform (win64/win32) to get the correct base path for platform binaries.
func resolveNativeBasePath() (string, error) {
	platform, err := detectPlatform()
	if err != nil {
		return "", err
	}

	binPath, err := resolveNativeBinPath()
	if err != nil {
		return "", err
	}

	return filepath.Join(binPath, platform), nil
}

// resolveNativeBinPath returns native/bin/ resolved relative to the running
// executable. Used for cross-platform components (Bootstrap, VSCode) that
// have no platform subfolder.
func resolveNativeBinPath() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("could not determine executable path: %w", err)
	}

	// native/bin/win64/metamorph/metamorph.exe
	//                            └── Dir()  → .../metamorph/
	//                       └── ..          → .../win64/
	//                  └── ../..            → .../bin/   ← bootstrapBase ✅
	binPath := filepath.Clean(filepath.Join(filepath.Dir(exePath), "..", ".."))
	return binPath, nil
}

// detectPlatform returns "win64" or "win32" based on the running process architecture.
func detectPlatform() (string, error) {
	switch runtime.GOARCH {
	case "amd64":
		return "win64", nil
	case "386":
		return "win32", nil
	default:
		return "", fmt.Errorf("unsupported architecture: %s", runtime.GOARCH)
	}
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

// bootstrapVersionMetadata is the immutable metadata emitted by the build.
type bootstrapVersionMetadata struct {
	Version     string `json:"version"`
	BuildNumber int    `json:"build_number"`
	BuildDate   string `json:"build_date"`
	Info        string `json:"info"`
}

// BootstrapMeta holds the extra fields reported by bootstrap.meta.json.
type BootstrapMeta struct {
	BuildDate string `json:"build_date"`
	Info      string `json:"info"`
}

// inspectBootstrap reads build metadata without executing the versioning script.
// Inspection must never increment a build number or depend on a system Python.
//
// bootstrapBinBase is BloomNucleus/bin/ (the bin/ subdirectory of bloom_base).
// basePath (bloom_base) is needed to locate the deployed Python runtime.
func inspectBootstrap(bootstrapBinBase string) (ManagedBinary, error) {
	scriptDir := filepath.Join(bootstrapBinBase, "bootstrap")
	metaPath := filepath.Join(scriptDir, "bootstrap.meta.json")
	bundlePath := filepath.Join(scriptDir, "bundle.js")

	stat, err := os.Stat(bundlePath)
	if err != nil {
		return ManagedBinary{
			Name:    "Bootstrap",
			Path:    bundlePath,
			Version: "unknown",
			Status:  "corrupted",
		}, fmt.Errorf("bootstrap bundle not found: %w", err)
	}

	metaBytes, err := os.ReadFile(metaPath)
	if err != nil {
		return ManagedBinary{
			Name:    "Bootstrap",
			Path:    bundlePath,
			Version: "unknown",
			Status:  "corrupted",
		}, fmt.Errorf("bootstrap metadata not found: %w", err)
	}

	var out bootstrapVersionMetadata
	if err := json.Unmarshal(metaBytes, &out); err != nil {
		return ManagedBinary{
			Name:    "Bootstrap",
			Path:    bundlePath,
			Version: "unknown",
			Status:  "corrupted",
		}, fmt.Errorf("could not parse bootstrap metadata: %w", err)
	}

	if out.Version == "" || out.BuildNumber < 0 {
		return ManagedBinary{
			Name:    "Bootstrap",
			Path:    bundlePath,
			Version: "unknown",
			Status:  "corrupted",
		}, fmt.Errorf("bootstrap metadata is incomplete")
	}

	hash, _ := sha256File(bundlePath)

	return ManagedBinary{
		Name:         "Bootstrap",
		Path:         bundlePath,
		Version:      out.Version,
		BuildNumber:  out.BuildNumber,
		Hash:         hash,
		SizeBytes:    stat.Size(),
		LastModified: stat.ModTime().UTC().Format(time.RFC3339),
		Status:       "healthy",
		BootstrapMeta: &BootstrapMeta{
			BuildDate: out.BuildDate,
			Info:      out.Info,
		},
	}, nil
}

// ─── VSCode Extension (.vsix) ─────────────────────────────────────────────────

// vsixPackageJSON is the subset of extension/package.json extracted from the
// .vsix archive. The "description" field is used as the component's Info text;
// no custom fields need to be added to package.json.
type vsixPackageJSON struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
	Version     string `json:"version"`
	Description string `json:"description"`
	Publisher   string `json:"publisher"`
}

// VSIXMeta holds the metadata extracted from the .vsix extension package.
type VSIXMeta struct {
	Publisher   string `json:"publisher,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
	// Info is populated from the "description" field in package.json.
	Info string `json:"info,omitempty"`
}

// inspectVSCodeExtension reads bin/vscode/bloom-extension.vsix (a ZIP archive)
// and extracts version and metadata from extension/package.json inside it.
func inspectVSCodeExtension(basePath string) (ManagedBinary, error) {
	vsixPath := filepath.Join(basePath, "vscode", "bloom-extension.vsix")

	stat, err := os.Stat(vsixPath)
	if err != nil {
		return ManagedBinary{
			Name:    "VSCodeExtension",
			Path:    vsixPath,
			Version: "unknown",
			Status:  "corrupted",
		}, fmt.Errorf("file not found: %w", err)
	}

	pkg, err := readVsixPackageJSON(vsixPath)
	if err != nil {
		return ManagedBinary{
			Name:    "VSCodeExtension",
			Path:    vsixPath,
			Version: "unknown",
			Status:  "corrupted",
		}, fmt.Errorf("could not read package.json from vsix: %w", err)
	}

	hash, _ := sha256File(vsixPath)

	return ManagedBinary{
		Name:         "VSCodeExtension",
		Path:         vsixPath,
		Version:      pkg.Version,
		Hash:         hash,
		SizeBytes:    stat.Size(),
		LastModified: stat.ModTime().UTC().Format(time.RFC3339),
		Status:       "healthy",
		VSIXMeta: &VSIXMeta{
			Publisher:   pkg.Publisher,
			DisplayName: pkg.DisplayName,
			Info:        pkg.Description,
		},
	}, nil
}

// readVsixPackageJSON opens the .vsix (a ZIP file) and parses
// extension/package.json to extract version and metadata.
func readVsixPackageJSON(vsixPath string) (*vsixPackageJSON, error) {
	r, err := zip.OpenReader(vsixPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open vsix: %w", err)
	}
	defer r.Close()

	for _, f := range r.File {
		if f.Name != "extension/package.json" {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return nil, fmt.Errorf("failed to open package.json inside vsix: %w", err)
		}
		defer rc.Close()

		var pkg vsixPackageJSON
		if err := json.NewDecoder(rc).Decode(&pkg); err != nil {
			return nil, fmt.Errorf("failed to parse package.json: %w", err)
		}
		return &pkg, nil
	}

	return nil, fmt.Errorf("extension/package.json not found inside vsix")
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

// sha256File returns the hex-encoded SHA-256 digest of a file.
func sha256File(path string) (string, error) {
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

// ─── Config persistence ───────────────────────────────────────────────────────

// writeMetamorphConfig persists the inspection result to:
//
//	<BloomNucleus config dir>/metamorph.json
//
// (see core.GetConfigPath for the platform-specific resolution of that dir)
//
// The file contains the full versioned state of all components and is
// overwritten on every inspect run. It is the authoritative source of
// system state for Nucleus and other consumers.
func writeMetamorphConfig(result InspectionResult) error {
	configPath, err := resolveMetamorphConfigPath()
	if err != nil {
		return fmt.Errorf("could not resolve config path: %w", err)
	}
	return writeJSONAtomic(configPath, result)
}

// writeNativeMetamorphConfig persists the inspection result to:
//
//	<BloomNucleus config dir>/native/native_metamorph.json
//
// (see core.GetConfigPath for the platform-specific resolution of that dir)
//
// Written only when running with --native. Reflects the state of build
// output in native/bin/<platform>/ rather than the deployed AppData binaries.
func writeNativeMetamorphConfig(result InspectionResult) error {
	configPath, err := resolveNativeMetamorphConfigPath()
	if err != nil {
		return fmt.Errorf("could not resolve native config path: %w", err)
	}
	return writeJSONAtomic(configPath, result)
}

// writeJSONAtomic marshals result to JSON and writes it atomically to path
// using a .tmp intermediate file and os.Rename.
func writeJSONAtomic(configPath string, result InspectionResult) error {
	if err := os.MkdirAll(filepath.Dir(configPath), 0755); err != nil {
		return fmt.Errorf("could not create config directory: %w", err)
	}

	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return fmt.Errorf("could not marshal inspection result: %w", err)
	}

	tmpPath := configPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("could not write temp file: %w", err)
	}
	if err := os.Rename(tmpPath, configPath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("could not rename temp file: %w", err)
	}

	return nil
}

// resolveMetamorphConfigPath returns the absolute path to metamorph.json.
// Respects BLOOM_NUCLEUS_HOME if set, otherwise delegates to
// core.GetConfigPath(), which already resolves the correct platform default
// (Windows: %LOCALAPPDATA%\BloomNucleus\config, macOS: ~/Library/BloomNucleus/config,
// Linux: ~/.local/share/BloomNucleus/config).
func resolveMetamorphConfigPath() (string, error) {
	if home := os.Getenv("BLOOM_NUCLEUS_HOME"); home != "" {
		return filepath.Join(home, "config", "metamorph.json"), nil
	}

	return filepath.Join(core.GetConfigPath(), "metamorph.json"), nil
}

// resolveNativeMetamorphConfigPath returns the absolute path to native_metamorph.json.
// Respects BLOOM_NUCLEUS_HOME if set, otherwise delegates to
// core.GetConfigPath(), which already resolves the correct platform default.
func resolveNativeMetamorphConfigPath() (string, error) {
	if home := os.Getenv("BLOOM_NUCLEUS_HOME"); home != "" {
		return filepath.Join(home, "config", "native", "native_metamorph.json"), nil
	}

	return filepath.Join(core.GetConfigPath(), "native", "native_metamorph.json"), nil
}

// ─── Ion Recipes helpers ──────────────────────────────────────────────────────

// resolveIonSitesPath constructs the path to ionsites/ inside BloomNucleus.
// Uses the same base path as managed/external binaries.
func resolveIonSitesPath(cfg *core.Config) string {
	base := GetBasePath()
	return filepath.Join(base, "bin", "cortex", "ionsites")
}

// printIonRecipesTable formats the human-readable output for ion recipes.
// Style is consistent with the managed/external binaries table.
func printIonRecipesTable(result *IonRecipesResult, showPending bool, showBackups bool) {
	fmt.Printf("\nIon Automation Recipes\n")
	fmt.Printf("Base: %s\n", result.BasePath)
	fmt.Println(strings.Repeat("─", 70))

	if len(result.Recipes) == 0 {
		fmt.Println("  No ion recipes installed.")
	} else {
		for _, recipe := range result.Recipes {
			statusLabel := "✓ Healthy"
			if recipe.Status == "missing_manifest" || recipe.Status == "missing_entrypoint" {
				statusLabel = "✗ Missing"
			} else if recipe.Status == "invalid_manifest" {
				statusLabel = "⚠ Invalid"
			}
			size := FormatSize(recipe.SizeBytes)
			fmt.Printf("%-20s v%-10s %2d actions  %d pages  %8s  %s\n",
				recipe.Site,
				recipe.Version,
				len(recipe.PublicActions),
				recipe.PageCount,
				size,
				statusLabel,
			)
		}

		fmt.Println(strings.Repeat("─", 70))
		fmt.Printf("Total: %d sites\n", len(result.Recipes))
	}

	fmt.Println(strings.Repeat("─", 70))
	fmt.Printf("Total: %d sites, %d flows\n", result.TotalSites, result.TotalFlows)

	if showPending {
		fmt.Println("\nPENDING (interrupted reconciliation):")
		for _, r := range result.Recipes {
			if r.Status == "pending" {
				fmt.Printf("  ⏳ %s\n", r.Site)
			}
		}
	}

	if showBackups {
		fmt.Println("\nBACKUPS AVAILABLE:")
		for _, r := range result.Recipes {
			backupDir := filepath.Join(filepath.Dir(result.BasePath), ionBackupDir, r.Site)
			if _, err := os.Stat(backupDir); err == nil {
				fmt.Printf("  💾 %s\n", r.Site)
			}
		}
	}
}
