package inspection

import (
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

	// Try to get version via --version
	versionOutput, err := ExecuteCommandWithTimeout(path, "--version")
	if err == nil {
		version := ParseVersionFromOutput(versionOutput)
		if version != "unknown" {
			binary.Version = version
			binary.Status = "healthy"
		}
	} else {
		// Some binaries might not support --version, but if they exist they might still be functional
		if FileExists(path) {
			binary.Status = "unknown"
		}
	}

	// Latest version detection is not implemented yet (future enhancement)
	binary.LatestVersion = ""
	binary.UpdateAvailable = false

	return binary, nil
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