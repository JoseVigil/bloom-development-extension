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
		// En Windows usar: C:\Users\<user>\AppData\Local\BloomNucleus
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

	paths := PathConfig{
		Root:   nucleusRoot,
		Logs:   filepath.Join(nucleusRoot, "logs"),
		Config: filepath.Join(nucleusRoot, "config"),
		Bin:    filepath.Join(nucleusRoot, "bin"),
	}

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