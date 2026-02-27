package inspection

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// externalBinaryDefinition defines an external binary
type externalBinaryDefinition struct {
	name         string
	path         string
	source       string
	updateMethod string
}

// getExternalBinaries returns the list of external binaries
func getExternalBinaries() []externalBinaryDefinition {
	return []externalBinaryDefinition{
		{"Temporal", "temporal/temporal.exe", "temporal.io", "nucleus_download"},
		{"Ollama", "ollama/ollama.exe", "ollama.ai", "external_installer"},
		{"Chromium", "chrome-win/chrome.exe", "chromium.org", "nucleus_download"},
		{"Node", "node/node.exe", "nodejs.org", "nucleus_download"},
	}
}

// InspectExternalBinary inspects a single external binary
func InspectExternalBinary(name, path, source, updateMethod string) (*ExternalBinary, error) {
	binary := &ExternalBinary{
		Name:                 name,
		Path:                 path,
		UpdatableByMetamorph: false,
		Source:               source,
		UpdateMethod:         updateMethod,
		Status:               "unknown",
		Version:              "unknown",
		UpdateAvailable:      false,
	}

	// Check if file exists
	if !FileExists(path) {
		binary.Status = "missing"
		return binary, nil
	}

	// Get file info
	size, modTime, err := GetFileInfo(path)
	if err == nil {
		binary.SizeBytes = size
		binary.LastModified = modTime.UTC().Format("2006-01-02T15:04:05Z")
	}

	// Calculate SHA-256 hash
	hash, err := CalculateSHA256(path)
	if err != nil {
		binary.Hash = "error_calculating_hash"
	} else {
		binary.Hash = hash
	}

	// Version detection is binary-specific.
	// Chromium MUST NOT be launched via --version because doing so opens the
	// full browser process (and the user profile window) before printing the
	// version string.  We read the version from the "Last Version" file that
	// Chrome/Chromium maintains on disk instead.
	// All other external binaries use the standard --version flag.
	switch name {
	case "Chromium":
		version := readChromiumVersionFromDisk(path)
		if version != "unknown" {
			binary.Version = version
			binary.Status = "healthy"
		}
	default:
		versionOutput, err := ExecuteCommandWithTimeout(path, "--version")
		if err == nil {
			version := ParseVersionFromOutput(versionOutput)
			if version != "unknown" {
				binary.Version = version
				binary.Status = "healthy"
			}
		}
		// If --version fails the binary may still be functional; Status stays "unknown".
	}

	// Latest version detection is not implemented yet (future enhancement)
	binary.LatestVersion = ""
	binary.UpdateAvailable = false

	return binary, nil
}

// readChromiumVersionFromDisk reads the Chromium version without launching the
// browser.  Chrome/Chromium writes the current version to a plain-text file
// called "Last Version" inside its User Data directory every time it updates.
// We prefer this file over running chrome.exe --version because launching the
// executable — even with --version — opens the full browser process and loads
// the user profile, which is unacceptable for a background inspection tool.
//
// Lookup order:
//  1. <chrome.exe dir>\User Data\Last Version   (portable / Nucleus-managed layout)
//  2. LOCALAPPDATA\Chromium\User Data\Last Version  (standard user install)
//  3. LOCALAPPDATA\Google\Chrome\User Data\Last Version (Google Chrome fallback)
func readChromiumVersionFromDisk(chromePath string) string {
	candidates := []string{
		// Portable layout: User Data sits next to chrome.exe
		filepath.Join(filepath.Dir(chromePath), "User Data", "Last Version"),
	}

	// Standard installation paths (Windows)
	if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
		candidates = append(candidates,
			filepath.Join(localAppData, "Chromium", "User Data", "Last Version"),
			filepath.Join(localAppData, "Google", "Chrome", "User Data", "Last Version"),
		)
	}

	for _, candidate := range candidates {
		data, err := os.ReadFile(candidate)
		if err != nil {
			continue
		}
		version := strings.TrimSpace(string(data))
		if version != "" {
			return version
		}
	}
	return "unknown"
}

// InspectAllExternalBinaries inspects all external binaries in parallel
func InspectAllExternalBinaries(basePath string) ([]ExternalBinary, error) {
	definitions := getExternalBinaries()
	results := make([]ExternalBinary, len(definitions))
	
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 4) // Max 4 concurrent inspections

	for i, def := range definitions {
		wg.Add(1)
		go func(index int, definition externalBinaryDefinition) {
			defer wg.Done()
			semaphore <- struct{}{} // Acquire
			defer func() { <-semaphore }() // Release

			fullPath := buildPath(basePath, definition.path)
			binary, err := InspectExternalBinary(
				definition.name,
				fullPath,
				definition.source,
				definition.updateMethod,
			)
			if err != nil {
				// On error, create a minimal entry
				results[index] = ExternalBinary{
					Name:                 definition.name,
					Path:                 fullPath,
					Status:               "missing",
					Version:              "unknown",
					UpdatableByMetamorph: false,
					Source:               definition.source,
					UpdateMethod:         definition.updateMethod,
				}
			} else {
				results[index] = *binary
			}
		}(i, def)
	}

	wg.Wait()
	return results, nil
}