package inspection

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// InspectIonRecipe inspects a single ion recipe given its site directory.
// Returns nil, nil for special directories (_meta, etc.).
// Never returns a fatal error — returns status "missing" or "corrupted" as appropriate.
func InspectIonRecipe(siteDir string) (*IonRecipeInfo, error) {
	site := filepath.Base(siteDir)

	// Ignore _meta/ and other directories with _ prefix
	if strings.HasPrefix(site, "_") {
		return nil, nil
	}

	info := &IonRecipeInfo{
		Site:   site,
		Status: "missing",
	}

	// Read ion.manifest.json
	manifestPath := filepath.Join(siteDir, "ion.manifest.json")
	manifestData, err := os.ReadFile(manifestPath)
	if err != nil {
		if os.IsNotExist(err) {
			return info, nil // status: missing — directory exists but has no manifest
		}
		info.Status = "corrupted"
		return info, nil
	}

	// Parse manifest — only the fields needed for inspection
	var manifest struct {
		Site         string   `json:"site"`
		Version      string   `json:"version"`
		Description  string   `json:"description"`
		Entrypoint   string   `json:"entrypoint"`
		Flows        []string `json:"flows"`
		Capabilities []string `json:"capabilities"`
	}
	if err := json.Unmarshal(manifestData, &manifest); err != nil {
		info.Status = "corrupted"
		return info, nil
	}

	info.Version      = manifest.Version
	info.Description  = manifest.Description
	info.Entrypoint   = manifest.Entrypoint
	info.FlowCount    = len(manifest.Flows)
	info.Capabilities = manifest.Capabilities

	// Hash the manifest for change detection
	info.ManifestHash, _ = CalculateSHA256(manifestPath)

	// Verify that the declared entrypoint exists on disk
	entrypointPath := filepath.Join(siteDir, manifest.Entrypoint)
	if _, err := os.Stat(entrypointPath); os.IsNotExist(err) {
		info.Status = "corrupted" // manifest declares auth.ion but file does not exist
		return info, nil
	}

	// Total size of the site directory
	info.SizeBytes = calculateDirSize(siteDir)

	// Last-modified timestamp of the manifest
	if stat, err := os.Stat(manifestPath); err == nil {
		info.LastModified = stat.ModTime().UTC().Format(time.RFC3339)
	}

	info.Status = "healthy"
	return info, nil
}

// InspectAllIonRecipes inspects all ion recipes under ionsites/.
// Returns an empty result (no error) if ionsites/ exists but is empty.
// Returns an informative error if ionsites/ does not exist.
func InspectAllIonRecipes(ionsitesPath string) (*IonRecipesResult, error) {
	result := &IonRecipesResult{
		BasePath:  ionsitesPath,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Recipes:   []IonRecipeInfo{}, // never nil in JSON
	}

	if _, err := os.Stat(ionsitesPath); os.IsNotExist(err) {
		return result, fmt.Errorf("ionsites directory not found: %s", ionsitesPath)
	}

	entries, err := os.ReadDir(ionsitesPath)
	if err != nil {
		return result, fmt.Errorf("reading ionsites directory: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		siteDir := filepath.Join(ionsitesPath, entry.Name())
		info, err := InspectIonRecipe(siteDir)
		if err != nil {
			// Same pattern as managed/external binaries — log and continue
			fmt.Fprintf(os.Stderr, "warning: inspecting %s: %v\n", entry.Name(), err)
			continue
		}
		if info == nil {
			continue // special directory (_meta, etc.)
		}

		result.Recipes = append(result.Recipes, *info)
		result.TotalSites++
		result.TotalFlows += info.FlowCount
	}

	return result, nil
}

// calculateDirSize returns the total size in bytes of all files under path.
// Local helper — not exported.
func calculateDirSize(path string) int64 {
	var size int64
	filepath.Walk(path, func(_ string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		size += info.Size()
		return nil
	})
	return size
}
