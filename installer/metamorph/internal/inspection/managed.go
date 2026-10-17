package inspection

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"

	"metamorph/internal/core"
)

type aitapBundleFile struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}
type aitapBundleManifest struct {
	SchemaVersion         string            `json:"schema_version"`
	Product               string            `json:"product"`
	Version               string            `json:"version"`
	BuildNumber           int               `json:"build_number"`
	Platform              string            `json:"platform"`
	Architecture          string            `json:"architecture"`
	EmbeddedPythonVersion string            `json:"embedded_python_version"`
	PackagingMode         string            `json:"packaging_mode"`
	InventorySHA256       string            `json:"inventory_sha256"`
	RequiredPaths         []string          `json:"required_paths"`
	Smokes                map[string]string `json:"smokes"`
	Files                 []aitapBundleFile `json:"files"`
}

// walkBundleEntries walks an AITAP bundle root the same way Build's
// _inventory() does via Path.rglob("*") + Path.is_file():
//
//   - A symlink to a regular file is followed and included — the inventory
//     entry keeps the symlink's own relative path, but size/sha256 come
//     from the resolved target, exactly what Build's sha256_file()/stat()
//     compute for the equivalent Path object (confirmed case:
//     _internal/Python, a symlink to the embedded Python framework's
//     shared library).
//   - A symlink to a directory is NOT recursed into. Build's own
//     verify_bundle.py runs under a Python whose Path.rglob()/glob()
//     default to recurse_symlinks=False (the behavior since Python 3.13):
//     the symlinked directory is enumerated as one Path, Path.is_file() on
//     it is False, so it contributes no inventory entry and nothing
//     beneath it is visited through that route — confirmed case: a macOS
//     PyInstaller bundle's Python.framework/Resources, which chains
//     through Versions/Current to the real Versions/3.x/Resources tree.
//     Its files still count, but only via whatever real, non-symlinked
//     path reaches them elsewhere (recursing here instead produced an
//     inventory count 3 entries higher than Build's manifest — confirmed
//     against a real bundle).
//
// Unlike is_file(), which simply returns False (dropping the entry, no
// error) for a broken symlink, a symlink that escapes the bundle root, or a
// symlink to something that's neither a regular file nor a directory (a
// device, socket, ...), this treats all three as hard failures. Build never
// produces such a link itself, so a bundle that reaches Metamorph with one
// has already deviated from what Build verified — "treat it as absent" (or
// worse, "accept any symlink blindly") would be the unsafe default this fix
// exists to avoid.
//
// visit is called once per regular file (or resolved-through-symlink file)
// with: rel (slash-separated path relative to root, built through whatever
// symlink was followed to reach it — this is what goes in the manifest,
// matching Build's path.relative_to(root)), info (the resolved target's
// FileInfo, for .Size()), and resolvedPath (the real path to hash).
func walkBundleEntries(root string, visit func(rel string, info os.FileInfo, resolvedPath string) error) error {
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return err
	}
	// Resolve root itself too: on macOS /tmp is a symlink to /private/tmp,
	// so a bundle exercised from a temp dir would otherwise look like every
	// internal symlink "escapes" the root purely because of that ancestor
	// symlink, not because the link itself is unsafe.
	if resolvedRoot, rErr := filepath.EvalSymlinks(absRoot); rErr == nil {
		absRoot = resolvedRoot
	}
	return walkBundleDir(absRoot, root, "", visit)
}

func walkBundleDir(absRoot, dir, relPrefix string, visit func(string, os.FileInfo, string) error) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		rel := e.Name()
		if relPrefix != "" {
			rel = relPrefix + "/" + e.Name()
		}
		fullPath := filepath.Join(dir, e.Name())

		// DirEntry.Info() reports the entry itself (Lstat semantics) — it
		// does not follow a symlink, which is exactly what we need to
		// detect one before deciding how to handle it.
		info, err := e.Info()
		if err != nil {
			return fmt.Errorf("%s: %w", rel, err)
		}

		if info.Mode()&os.ModeSymlink != 0 {
			target, terr := filepath.EvalSymlinks(fullPath)
			if terr != nil {
				return fmt.Errorf("unsafe bundle symlink %s: broken symlink (or symlink loop): %w", rel, terr)
			}
			relToRoot, rErr := filepath.Rel(absRoot, target)
			if rErr != nil || relToRoot == ".." || strings.HasPrefix(relToRoot, ".."+string(filepath.Separator)) {
				return fmt.Errorf("unsafe bundle symlink %s: escapes bundle root (resolves to %s)", rel, target)
			}
			targetInfo, sErr := os.Stat(target)
			if sErr != nil {
				return fmt.Errorf("unsafe bundle symlink %s: could not stat resolved target %s: %w", rel, target, sErr)
			}

			if targetInfo.IsDir() {
				// FIX (inventory count mismatch vs Build, confirmed on Mac:
				// 140 actual vs 137 manifest — exactly 3 duplicate entries):
				// an earlier version of this fix recursed into a symlinked
				// directory (the Python.framework convention: Resources /
				// Headers / Python chain through Versions/Current down to
				// the real Versions/3.x/ tree). That double-counted every
				// file ALSO reachable via its real, non-symlinked path
				// elsewhere in the tree (e.g. Versions/3.x/Resources/*,
				// walked directly with no symlink involved).
				//
				// Build's own verify_bundle.py runs under a Python whose
				// Path.rglob()/glob() default to recurse_symlinks=False
				// (the behavior since Python 3.13): it does NOT descend
				// into a symlinked directory at all. The symlinked
				// directory itself is enumerated as one Path, but
				// Path.is_file() on it is False (it's a directory), so
				// it's excluded from the inventory — and nothing beneath
				// it is ever visited THROUGH that symlinked route. Its
				// files still count, but only via whatever real path
				// reaches them elsewhere.
				//
				// So: validate the link (not broken, doesn't escape the
				// bundle — both checks already run above) and then skip
				// it outright. No recursion, no inventory entry for the
				// directory itself — matching is_file() == False with no
				// side effect, not "accept and expand it".
				continue
			}
			if !targetInfo.Mode().IsRegular() {
				return fmt.Errorf("unsafe bundle symlink %s: resolves to a non-regular file (mode %s)", rel, targetInfo.Mode())
			}
			if err := visit(rel, targetInfo, target); err != nil {
				return err
			}
			continue
		}

		if info.IsDir() {
			if err := walkBundleDir(absRoot, fullPath, rel, visit); err != nil {
				return err
			}
			continue
		}

		if !info.Mode().IsRegular() {
			return fmt.Errorf("non-regular bundle entry: %s", fullPath)
		}
		if err := visit(rel, info, fullPath); err != nil {
			return err
		}
	}
	return nil
}

// VerifyAITAPBundle checks the complete onedir inventory against Build's v1 manifest.
func VerifyAITAPBundle(root string) (string, int, string, int, error) {
	data, err := os.ReadFile(filepath.Join(root, "bundle-manifest.json"))
	if err != nil {
		return "", 0, "", 0, err
	}
	var manifest aitapBundleManifest
	if err = json.Unmarshal(data, &manifest); err != nil {
		return "", 0, "", 0, err
	}
	if manifest.SchemaVersion != "bloom.aitap-bundle/v1" || manifest.Product != "AITAP" || manifest.PackagingMode != "pyinstaller-onedir" || manifest.Version == "" || len(manifest.Files) == 0 {
		return "", 0, "", 0, fmt.Errorf("invalid AITAP bundle manifest")
	}
	if manifest.Platform != runtime.GOOS || manifest.EmbeddedPythonVersion == "" {
		return "", 0, "", 0, fmt.Errorf("AITAP manifest platform or embedded Python mismatch")
	}
	wantArch := runtime.GOARCH
	if wantArch == "amd64" && runtime.GOOS != "windows" {
		wantArch = "x86_64"
	}
	if manifest.Architecture != wantArch {
		return "", 0, "", 0, fmt.Errorf("AITAP manifest architecture %q, expected %q", manifest.Architecture, wantArch)
	}
	for _, smoke := range []string{"system.version", "system.info", "json_help", "route.policy", "local.preflight"} {
		if manifest.Smokes[smoke] != "passed" {
			return "", 0, "", 0, fmt.Errorf("AITAP manifest smoke %s not passed", smoke)
		}
	}
	for _, required := range append([]string{core.ExeName("aitap"), "_internal", "_internal/contracts", "_internal/policies", "_internal/registry", "_internal/local/catalog", "_internal/aitap.config.json", "_internal/VERSION", "help/aitap_help.json", "help/aitap_help.txt"}, manifest.RequiredPaths...) {
		if required == "" || filepath.IsAbs(required) || strings.Contains(required, "..") {
			return "", 0, "", 0, fmt.Errorf("unsafe required path %q", required)
		}
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(required))); err != nil {
			return "", 0, "", 0, fmt.Errorf("required %s: %w", required, err)
		}
	}
	if info, err := os.Stat(filepath.Join(root, core.ExeName("aitap"))); err != nil || !info.Mode().IsRegular() {
		return "", 0, "", 0, fmt.Errorf("AITAP executable missing or not a regular file")
	}
	if info, err := os.Stat(filepath.Join(root, "_internal")); err != nil || !info.IsDir() {
		return "", 0, "", 0, fmt.Errorf("AITAP _internal directory missing")
	}
	// FIX (false rejection of a Build-approved bundle, then an inventory
	// count mismatch): macOS PyInstaller onedir bundles embed a
	// Python.framework whose Resources/Headers/Python entries are
	// framework-convention symlinks (chaining through Versions/Current
	// down to the real Versions/3.x/ tree). The original walk here used
	// filepath.Walk, which never follows symlinks, so a symlinked
	// directory arrived as a single Lstat'd entry whose
	// info.Mode().IsRegular() is never true — it failed outright with
	// "non-regular bundle entry: ...". A first fix attempt followed
	// symlinked directories recursively, assuming Build's
	// Path.rglob("*") does the same — it compiled and ran, but produced an
	// inventory 3 entries larger than Build's manifest (confirmed against
	// a real bundle), because Build's rglob (Python 3.13+ default
	// recurse_symlinks=False) does NOT descend into a symlinked directory
	// at all, so files reachable only through that route are never
	// double-counted on Build's side. walkBundleEntries (above) now
	// matches that: it follows a symlink to a regular file, but a symlink
	// to a directory is validated for safety and then skipped — no
	// recursion, no inventory entry.
	var actual []aitapBundleFile
	err = walkBundleEntries(root, func(rel string, info os.FileInfo, resolvedPath string) error {
		if rel == "bundle-manifest.json" {
			return nil
		}
		hash, err := CalculateSHA256(resolvedPath)
		if err != nil {
			return err
		}
		actual = append(actual, aitapBundleFile{Path: rel, Size: info.Size(), SHA256: hash})
		return nil
	})
	if err != nil {
		return "", 0, "", 0, err
	}
	sort.Slice(actual, func(i, j int) bool { return actual[i].Path < actual[j].Path })
	if len(actual) != len(manifest.Files) {
		return "", 0, "", 0, fmt.Errorf("AITAP inventory count mismatch: %d vs %d", len(actual), len(manifest.Files))
	}
	for i := range actual {
		if actual[i] != manifest.Files[i] {
			return "", 0, "", 0, fmt.Errorf("AITAP inventory mismatch at %s", actual[i].Path)
		}
	}
	// Build canonicalizes a list of objects with alphabetically sorted JSON keys.
	parts := make([]string, 0, len(actual))
	for _, file := range actual {
		p, _ := json.Marshal(file.Path)
		h, _ := json.Marshal(file.SHA256)
		parts = append(parts, fmt.Sprintf(`{"path":%s,"sha256":%s,"size":%d}`, p, h, file.Size))
	}
	digest := sha256.Sum256([]byte("[" + strings.Join(parts, ",") + "]"))
	inventoryHash := hex.EncodeToString(digest[:])
	if inventoryHash != manifest.InventorySHA256 {
		return "", 0, "", 0, fmt.Errorf("AITAP inventory digest mismatch")
	}
	return manifest.Version, manifest.BuildNumber, inventoryHash, len(actual), nil
}

// metamorphAppConfig represents the subset of metamorph-config.json that inspection
// cares about.  The file lives in the same directory as the metamorph executable
// and is the authoritative source for binary paths that can differ between
// installations (e.g. Host, which moved from bin/native/ to bin/host/).
type metamorphAppConfig struct {
	Paths struct {
		HostExe string `json:"host_exe"`
	} `json:"paths"`
}

// defaultHostPath is the compile-time fallback used only when neither
// metamorph-config.json nor nucleus.json can supply the real path.
// Uses core.ExeName so it is correct on all platforms (no .exe on macOS/Linux).
var defaultHostPath = filepath.Join("bin", "host", core.ExeName("bloom-host"))

// nucleusSystemMap is the subset of nucleus.json that inspection cares about.
// The file lives at BloomNucleus/config/nucleus.json and is the authoritative
// record of installed binary locations written by the installer.
type nucleusSystemMap struct {
	SystemMap struct {
		HostExe   string `json:"host_exe"`
		BloomBase string `json:"bloom_base"`
	} `json:"system_map"`
}

// loadNucleusSystemMap reads BloomNucleus/config/nucleus.json.
// Returns a zero-value struct (no error) if the file is absent.
func loadNucleusSystemMap(basePath string) (nucleusSystemMap, error) {
	configPath := filepath.Join(basePath, "config", "nucleus.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nucleusSystemMap{}, nil
		}
		return nucleusSystemMap{}, fmt.Errorf("could not read nucleus.json: %w", err)
	}
	var cfg nucleusSystemMap
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nucleusSystemMap{}, fmt.Errorf("could not parse nucleus.json: %w", err)
	}
	return cfg, nil
}

// loadMetamorphAppConfig reads metamorph-config.json from the same directory as
// the running executable.  Returns a zero-value struct (no error) if the file is
// absent so callers can apply their own defaults gracefully.
func loadMetamorphAppConfig() (metamorphAppConfig, error) {
	exeDir, err := filepath.Abs(filepath.Dir(os.Args[0]))
	if err != nil {
		return metamorphAppConfig{}, fmt.Errorf("could not determine executable directory: %w", err)
	}
	configPath := filepath.Join(exeDir, "metamorph-config.json")

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			// Config file is optional; callers will use defaults.
			return metamorphAppConfig{}, nil
		}
		return metamorphAppConfig{}, fmt.Errorf("could not read metamorph-config.json: %w", err)
	}

	var cfg metamorphAppConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return metamorphAppConfig{}, fmt.Errorf("could not parse metamorph-config.json: %w", err)
	}
	return cfg, nil
}

// managedBinaryDefinition defines a managed binary and its interrogation contract.
// Each binary has its own flag convention — do not assume a uniform interface.
type managedBinaryDefinition struct {
	name         string
	path         string
	versionArgs  []string // args to pass for version query
	infoArgs     []string // args to pass for info query
	versionField string   // dotpath into JSON response to find version string
	buildField   string   // dotpath into JSON response to find build number
}

// getManagedBinaries returns the list of managed binaries with their real
// interrogation contracts, as verified against each binary's actual CLI output.
//
// Contracts verified on 2026-02-18:
//
//	Brain:     brain --json --version      → data.app_release / data.build_counter
//	Nucleus:   nucleus --json version      → version / build_number
//	Sentinel:  sentinel --json version     → version / build
//	Host:      bloom-host --version --json → version / build
//	Workspace: bin/workspace/ — reads build_info.json directly (no script)
//	Metamorph: metamorph --json version    → version / build_number
//	Cortex:    reads cortex.meta.json from inside .blx ZIP (not executable)
//	Setup:     bin/setup/ — reads build_info.json directly (no script)
//
// NOTE ON PATHS:
//
//	All paths use core.ExeName() so they are correct on every platform
//	(no .exe suffix on macOS/Linux).
//	Host path is read from nucleus.json system_map.host_exe at runtime, then
//	metamorph-config.json paths.host_exe as secondary fallback, then defaultHostPath.
//	nucleus.json values are absolute paths; all others are relative to basePath.
func getManagedBinaries(hostPath string) []managedBinaryDefinition {
	if hostPath == "" {
		hostPath = defaultHostPath
	} else if !filepath.IsAbs(hostPath) {
		clean := filepath.Clean(hostPath)
		if clean != "bin" && !strings.HasPrefix(clean, "bin"+string(filepath.Separator)) {
			hostPath = filepath.Join("bin", clean)
		}
	}

	// Workspace path depends on the platform:
	//   macOS  — installed as an .app bundle in /Applications/
	//   others — exe inside bin/workspace/
	// On macOS we set the path to the .app bundle; the inspector stats the bundle
	// root (it's a directory) rather than the inner Mach-O.
	//
	// This component used to be labeled "Conductor" here even though it has
	// been deployed as "workspace" everywhere else in the system for a long
	// time (see `metamorph rollout --only workspace`, the macOS path below,
	// which already reads "Workspace.app", and rollout.go's "workspace"
	// component). An earlier version of this code kept the managed-binary
	// Name as "Conductor" on purpose, for JSON/API backwards compatibility
	// with whatever reads metamorph.json. Renamed to "Workspace" per
	// explicit instruction (2026-10-06) to match the real component name —
	// if anything external still keys off "Conductor" in metamorph.json,
	// it will need updating too.
	workspacePath := filepath.Join("bin", "workspace", core.ExeName("bloom-workspace"))
	if runtime.GOOS == "darwin" {
		workspacePath = "/Applications/Bloom Nucleus Workspace.app"
	}

	return []managedBinaryDefinition{
		{
			name:         "Brain",
			path:         filepath.Join("bin", "brain", core.ExeName("brain")),
			versionArgs:  []string{"--json", "--version"},
			infoArgs:     []string{"--json", "--info"},
			versionField: "data.app_release",
			buildField:   "data.build_counter",
		},
		{
			// Nucleus has no "version" subcommand (confirmed: "Error: unknown
			// command \"version\" for \"nucleus\""). Only "info" is available,
			// and its JSON is flat (no "data." wrapper like Brain):
			//   nucleus --json info → {"app_release": "1.0.0", "build_counter": 83, ...}
			name:         "Nucleus",
			path:         filepath.Join("bin", "nucleus", core.ExeName("nucleus")),
			versionArgs:  []string{}, // no "version" subcommand — go straight to infoArgs
			infoArgs:     []string{"--json", "info"},
			versionField: "app_release",
			buildField:   "build_counter",
		},
		{
			name:         "Sentinel",
			path:         filepath.Join("bin", "sentinel", core.ExeName("sentinel")),
			versionArgs:  []string{"--json", "version"},
			infoArgs:     []string{"--json", "info"},
			versionField: "version",
			buildField:   "build",
		},
		{
			// Path resolved at runtime: nucleus.json system_map.host_exe →
			// metamorph-config.json paths.host_exe → defaultHostPath fallback.
			// nucleus.json supplies an absolute path on dev/macOS installs.
			name:         "Host",
			path:         hostPath,
			versionArgs:  []string{"--version", "--json"},
			infoArgs:     []string{"--info", "--json"},
			versionField: "version",
			buildField:   "build",
		},
		{
			name:         "Workspace",
			path:         workspacePath,
			versionArgs:  []string{}, // platform-specific — see inspectWorkspace()
			infoArgs:     []string{},
			versionField: "version",
			buildField:   "build",
		},
		{
			name:         "Cortex",
			path:         filepath.Join("bin", "cortex", "bloom-cortex.blx"),
			versionArgs:  []string{}, // not executable — read from cortex.meta.json inside ZIP
			infoArgs:     []string{},
			versionField: "",
			buildField:   "",
		},
		{
			name:         "Metamorph",
			path:         filepath.Join("bin", "metamorph", core.ExeName("metamorph")),
			versionArgs:  []string{"--json", "version"},
			infoArgs:     []string{"--json", "info"},
			versionField: "version",
			buildField:   "build_number",
		},
		{
			// Sensor (Human Presence Runtime).
			// --json version → JSON: {"build": "57", "channel": "stable", "version": "1.0.0"}
			// Note: build is a string in the JSON output, _parse_build handles str→int conversion.
			// --json info   → JSON: {version, channel, capabilities, requires} — no build field.
			name:         "Sensor",
			path:         filepath.Join("bin", "sensor", core.ExeName("bloom-sensor")),
			versionArgs:  []string{"--json", "version"},
			infoArgs:     []string{"--json", "info"},
			versionField: "version",
			buildField:   "build",
		},
		{
			name:         "Setup",
			path:         filepath.Join("bin", "setup", core.ExeName("bloom-setup")),
			versionArgs:  []string{}, // Electron — interrogated via build_info.json, see inspectElectronApp()
			infoArgs:     []string{},
			versionField: "version",
			buildField:   "build",
		},
		{
			// Impact (Portable Consequence Evaluator). Same contract as Metamorph:
			// impact/internal/system/version.go emits {name, version, build_number, ...}.
			name:         "Impact",
			path:         filepath.Join("bin", "impact", core.ExeName("impact")),
			versionArgs:  []string{"--json", "version"},
			infoArgs:     []string{"--json", "info"},
			versionField: "version",
			buildField:   "build_number",
		},
		{
			// Monitor (Local Persistent Runtime Observer). Same contract as Impact/Metamorph.
			name:         "Monitor",
			path:         filepath.Join("bin", "monitor", core.ExeName("monitor")),
			versionArgs:  []string{"--json", "version"},
			infoArgs:     []string{"--json", "info"},
			versionField: "version",
			buildField:   "build_number",
		},
		{
			// AITap (Intelligence/Execution Routing). Python/PyInstaller, not Go —
			// its "version"/"info" commands live under the "system" category
			// (aitap system version / aitap system info), so --json goes before
			// the subcommand tree, not right before "version" like the Go apps.
			// Same JSON field names as Impact/Monitor/Metamorph: version /
			// build_number. Build number comes from src/aitap/_build_info.py,
			// regenerated at build time (no -ldflags equivalent in PyInstaller).
			name:         "AITap",
			path:         filepath.Join("bin", "aitap", core.ExeName("aitap")),
			versionArgs:  []string{"--json", "system", "version"},
			infoArgs:     []string{"--json", "system", "info"},
			versionField: "version",
			buildField:   "build_number",
		},
	}
}

// dotGet navigates a nested JSON map using dot notation.
// "data.app_release" → map["data"]["app_release"]
func dotGet(data map[string]interface{}, path string) interface{} {
	parts := splitDotPath(path)
	var current interface{} = data
	for _, key := range parts {
		m, ok := current.(map[string]interface{})
		if !ok {
			return nil
		}
		current = m[key]
	}
	return current
}

func splitDotPath(path string) []string {
	var parts []string
	start := 0
	for i := 0; i < len(path); i++ {
		if path[i] == '.' {
			parts = append(parts, path[start:i])
			start = i + 1
		}
	}
	parts = append(parts, path[start:])
	return parts
}

// extractVersionAndBuild parses a JSON output string and extracts
// version and build_number using the dotpaths defined in the contract.
// Skips any log lines before the first '{' (e.g. sentinel emits "[INFO] ..." first).
func extractVersionAndBuild(output, versionField, buildField string) (version string, build int) {
	jsonStart := -1
	for i := 0; i < len(output); i++ {
		if output[i] == '{' {
			jsonStart = i
			break
		}
	}
	if jsonStart == -1 {
		return "", 0
	}

	var data map[string]interface{}
	if err := json.Unmarshal([]byte(output[jsonStart:]), &data); err != nil {
		return "", 0
	}

	if v := dotGet(data, versionField); v != nil {
		version = fmt.Sprintf("%v", v)
	}
	if b := dotGet(data, buildField); b != nil {
		if val, ok := b.(float64); ok {
			build = int(val)
		}
	}
	return version, build
}

// InspectManagedBinary inspects a single managed binary using its specific contract.
func InspectManagedBinary(name, path string, def managedBinaryDefinition) (*ManagedBinary, error) {
	binary := &ManagedBinary{
		Name:                 name,
		Path:                 path,
		UpdatableByMetamorph: true,
		Status:               "unknown",
		Version:              "unknown",
	}

	if !FileExists(path) {
		binary.Status = "missing"
		return binary, nil
	}
	if name == "AITap" {
		version, build, digest, _, verifyErr := VerifyAITAPBundle(filepath.Dir(path))
		if verifyErr != nil {
			binary.Status = "corrupted"
			binary.Hash = "invalid_bundle"
			return binary, verifyErr
		}
		binary.Version, binary.BuildNumber, binary.Hash = version, build, digest
		_ = filepath.Walk(filepath.Dir(path), func(_ string, info os.FileInfo, err error) error {
			if err == nil && info.Mode().IsRegular() {
				binary.SizeBytes += info.Size()
			}
			return err
		})
		binary.Status = "healthy"
		return binary, nil
	}

	size, modTime, err := GetFileInfo(path)
	if err == nil {
		binary.SizeBytes = size
		binary.LastModified = modTime.UTC().Format("2006-01-02T15:04:05Z")
	}

	hash, err := CalculateSHA256(path)
	if err != nil {
		binary.Hash = "error_calculating_hash"
	} else {
		binary.Hash = hash
	}

	// Cortex: read metadata from inside the .blx ZIP
	if isCortexBinary(path) {
		return inspectCortexBinary(binary, path)
	}

	// Workspace and Setup: Electron apps interrogated via bundled build_info.json
	if name == "Workspace" {
		return inspectWorkspace(binary, path)
	}
	if name == "Setup" {
		return inspectSetup(binary, path)
	}

	// Sensor: version is plain-text, info is JSON; use dedicated inspector.
	if name == "Sensor" {
		return inspectSensor(binary, path)
	}

	// Standard executables: version_args first, info_args as fallback.
	//
	// A binary can print perfectly valid --json output and still exit
	// non-zero (e.g. Sentinel returning an error status because its event
	// bus is already owned by a running instance, while still emitting its
	// version JSON on stdout first). cmd.CombinedOutput() surfaces that as
	// a non-nil err alongside the captured output, so we must not let a
	// non-zero exit code alone discard output that otherwise parses into a
	// usable version. Only an empty/unparseable output falls through.
	if len(def.versionArgs) > 0 {
		out, _ := ExecuteCommandWithTimeout(path, def.versionArgs...)
		if out != "" {
			version, build := extractVersionAndBuild(out, def.versionField, def.buildField)
			if version != "" {
				binary.Version = version
				binary.BuildNumber = build
				binary.Status = "healthy"
				return binary, nil
			}
		}
	}

	if len(def.infoArgs) > 0 {
		out, _ := ExecuteCommandWithTimeout(path, def.infoArgs...)
		if out != "" {
			version, build := extractVersionAndBuild(out, def.versionField, def.buildField)
			if version != "" {
				binary.Version = version
				binary.BuildNumber = build
				binary.Status = "healthy"
				return binary, nil
			}
		}
	}

	binary.Status = "unknown"
	return binary, nil
}

// inspectCortexBinary reads metadata from cortex.meta.json inside the .blx ZIP.
func inspectCortexBinary(binary *ManagedBinary, path string) (*ManagedBinary, error) {
	meta, err := ReadCortexMeta(path)
	if err != nil {
		binary.Status = "unknown"
		binary.Version = "unknown"
		return binary, fmt.Errorf("cortex meta read failed for %s: %w", path, err)
	}
	applyCortexMeta(binary, meta)
	return binary, nil
}

// electronBuildInfo mirrors build_info.json, bundled at build time inside
// resources/app.asar.unpacked/ of Electron apps (Setup, Workspace).
// Verified against real deploy output on 2026-08-08:
//
//	{"name":"bloom-setup","product_name":"Bloom Conductor Setup","version":"1.0.0",
//	 "build":104,"full_version":"1.0.0+build.104","channel":"stable",
//	 "built_at":"2026-06-28T14:57:28.141Z","git_commit":"b35fdc5",
//	 "platform":"linux","arch":"win64","node_version":"v20.20.2","electron_version":"^28.0.0"}
type electronBuildInfo struct {
	Name        string `json:"name"`
	ProductName string `json:"product_name"`
	Version     string `json:"version"`
	Build       int    `json:"build"`
	FullVersion string `json:"full_version"`
	Channel     string `json:"channel"`
	BuiltAt     string `json:"built_at"`
	GitCommit   string `json:"git_commit"`
}

// readElectronBuildInfo reads build_info.json for an Electron app.
// exeDir is the directory containing the app's main executable
// (on macOS, the .app bundle path itself).
//
// Layout differs by platform:
//
//	Linux/Windows : <exeDir>/resources/app.asar.unpacked/build_info.json
//	macOS (.app)  : <exeDir>/Contents/Resources/app.asar.unpacked/build_info.json
func readElectronBuildInfo(exeDir string) (*electronBuildInfo, error) {
	var buildInfoPath string
	if runtime.GOOS == "darwin" {
		buildInfoPath = filepath.Join(exeDir, "Contents", "Resources", "app.asar.unpacked", "build_info.json")
	} else {
		buildInfoPath = filepath.Join(exeDir, "resources", "app.asar.unpacked", "build_info.json")
	}

	data, err := os.ReadFile(buildInfoPath)
	if err != nil {
		return nil, fmt.Errorf("could not read build_info.json at %s: %w", buildInfoPath, err)
	}

	var info electronBuildInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, fmt.Errorf("could not parse build_info.json: %w", err)
	}
	return &info, nil
}

// inspectElectronApp interrogates an Electron app (Setup, Workspace)
// by reading its bundled build_info.json directly. No OS-specific script
// (.ps1 on Windows, .sh on macOS) is needed or invoked — build_info.json is
// generated at build time and ships identically on every platform.
func inspectElectronApp(binary *ManagedBinary, exePath string) (*ManagedBinary, error) {
	exeDir := filepath.Dir(exePath)
	if runtime.GOOS == "darwin" {
		// exePath already points at the .app bundle root on macOS.
		exeDir = exePath
	}

	info, err := readElectronBuildInfo(exeDir)
	if err != nil {
		binary.Status = "unknown"
		return binary, err
	}

	binary.Version = info.Version
	binary.BuildNumber = info.Build
	binary.Status = "healthy"
	binary.ElectronMeta = &ElectronMeta{
		Channel:     info.Channel,
		FullVersion: info.FullVersion,
		GitCommit:   info.GitCommit,
		BuiltAt:     info.BuiltAt,
	}
	return binary, nil
}

// inspectWorkspace interrogates the Workspace Electron app via its
// bundled build_info.json.
func inspectWorkspace(binary *ManagedBinary, exePath string) (*ManagedBinary, error) {
	return inspectElectronApp(binary, exePath)
}

// inspectSetup interrogates the Bloom Nucleus Installer (Setup) Electron app
// via its bundled build_info.json.
func inspectSetup(binary *ManagedBinary, exePath string) (*ManagedBinary, error) {
	return inspectElectronApp(binary, exePath)
}

// inspectSensor interrogates bloom-sensor using its native CLI flags.
//
// Two-pass strategy:
//  1. `--json version` — JSON output; extracts version, build (string), channel.
//     Example: {"build": "57", "channel": "stable", "version": "1.0.0"}
//  2. `--json info`    — JSON output; enriches the result with capabilities and requires
//     stored in binary.SensorInfo.
//
// Note: bloom-sensor requires --json BEFORE the subcommand.
func inspectSensor(binary *ManagedBinary, exePath string) (*ManagedBinary, error) {
	// Pass 1: --json version (JSON) — version and build number
	out, err := ExecuteCommandWithTimeout(exePath, "--json", "version")
	if err == nil && out != "" {
		jsonStart := strings.Index(out, "{")
		if jsonStart >= 0 {
			var vdata struct {
				Version string `json:"version"`
				Build   string `json:"build"` // sensor emits build as string e.g. "57"
				Channel string `json:"channel"`
			}
			if json.Unmarshal([]byte(out[jsonStart:]), &vdata) == nil && vdata.Version != "" {
				binary.Version = vdata.Version
				binary.Status = "healthy"
				// Parse build string → int
				if vdata.Build != "" {
					if n, err := fmt.Sscanf(vdata.Build, "%d", &binary.BuildNumber); n != 1 || err != nil {
						binary.BuildNumber = 0
					}
				}
			}
		}
	}

	// Pass 2: --json info — collect extended metadata (capabilities, requires)
	infoOut, err := ExecuteCommandWithTimeout(exePath, "--json", "info")
	if err == nil && infoOut != "" {
		jsonStart := strings.Index(infoOut, "{")
		if jsonStart >= 0 {
			var info struct {
				Name         string            `json:"name"`
				Version      string            `json:"version"`
				Channel      string            `json:"channel"`
				Capabilities []string          `json:"capabilities"`
				Requires     map[string]string `json:"requires"`
			}
			if json.Unmarshal([]byte(infoOut[jsonStart:]), &info) == nil {
				// Promote version from info if not already set
				if binary.Version == "unknown" && info.Version != "" {
					binary.Version = info.Version
					binary.Status = "healthy"
				}
				binary.SensorInfo = &SensorInfo{
					Channel:      info.Channel,
					Capabilities: info.Capabilities,
					Requires:     info.Requires,
				}
			}
		}
	}

	return binary, nil
}

// InspectAllManagedBinaries inspects all managed binaries in parallel.
func InspectAllManagedBinaries(basePath string) ([]ManagedBinary, error) {
	// Resolve host path — precedence:
	//   1. nucleus.json system_map.host_exe   (absolute path, written by installer)
	//   2. metamorph-config.json paths.host_exe (relative or absolute)
	//   3. defaultHostPath compile-time fallback (relative)
	hostPath := ""

	nucleusCfg, err := loadNucleusSystemMap(basePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "warning: could not load nucleus.json: %v\n", err)
	}
	if nucleusCfg.SystemMap.HostExe != "" {
		hostPath = nucleusCfg.SystemMap.HostExe
	}

	if hostPath == "" {
		appCfg, err := loadMetamorphAppConfig()
		if err != nil {
			fmt.Fprintf(os.Stderr, "warning: could not load metamorph-config.json: %v\n", err)
		}
		hostPath = appCfg.Paths.HostExe
	}

	definitions := getManagedBinaries(hostPath)
	results := make([]ManagedBinary, len(definitions))

	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 4)

	for i, def := range definitions {
		wg.Add(1)
		go func(index int, definition managedBinaryDefinition) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			// If the path is already absolute (e.g. from nucleus.json system_map
			// or the macOS Workspace .app path) use it directly; otherwise join
			// with basePath.
			var fullPath string
			if filepath.IsAbs(definition.path) {
				fullPath = definition.path
			} else {
				fullPath = buildPath(basePath, definition.path)
			}

			binary, err := InspectManagedBinary(definition.name, fullPath, definition)
			if err != nil {
				if binary != nil {
					// The executable exists but its metadata could not be read.
					// Preserve that distinction instead of reporting it as absent.
					results[index] = *binary
				} else {
					results[index] = ManagedBinary{
						Name:                 definition.name,
						Path:                 fullPath,
						Status:               "unknown",
						Version:              "unknown",
						UpdatableByMetamorph: true,
					}
				}
			} else {
				results[index] = *binary
			}
		}(i, def)
	}

	wg.Wait()
	return results, nil
}

// InspectSelfBinary inspects the currently running Metamorph binary.
func InspectSelfBinary() (*ManagedBinary, error) {
	exePath, err := filepath.Abs(filepath.Join(filepath.Dir("."), core.ExeName("metamorph")))
	if err != nil {
		return nil, fmt.Errorf("failed to determine executable path: %w", err)
	}
	selfDef := managedBinaryDefinition{
		name:         "Metamorph",
		versionArgs:  []string{"--json", "version"},
		infoArgs:     []string{"--json", "info"},
		versionField: "version",
		buildField:   "build_number",
	}
	return InspectManagedBinary("Metamorph", exePath, selfDef)
}
