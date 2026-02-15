package inspection

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"sync"
)

// managedBinaryDefinition defines a managed binary
type managedBinaryDefinition struct {
	name string
	path string
}

// getManagedBinaries returns the list of managed binaries
func getManagedBinaries() []managedBinaryDefinition {
	return []managedBinaryDefinition{
		{"Brain", "brain/brain.exe"},
		{"Nucleus", "nucleus/nucleus.exe"},
		{"Sentinel", "sentinel/sentinel.exe"},
		{"Host", "native/bloom-host.exe"},
		{"Conductor", "conductor/bloom-conductor.exe"},
		{"Cortex", "cortex/bloom-cortex.blx"},
		{"Metamorph", "metamorph/metamorph.exe"},
	}
}

// InspectManagedBinary inspects a single managed binary
func InspectManagedBinary(name, path string) (*ManagedBinary, error) {
	binary := &ManagedBinary{
		Name:                 name,
		Path:                 path,
		UpdatableByMetamorph: true,
		Status:               "unknown",
		Version:              "unknown",
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

	// Try to get binary info via --info --json
	infoOutput, err := ExecuteCommandWithTimeout(path, "--info", "--json")
	if err == nil {
		// Parse JSON response
		var info binaryInfoResponse
		if json.Unmarshal([]byte(infoOutput), &info) == nil {
			binary.Version = info.Version
			binary.BuildNumber = info.BuildNumber
			binary.Capabilities = info.Capabilities
			binary.Status = "healthy"
			return binary, nil
		}
	}

	// Fallback: Try --version
	versionOutput, err := ExecuteCommandWithTimeout(path, "--version")
	if err == nil {
		version := ParseVersionFromOutput(versionOutput)
		if version != "unknown" {
			binary.Version = version
			binary.Status = "healthy"
			return binary, nil
		}
	}

	// Could not determine version but file exists
	binary.Status = "unknown"
	return binary, nil
}

// InspectAllManagedBinaries inspects all managed binaries in parallel
func InspectAllManagedBinaries(basePath string) ([]ManagedBinary, error) {
	definitions := getManagedBinaries()
	results := make([]ManagedBinary, len(definitions))
	
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 4) // Max 4 concurrent inspections

	for i, def := range definitions {
		wg.Add(1)
		go func(index int, definition managedBinaryDefinition) {
			defer wg.Done()
			semaphore <- struct{}{} // Acquire
			defer func() { <-semaphore }() // Release

			fullPath := buildPath(basePath, definition.path)
			binary, err := InspectManagedBinary(definition.name, fullPath)
			if err != nil {
				// On error, create a minimal entry
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

// InspectSelfBinary inspects the currently running metamorph binary
func InspectSelfBinary() (*ManagedBinary, error) {
	// Get the path of the currently running executable
	exePath, err := filepath.Abs(filepath.Join(filepath.Dir("."), "metamorph.exe"))
	if err != nil {
		return nil, fmt.Errorf("failed to determine executable path: %w", err)
	}

	return InspectManagedBinary("Metamorph", exePath)
}