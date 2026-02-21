package inspection

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

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
//	Brain:     brain.exe --json --version   → data.app_release / data.build_counter
//	Nucleus:   nucleus.exe --json version   → version / build_number
//	Sentinel:  sentinel.exe --json version  → version / build
//	Host:      bloom-host.exe --version --json → version / build
//	Conductor: bloom-conductor-version.ps1 --json → version / build
//	Metamorph: metamorph.exe --json version → version / build_number
//	Cortex:    reads cortex.meta.json from inside .blx ZIP (not executable)
//	Setup:     bloom-setup-version.ps1 --json → version / build
//
// NOTE ON PATHS:
//
//	Host deploys to bin/native/ in AppData (not bin/host/).
//	This matches the layout used by the Windows service manager (bloom-host).
//	Conductor and Setup are Electron apps; their version .ps1 scripts live
//	inside win-unpacked/ within their respective directories.
func getManagedBinaries() []managedBinaryDefinition {
	return []managedBinaryDefinition{
		{
			name:         "Brain",
			path:         "brain/brain.exe",
			versionArgs:  []string{"--json", "--version"},
			infoArgs:     []string{"--json", "--info"},
			versionField: "data.app_release",
			buildField:   "data.build_counter",
		},
		{
			name:         "Nucleus",
			path:         "nucleus/nucleus.exe",
			versionArgs:  []string{"--json", "version"},
			infoArgs:     []string{"--json", "info"},
			versionField: "version",
			buildField:   "build_number",
		},
		{
			name:         "Sentinel",
			path:         "sentinel/sentinel.exe",
			versionArgs:  []string{"--json", "version"},
			infoArgs:     []string{"--json", "info"},
			versionField: "version",
			buildField:   "build",
		},
		{
			// Host deploys to bin/native/ — not bin/host/ — to match the
			// Windows service layout expected by bloom-host and NSSM.
			name:         "Host",
			path:         "native/bloom-host.exe",
			versionArgs:  []string{"--version", "--json"},
			infoArgs:     []string{"--info", "--json"},
			versionField: "version",
			buildField:   "build",
		},
		{
			name:         "Conductor",
			path:         "conductor/bloom-conductor.exe",
			versionArgs:  []string{}, // interrogated via .ps1 — see inspectConductor()
			infoArgs:     []string{},
			versionField: "version",
			buildField:   "build",
		},
		{
			name:         "Cortex",
			path:         "cortex/bloom-cortex.blx",
			versionArgs:  []string{}, // not executable — read from cortex.meta.json inside ZIP
			infoArgs:     []string{},
			versionField: "",
			buildField:   "",
		},
		{
			name:         "Metamorph",
			path:         "metamorph/metamorph.exe",
			versionArgs:  []string{"--json", "version"},
			infoArgs:     []string{"--json", "info"},
			versionField: "version",
			buildField:   "build_number",
		},
		{
			// Launcher daemon binary.  build_number is a JSON string in its output
			// ("0"), not a number, so it is handled by inspectLauncher() rather
			// than the generic extractVersionAndBuild path.
			name:         "Launcher",
			path:         "launcher/bloom-launcher.exe",
			versionArgs:  []string{"--version", "--json"}, // → {"version":"1.0.0","build_number":"0",...}
			infoArgs:     []string{"info", "--json"},       // → full info JSON with daemon/startup/runtime/pipe
			versionField: "version",
			buildField:   "", // not used — handled in inspectLauncher
		},
		{
			name:         "Setup",
			path:         "setup/bloom-setup.exe",
			versionArgs:  []string{}, // Electron — interrogated via .ps1, see inspectElectronBinary()
			infoArgs:     []string{},
			versionField: "version",
			buildField:   "build",
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

	// Conductor and Setup: Electron binaries interrogated via companion .ps1 scripts
	if name == "Conductor" {
		return inspectConductor(binary, path)
	}
	if name == "Setup" {
		return inspectSetup(binary, path)
	}

	// Launcher: build_number is a string in its JSON; use a dedicated inspector
	// that also captures the rich info fields (daemon, startup, runtime, pipe).
	if name == "Launcher" {
		return inspectLauncher(binary, path)
	}

	// Standard executables: version_args first, info_args as fallback
	if len(def.versionArgs) > 0 {
		out, err := ExecuteCommandWithTimeout(path, def.versionArgs...)
		if err == nil && out != "" {
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
		out, err := ExecuteCommandWithTimeout(path, def.infoArgs...)
		if err == nil && out != "" {
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

// inspectElectronBinary interrogates an Electron binary via its companion .ps1 script.
// ps1Name is the filename of the script (e.g. "bloom-conductor-version.ps1").
func inspectElectronBinary(binary *ManagedBinary, exePath, ps1Name string) (*ManagedBinary, error) {
	ps1Path := filepath.Join(filepath.Dir(exePath), "win-unpacked", ps1Name)

	if !FileExists(ps1Path) {
		binary.Status = "unknown"
		return binary, nil
	}

	out, err := ExecuteCommandWithTimeout(
		"powershell",
		"-ExecutionPolicy", "Bypass",
		"-File", ps1Path,
		"--json",
	)
	if err == nil && out != "" {
		version, build := extractVersionAndBuild(out, "version", "build")
		if version != "" {
			binary.Version = version
			binary.BuildNumber = build
			binary.Status = "healthy"
			return binary, nil
		}
	}

	binary.Status = "unknown"
	return binary, nil
}

// inspectConductor interrogates Conductor via its companion PowerShell script.
func inspectConductor(binary *ManagedBinary, exePath string) (*ManagedBinary, error) {
	return inspectElectronBinary(binary, exePath, "bloom-conductor-version.ps1")
}

// inspectSetup interrogates the Bloom Nucleus Installer via its companion PowerShell script.
func inspectSetup(binary *ManagedBinary, exePath string) (*ManagedBinary, error) {
	return inspectElectronBinary(binary, exePath, "bloom-setup-version.ps1")
}

// inspectLauncher interrogates bloom-launcher using its native CLI flags.
//
// Two-pass strategy:
//  1. `--version --json` — fast path; captures version + build_number (string).
//  2. `info --json`      — enriches the result with daemon/startup/runtime/pipe
//     fields stored in binary.LauncherInfo.
//
// build_number is emitted as a JSON string by bloom-launcher (e.g. "0"), so it
// is parsed explicitly here rather than via the generic extractVersionAndBuild
// helper (which expects a float64).
func inspectLauncher(binary *ManagedBinary, exePath string) (*ManagedBinary, error) {
	// Pass 1: --version --json
	out, err := ExecuteCommandWithTimeout(exePath, "--version", "--json")
	if err == nil && out != "" {
		jsonStart := strings.Index(out, "{")
		if jsonStart >= 0 {
			var v map[string]interface{}
			if json.Unmarshal([]byte(out[jsonStart:]), &v) == nil {
				if ver, ok := v["version"].(string); ok && ver != "" {
					binary.Version = ver
					binary.Status = "healthy"
				}
				// build_number is a string in launcher's output
				if bn, ok := v["build_number"].(string); ok && bn != "" {
					if n, err := strconv.Atoi(bn); err == nil {
						binary.BuildNumber = n
					}
				}
			}
		}
	}

	// Pass 2: info --json — collect extended metadata
	infoOut, err := ExecuteCommandWithTimeout(exePath, "info", "--json")
	if err == nil && infoOut != "" {
		jsonStart := strings.Index(infoOut, "{")
		if jsonStart >= 0 {
			var info struct {
				Version     string `json:"version"`
				BuildNumber string `json:"build_number"`
				BuildDate   string `json:"build_date"`
				FullVersion string `json:"full_version"`
				Channel     string `json:"channel"`
				Daemon      struct {
					Running bool `json:"running"`
				} `json:"daemon"`
				Startup struct {
					Registered bool `json:"registered"`
				} `json:"startup"`
				Runtime struct {
					Arch string `json:"arch"`
					Exe  string `json:"exe"`
					Go   string `json:"go"`
					OS   string `json:"os"`
				} `json:"runtime"`
				Pipe struct {
					Name string `json:"name"`
				} `json:"pipe"`
			}
			if json.Unmarshal([]byte(infoOut[jsonStart:]), &info) == nil {
				// Promote version/build from info if not already set
				if binary.Version == "unknown" && info.Version != "" {
					binary.Version = info.Version
					binary.Status = "healthy"
				}
				if binary.BuildNumber == 0 && info.BuildNumber != "" {
					if n, err := strconv.Atoi(info.BuildNumber); err == nil {
						binary.BuildNumber = n
					}
				}
				binary.LauncherInfo = &LauncherInfo{
					FullVersion: info.FullVersion,
					BuildDate:   info.BuildDate,
					Channel:     info.Channel,
					Daemon:      LauncherDaemon{Running: info.Daemon.Running},
					Startup:     LauncherStartup{Registered: info.Startup.Registered},
					Runtime: LauncherRuntime{
						Arch: info.Runtime.Arch,
						Exe:  info.Runtime.Exe,
						Go:   info.Runtime.Go,
						OS:   info.Runtime.OS,
					},
					Pipe: LauncherPipe{Name: info.Pipe.Name},
				}
			}
		}
	}

	return binary, nil
}

// InspectAllManagedBinaries inspects all managed binaries in parallel.
func InspectAllManagedBinaries(basePath string) ([]ManagedBinary, error) {
	definitions := getManagedBinaries()
	results := make([]ManagedBinary, len(definitions))

	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 4)

	for i, def := range definitions {
		wg.Add(1)
		go func(index int, definition managedBinaryDefinition) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			fullPath := buildPath(basePath, definition.path)
			binary, err := InspectManagedBinary(definition.name, fullPath, definition)
			if err != nil {
				results[index] = ManagedBinary{
					Name:                 definition.name,
					Path:                 fullPath,
					Status:               "missing",
					Version:              "unknown",
					UpdatableByMetamorph: true,
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
	exePath, err := filepath.Abs(filepath.Join(filepath.Dir("."), "metamorph.exe"))
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