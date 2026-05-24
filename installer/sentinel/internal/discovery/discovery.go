package discovery

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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

	// 1. Rutas de Binarios — cross-platform usando binDir canónico
	sm.BrainPath = filepath.Join(binDir, "brain", brainExeName())
	sm.ChromePath = chromiumPath(binDir)

	// 2. Scanner Proactivo de VSCode
	home, _ := os.UserHomeDir()
	extensionsDir := filepath.Join(home, ".vscode", "extensions")

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

// FindVSCodeBinary busca el ejecutable de VS Code (code o code.cmd)
// Devuelve la ruta completa o error si no lo encuentra
func FindVSCodeBinary() (string, error) {
	var paths []string

	if runtime.GOOS == "windows" {
		localApp := os.Getenv("LOCALAPPDATA")
		paths = []string{
			filepath.Join(localApp, "Programs", "Microsoft VS Code", "bin", "code.cmd"),
			filepath.Join(os.Getenv("ProgramFiles"), "Microsoft VS Code", "bin", "code.cmd"),
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft VS Code", "bin", "code.cmd"),
		}
	} else if runtime.GOOS == "darwin" {
		paths = []string{
			"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
			"/usr/local/bin/code",
			"/usr/bin/code",
		}
	} else { // linux y otros unix-like
		paths = []string{
			"/usr/local/bin/code",
			"/usr/bin/code",
			filepath.Join(os.Getenv("HOME"), ".local/bin/code"),
		}
	}

	// Último intento: buscar en el PATH
	if pathFromEnv, err := exec.LookPath("code"); err == nil {
		return pathFromEnv, nil
	}

	for _, p := range paths {
		if info, err := os.Stat(p); err == nil && !info.IsDir() {
			return p, nil
		}
	}

	return "", fmt.Errorf("VS Code (code o code.cmd) no encontrado.\n" +
		"Asegúrate de tener VS Code instalado y accesible desde el PATH")
}
// brainExeName devuelve el nombre del ejecutable de Brain según la plataforma.
func brainExeName() string {
	if runtime.GOOS == "windows" {
		return "brain.exe"
	}
	return "brain"
}

// chromiumPath devuelve el path al ejecutable de Chromium según la plataforma.
// En Windows: bin/chrome-win/chrome.exe
// En macOS:   bin/chrome-mac/Chromium.app/Contents/MacOS/Chromium
// En Linux:   bin/chrome-linux/chrome
func chromiumPath(binDir string) string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(binDir, "chrome-win", "chrome.exe")
	case "darwin":
		return filepath.Join(binDir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium")
	default:
		return filepath.Join(binDir, "chrome-linux", "chrome")
	}
}
