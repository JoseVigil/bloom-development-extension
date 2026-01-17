package discovery

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type SystemMap struct {
	BrainPath      string `json:"brain_path"`
	ChromePath     string `json:"chrome_path"`
	VSCodePlugin   string `json:"vscode_plugin"`
	PluginVersion  string `json:"plugin_version"`
}

type VSCodePackage struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

func DiscoverSystem(binDir string) (*SystemMap, error) {
	sm := &SystemMap{}
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local")
	}

	// 1. Rutas precisas requeridas
	sm.BrainPath = filepath.Join(localAppData, "BloomNucleus", "bin", "brain", "brain.exe")
	sm.ChromePath = filepath.Join(localAppData, "BloomNucleus", "bin", "chrome-win", "chrome.exe")

	// Validación de existencia
	if _, err := os.Stat(sm.BrainPath); err != nil {
		return nil, fmt.Errorf("brain.exe no encontrado en: %s", sm.BrainPath)
	}

	// 2. Scanner de VSCode
	pluginPath, version, _ := scanVSCode(os.Getenv("USERPROFILE"))
	sm.VSCodePlugin = pluginPath
	sm.PluginVersion = version

	return sm, nil
}

func scanVSCode(userProfile string) (string, string, error) {
	extDir := filepath.Join(userProfile, ".vscode", "extensions")
	entries, err := os.ReadDir(extDir)
	if err != nil {
		return "", "", err
	}

	for _, entry := range entries {
		if entry.IsDir() && strings.Contains(strings.ToLower(entry.Name()), "josevigil.bloom-nucleus-installer") {
			path := filepath.Join(extDir, entry.Name())
			pkgData, err := os.ReadFile(filepath.Join(path, "package.json"))
			if err != nil {
				continue
			}
			var pkg VSCodePackage
			json.Unmarshal(pkgData, &pkg)
			if strings.Contains(strings.ToLower(pkg.Name), "bloom-nucleus") {
				return path, pkg.Version, nil
			}
		}
	}
	return "", "", fmt.Errorf("plugin no encontrado")
}