package discovery

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

type SystemMap struct {
	BrainPath     string `json:"brain_path"`
	ChromePath    string `json:"chrome_path"`
	VSCodePlugin  string `json:"vscode_plugin"`
	PluginVersion string `json:"plugin_version"`
}

func DiscoverSystem(binDir string) (*SystemMap, error) {
	sm := &SystemMap{}
	localAppData := os.Getenv("LOCALAPPDATA")
	
	// 1. Rutas de Binarios (Prioridad AppData/Local)
	sm.BrainPath = filepath.Join(localAppData, "BloomNucleus", "bin", "brain", "brain.exe")
	sm.ChromePath = filepath.Join(localAppData, "BloomNucleus", "bin", "chrome-win", "chrome.exe")

	// 2. Scanner Proactivo de VSCode
	userProfile := os.Getenv("USERPROFILE")
	extensionsDir := filepath.Join(userProfile, ".vscode", "extensions")
	
	if entries, err := os.ReadDir(extensionsDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() && strings.Contains(strings.ToLower(entry.Name()), "josevigil.bloom-nucleus-installer") {
				sm.VSCodePlugin = filepath.Join(extensionsDir, entry.Name())
				// Leer versión del package.json
				if data, err := os.ReadFile(filepath.Join(sm.VSCodePlugin, "package.json")); err == nil {
					var pkg struct{ Version string }
					json.Unmarshal(data, &pkg)
					sm.PluginVersion = pkg.Version
				}
				break
			}
		}
	}

	return sm, nil
}