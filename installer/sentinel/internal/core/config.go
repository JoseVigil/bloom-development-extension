package core

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type Profile struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Enabled  bool   `json:"enabled"`
	Priority int    `json:"priority"`
}

type Settings struct {
	AutoStart       bool   `json:"autoStart"`
	MinimizeToTray  bool   `json:"minimizeToTray"`
	CheckInterval   int    `json:"checkInterval"`
	MaxRestarts     int    `json:"maxRestarts"`
	RestartDelay    int    `json:"restartDelay"`
	ExtensionPath   string `json:"extensionPath"`
	TestWorkspace   string `json:"testWorkspace"` 
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
	Version    string     `json:"version"`
	Profiles   []Profile  `json:"profiles"`
	Settings   Settings   `json:"settings"`
	Monitoring Monitoring `json:"monitoring"`
	Provisioning Provisioning `json:"provisioning"`
}

func LoadConfig(binDir string) (*Config, error) {
	blueprintPath := filepath.Join(binDir, "blueprint.json")
	data, err := os.ReadFile(blueprintPath)
	if err != nil {
		return nil, fmt.Errorf("error al leer blueprint.json: %w", err)
	}
	var config Config
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("error al parsear blueprint.json: %w", err)
	}
	return &config, nil
}