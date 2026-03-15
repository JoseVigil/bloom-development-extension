package inspection

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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

Results are always written to:
  Default : %LOCALAPPDATA%\BloomNucleus\config\metamorph.json
  Native  : %LOCALAPPDATA%\BloomNucleus\config\native\native_metamorph.json

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

  Written to (default):  %LOCALAPPDATA%\\BloomNucleus\\config\\metamorph.json
  Written to (--native): %LOCALAPPDATA%\\BloomNucleus\\config\\native\\native_metamorph.json`,
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
			return runInspection(c, includeExternal, nativeMode)
		},
	}

	cmd.Flags().BoolP("all", "a", false, "Include external binaries (Temporal, Ollama, Chromium, Node)")
	cmd.Flags().Bool("native", false, "Inspect native/bin/<platform>/ build output instead of AppData")
	return cmd
}

// runInspection performs the inspection, writes the result JSON, and outputs results.
func runInspection(c *core.Core, includeExternal bool, nativeMode bool) error {
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

	// Inspect Bootstrap — uses bootstrapBase (cross-platform, no platform subfolder)
	bootstrap, err := inspectBootstrap(bootstrapBase)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not inspect bootstrap: %v\n", err)
	} else {
		managed = append(managed, bootstrap)
	}

	// Inspect VSCode extension — uses bootstrapBase (cross-platform, no platform subfolder)
	vsix, err := inspectVSCodeExtension(bootstrapBase)
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

// bootstrapVersionOutput matches the JSON emitted by version-bootstrap.py.
type bootstrapVersionOutput struct {
	Success     bool   `json:"success"`
	Version     string `json:"version"`
	BuildNumber int    `json:"build_number"`
	BuildDate   string `json:"build_date"`
	Info        string `json:"info"`
	DryRun      bool   `json:"dry_run"`
}

// BootstrapMeta holds the extra fields reported by version-bootstrap.py.
type BootstrapMeta struct {
	BuildDate string `json:"build_date"`
	Info      string `json:"info"`
}

// inspectBootstrap runs bin/bootstrap/version-bootstrap.py and returns a
// ManagedBinary entry. The script is executed from its own directory so that
// any relative imports inside it resolve correctly.
func inspectBootstrap(basePath string) (ManagedBinary, error) {
	scriptDir := filepath.Join(basePath, "bootstrap")
	scriptPath := filepath.Join(scriptDir, "version-bootstrap.py")

	stat, err := os.Stat(scriptPath)
	if err != nil {
		return ManagedBinary{
			Name:                 "Bootstrap",
			Path:                 scriptPath,
			Version:              "unknown",
			Status:               "unhealthy",
			UpdatableByMetamorph: true,
		}, fmt.Errorf("script not found: %w", err)
	}

	var stdout, stderr bytes.Buffer
	cmd := exec.Command("python", "version-bootstrap.py")
	cmd.Dir = scriptDir
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return ManagedBinary{
			Name:                 "Bootstrap",
			Path:                 scriptPath,
			Version:              "unknown",
			Status:               "unhealthy",
			UpdatableByMetamorph: true,
		}, fmt.Errorf("script execution failed: %v — stderr: %s", err, stderr.String())
	}

	var out bootstrapVersionOutput
	if err := json.Unmarshal(stdout.Bytes(), &out); err != nil {
		return ManagedBinary{
			Name:                 "Bootstrap",
			Path:                 scriptPath,
			Version:              "unknown",
			Status:               "unhealthy",
			UpdatableByMetamorph: true,
		}, fmt.Errorf("could not parse script output: %w", err)
	}

	if !out.Success {
		return ManagedBinary{
			Name:                 "Bootstrap",
			Path:                 scriptPath,
			Version:              "unknown",
			Status:               "unhealthy",
			UpdatableByMetamorph: true,
		}, fmt.Errorf("script reported success=false")
	}

	hash, _ := sha256File(scriptPath)

	return ManagedBinary{
		Name:                 "Bootstrap",
		Path:                 scriptPath,
		Version:              out.Version,
		BuildNumber:          out.BuildNumber,
		Hash:                 hash,
		SizeBytes:            stat.Size(),
		LastModified:         stat.ModTime().UTC().Format(time.RFC3339),
		Status:               "healthy",
		UpdatableByMetamorph: true,
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
			Name:                 "VSCodeExtension",
			Path:                 vsixPath,
			Version:              "unknown",
			Status:               "unhealthy",
			UpdatableByMetamorph: true,
		}, fmt.Errorf("file not found: %w", err)
	}

	pkg, err := readVsixPackageJSON(vsixPath)
	if err != nil {
		return ManagedBinary{
			Name:                 "VSCodeExtension",
			Path:                 vsixPath,
			Version:              "unknown",
			Status:               "unhealthy",
			UpdatableByMetamorph: true,
		}, fmt.Errorf("could not read package.json from vsix: %w", err)
	}

	hash, _ := sha256File(vsixPath)

	return ManagedBinary{
		Name:                 "VSCodeExtension",
		Path:                 vsixPath,
		Version:              pkg.Version,
		Hash:                 hash,
		SizeBytes:            stat.Size(),
		LastModified:         stat.ModTime().UTC().Format(time.RFC3339),
		Status:               "healthy",
		UpdatableByMetamorph: true,
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
	return writeJSONAtomic(configPath, result)
}

// writeNativeMetamorphConfig persists the inspection result to:
//
//	%LOCALAPPDATA%\BloomNucleus\config\native\native_metamorph.json
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
// Respects BLOOM_NUCLEUS_HOME if set, otherwise uses the platform default.
func resolveMetamorphConfigPath() (string, error) {
	if home := os.Getenv("BLOOM_NUCLEUS_HOME"); home != "" {
		return filepath.Join(home, "config", "metamorph.json"), nil
	}

	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("could not determine home directory: %w", err)
		}
		localAppData = filepath.Join(homeDir, "AppData", "Local")
	}

	return filepath.Join(localAppData, "BloomNucleus", "config", "metamorph.json"), nil
}

// resolveNativeMetamorphConfigPath returns the absolute path to native_metamorph.json.
// Respects BLOOM_NUCLEUS_HOME if set, otherwise uses the platform default.
func resolveNativeMetamorphConfigPath() (string, error) {
	if home := os.Getenv("BLOOM_NUCLEUS_HOME"); home != "" {
		return filepath.Join(home, "config", "native", "native_metamorph.json"), nil
	}

	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("could not determine home directory: %w", err)
		}
		localAppData = filepath.Join(homeDir, "AppData", "Local")
	}

	return filepath.Join(localAppData, "BloomNucleus", "config", "native", "native_metamorph.json"), nil
}