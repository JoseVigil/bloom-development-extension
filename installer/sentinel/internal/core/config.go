package core

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

type Profile struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Enabled  bool   `json:"enabled"`
	Priority int    `json:"priority"`
}

type Settings struct {
	AutoStart      bool   `json:"autoStart"`
	MinimizeToTray bool   `json:"minimizeToTray"`
	CheckInterval  int    `json:"checkInterval"`
	MaxRestarts    int    `json:"maxRestarts"`
	RestartDelay   int    `json:"restartDelay"`
	ExtensionPath  string `json:"extensionPath"`
	TestWorkspace  string `json:"testWorkspace"`
	BrowserEngine  string `json:"BrowserEngine"`
}

type Monitoring struct {
	Enabled     bool   `json:"enabled"`
	LogLevel    string `json:"logLevel"`
	MaxLogSize  int    `json:"maxLogSize"`
	MaxLogFiles int    `json:"maxLogFiles"`
}

type Provisioning struct {
	GoldenKey   string `json:"golden_key"`
	ExtensionID string `json:"extension_id,omitempty"`
}

type Config struct {
	Version      string       `json:"version"`
	Profiles     []Profile    `json:"profiles"`
	Settings     Settings     `json:"settings"`
	Monitoring   Monitoring   `json:"monitoring"`
	Provisioning Provisioning `json:"provisioning"`
}

// GetConfigDir devuelve el directorio canónico de configuración de Sentinel
// según la plataforma en uso:
//
//	Darwin:  ~/Library/BloomNucleus/config/sentinel
//	Windows: %LOCALAPPDATA%\BloomNucleus\config\sentinel
//	Linux:   $XDG_DATA_HOME/BloomNucleus/config/sentinel
//	         (fallback si XDG_DATA_HOME vacío: ~/.local/share/BloomNucleus/config/sentinel)
func GetConfigDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("no se pudo obtener el directorio home del usuario: %w", err)
	}

	var base string
	switch runtime.GOOS {
	case "darwin":
		base = filepath.Join(home, "Library", "BloomNucleus")
	case "windows":
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData == "" {
			localAppData = filepath.Join(home, "AppData", "Local")
		}
		base = filepath.Join(localAppData, "BloomNucleus")
	default: // linux y otros
		xdgDataHome := os.Getenv("XDG_DATA_HOME")
		if xdgDataHome == "" {
			xdgDataHome = filepath.Join(home, ".local", "share")
		}
		base = filepath.Join(xdgDataHome, "BloomNucleus")
	}

	return filepath.Join(base, "config", "sentinel"), nil
}

// LoadConfig busca y carga sentinel-config.json con la siguiente prioridad:
//  1. Ubicación canónica según plataforma (ver GetConfigDir).
//  2. Fallback al directorio del binario (binDir) para compatibilidad con
//     instalaciones legacy, en particular durante la migración en Windows.
//
// Si ninguna de las dos rutas contiene el archivo, retorna un error
// indicando ambas rutas intentadas.
func LoadConfig(binDir string) (*Config, error) {
	canonicalDir, err := GetConfigDir()
	if err != nil {
		return nil, fmt.Errorf("error al determinar directorio canónico de config: %w", err)
	}

	canonicalPath := filepath.Join(canonicalDir, "sentinel-config.json")
	legacyPath := filepath.Join(binDir, "sentinel-config.json")

	for _, path := range []string{canonicalPath, legacyPath} {
		data, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, fmt.Errorf("error al leer sentinel-config.json en %q: %w", path, err)
		}

		var config Config
		if err := json.Unmarshal(data, &config); err != nil {
			return nil, fmt.Errorf("error al parsear sentinel-config.json en %q: %w", path, err)
		}
		return &config, nil
	}

	return nil, fmt.Errorf(
		"no se encontró sentinel-config.json en ninguna de las rutas intentadas:\n  canónica: %s\n  legacy:   %s",
		canonicalPath, legacyPath,
	)
}
