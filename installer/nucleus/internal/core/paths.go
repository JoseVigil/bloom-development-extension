package core

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type Paths struct {
	BinDir       string // bin\ raíz — chrome, host, extensions, nucleus
	SentinelDir  string // bin\sentinel\ — config y binario propio de sentinel
	AppDataDir   string
	ProfilesDir  string
	LogsDir      string
	TelemetryDir string
	NucleusBin   string // Ruta absoluta a nucleus.exe — escritor único de telemetry.json
}

func InitPaths() (*Paths, error) {
	exe, err := os.Executable()
	if err != nil {
		return nil, err
	}
	// sentinel.exe vive en bin\sentinel\ — separamos los dos conceptos:
	// SentinelDir = bin\sentinel\  (config propia, binario sentinel)
	// BinDir      = bin\           (chrome, host, extensions, nucleus)
	sentinelDir := filepath.Dir(exe)
	binDir := filepath.Dir(sentinelDir)

	// Resolve appDataDir cross-platform: BLOOM_APPDATA_DIR overrides everything.
	// On Windows use LOCALAPPDATA; on macOS use ~/Library/BloomNucleus; on Linux ~/.bloom-nucleus.
	appDataDir := os.Getenv("BLOOM_APPDATA_DIR")
	if appDataDir == "" {
		home, _ := os.UserHomeDir()
		if runtime.GOOS == "windows" {
			localAppData := os.Getenv("LOCALAPPDATA")
			if localAppData == "" {
				localAppData = filepath.Join(home, "AppData", "Local")
			}
			appDataDir = filepath.Join(localAppData, "BloomNucleus")
		} else {
			// macOS: ~/Library/BloomNucleus
			// Linux: ~/.bloom-nucleus (fallback)
			macOSPath := filepath.Join(home, "Library", "BloomNucleus")
			if _, err := os.Stat(filepath.Join(home, "Library")); err == nil {
				appDataDir = macOSPath
			} else {
				appDataDir = filepath.Join(home, ".bloom-nucleus")
			}
		}
	}

	// Resolve nucleus binary: try without extension first (macOS/Linux), then .exe (Windows).
	nucleusBin := filepath.Join(binDir, "nucleus", "nucleus")
	if _, err := os.Stat(nucleusBin); err != nil {
		nucleusBin = filepath.Join(binDir, "nucleus", "nucleus.exe")
	}

	paths := &Paths{
		BinDir:       binDir,
		SentinelDir:  sentinelDir,
		AppDataDir:   appDataDir,
		ProfilesDir:  filepath.Join(appDataDir, "profiles"),
		LogsDir:      filepath.Join(appDataDir, "logs"),
		TelemetryDir: filepath.Join(appDataDir, "logs"),
		NucleusBin:   nucleusBin,
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
	sb.WriteString("  SentinelDir: " + p.SentinelDir + "\n")
	sb.WriteString("  AppDataDir:  " + p.AppDataDir + "\n")
	sb.WriteString("  ProfilesDir: " + p.ProfilesDir + "\n")
	sb.WriteString("  LogsDir:     " + p.LogsDir + "\n")
	sb.WriteString("  NucleusBin:  " + p.NucleusBin + "\n")
	return sb.String()
}