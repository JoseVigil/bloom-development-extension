package core

import (
	"fmt"
	"os"
	"path/filepath"
)

// PathConfig contiene todas las rutas del sistema
type PathConfig struct {
	Root    string // C:\Users\josev\AppData\Local\BloomNucleus
	BinDir  string // C:\Users\josev\AppData\Local\BloomNucleus\bin
	Logs    string // C:\Users\josev\AppData\Local\BloomNucleus\logs
	Config  string // C:\Users\josev\AppData\Local\BloomNucleus\config
	Staging string // C:\Users\josev\AppData\Local\BloomNucleus\staging
}

// InitPaths inicializa y valida la estructura de directorios
func InitPaths() (*PathConfig, error) {
	// Obtener LocalAppData
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		return nil, fmt.Errorf("LOCALAPPDATA environment variable not set")
	}

	root := filepath.Join(localAppData, "BloomNucleus")

	paths := &PathConfig{
		Root:    root,
		BinDir:  filepath.Join(root, "bin"),
		Logs:    filepath.Join(root, "logs"),
		Config:  filepath.Join(root, "config"),
		Staging: filepath.Join(root, "staging"),
	}

	// Crear directorios si no existen
	dirs := []string{
		paths.Logs,
		paths.Config,
		paths.Staging,
		filepath.Join(paths.Staging, "downloads"),
		filepath.Join(paths.Staging, "snapshots"),
		filepath.Join(paths.Staging, "temp"),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	return paths, nil
}

// GetBinaryPath retorna la ruta completa de un binario
func (p *PathConfig) GetBinaryPath(name, binary string) string {
	return filepath.Join(p.BinDir, name, binary)
}

// GetStagingDownloadPath retorna la ruta de staging para un archivo
func (p *PathConfig) GetStagingDownloadPath(filename string) string {
	return filepath.Join(p.Staging, "downloads", filename)
}

// GetSnapshotDir retorna la ruta de un snapshot específico
func (p *PathConfig) GetSnapshotDir(snapshotID string) string {
	return filepath.Join(p.Staging, "snapshots", snapshotID)
}

// GetConfigPath retorna la ruta de un archivo de configuración
func (p *PathConfig) GetConfigPath(filename string) string {
	return filepath.Join(p.Config, filename)
}

// GetNucleusConfigPath retorna la ruta del nucleus.json
func (p *PathConfig) GetNucleusConfigPath() string {
	return p.GetConfigPath("nucleus.json")
}

// GetMetamorphConfigPath retorna la ruta del metamorph.json
func (p *PathConfig) GetMetamorphConfigPath() string {
	return p.GetConfigPath("metamorph.json")
}
