package core

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// PathConfig gestiona las rutas del sistema
type PathConfig struct {
	Root   string
	Logs   string
	Config string
	Bin    string
}

// InitPaths inicializa las rutas del sistema usando AppData en Windows
func InitPaths() (PathConfig, error) {
	var nucleusRoot string

	switch runtime.GOOS {
	case "windows":
		// PRIORITY 1: Check if BLOOM_ROOT is explicitly set (service mode)
		if bloomRoot := os.Getenv("BLOOM_ROOT"); bloomRoot != "" {
			nucleusRoot = bloomRoot
		} else {
			// PRIORITY 2: Use LOCALAPPDATA
			localAppData := os.Getenv("LOCALAPPDATA")
			if localAppData == "" {
				// Fallback si LOCALAPPDATA no está definido
				homeDir, err := os.UserHomeDir()
				if err != nil {
					return PathConfig{}, fmt.Errorf("no se pudo obtener directorio home: %w", err)
				}
				localAppData = filepath.Join(homeDir, "AppData", "Local")
			}
			nucleusRoot = filepath.Join(localAppData, "BloomNucleus")
		}

	case "darwin":
		// En macOS usar: ~/Library/Application Support/BloomNucleus
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return PathConfig{}, fmt.Errorf("no se pudo obtener directorio home: %w", err)
		}
		nucleusRoot = filepath.Join(homeDir, "Library", "Application Support", "BloomNucleus")

	default:
		// En Linux usar: ~/.local/share/BloomNucleus
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return PathConfig{}, fmt.Errorf("no se pudo obtener directorio home: %w", err)
		}
		nucleusRoot = filepath.Join(homeDir, ".local", "share", "BloomNucleus")
	}

	// Allow override of bin directory via BLOOM_BIN_DIR
	binDir := filepath.Join(nucleusRoot, "bin")
	if bloomBinDir := os.Getenv("BLOOM_BIN_DIR"); bloomBinDir != "" {
		binDir = bloomBinDir
	}

	// Allow override of logs directory via BLOOM_LOGS_DIR
	logsDir := filepath.Join(nucleusRoot, "logs")
	if bloomLogsDir := os.Getenv("BLOOM_LOGS_DIR"); bloomLogsDir != "" {
		logsDir = bloomLogsDir
	}

	paths := PathConfig{
		Root:   nucleusRoot,
		Logs:   logsDir,
		Config: filepath.Join(nucleusRoot, "config"),
		Bin:    binDir,
	}

	// Log resolved paths for debugging
	// fmt.Printf("[nucleus] Resolved paths:\n")
	// fmt.Printf("[nucleus]   Root: %s\n", paths.Root)
	// fmt.Printf("[nucleus]   Bin: %s\n", paths.Bin)
	// fmt.Printf("[nucleus]   Logs: %s\n", paths.Logs)
	// fmt.Printf("[nucleus]   Config: %s\n", paths.Config)
	
	// Crear directorios si no existen
	dirs := []string{
		paths.Root,
		paths.Logs,
		filepath.Join(paths.Logs, "nucleus"), // Subdirectorio para logs de nucleus
		paths.Config,
		paths.Bin,
	}
	
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return PathConfig{}, fmt.Errorf("error creando directorio %s: %w", dir, err)
		}
	}

	return paths, nil
}