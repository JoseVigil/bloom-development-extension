package core

import (
	"os"
	"path/filepath"
	"strings"
)

type Paths struct {
	BinDir      string
	AppDataDir  string
	ProfilesDir string
	LogsDir     string
}

func InitPaths() (*Paths, error) {
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	binDir := filepath.Dir(exe)

	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local")
	}
	appDataDir := filepath.Join(localAppData, "BloomNucleus")

	paths := &Paths{
		BinDir:      binDir,
		AppDataDir:  appDataDir,
		ProfilesDir: filepath.Join(appDataDir, "profiles"),
		LogsDir:     filepath.Join(appDataDir, "logs"),
	}

	dirs := []string{paths.AppDataDir, paths.ProfilesDir, paths.LogsDir}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, err
		}
	}

	return paths, nil
}

func (p *Paths) String() string {
	var sb strings.Builder
	sb.WriteString("Rutas del Sistema:\n")
	sb.WriteString("  BinDir:      " + p.BinDir + "\n")
	sb.WriteString("  AppDataDir:  " + p.AppDataDir + "\n")
	sb.WriteString("  ProfilesDir: " + p.ProfilesDir + "\n")
	sb.WriteString("  LogsDir:     " + p.LogsDir + "\n")
	return sb.String()
}