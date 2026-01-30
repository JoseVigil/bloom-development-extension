package core

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
)

// Core estructura central de Nucleus
type Core struct {
	Logger *log.Logger
	Config map[string]interface{}
	Paths  PathConfig
	IsJSON bool
}

// PathConfig gestiona las rutas del sistema
type PathConfig struct {
	Root   string
	Logs   string
	Config string
	Bin    string
}

// NewCore inicializa la estructura Core
func NewCore(output io.Writer) (*Core, error) {
	paths, err := initPaths()
	if err != nil {
		return nil, fmt.Errorf("error al inicializar rutas: %w", err)
	}

	logger := log.New(output, "[nucleus] ", log.LstdFlags)

	return &Core{
		Logger: logger,
		Config: make(map[string]interface{}),
		Paths:  paths,
		IsJSON: false,
	}, nil
}

// NewCoreSilent inicializa Core en modo silencioso (para --help)
func NewCoreSilent() (*Core, error) {
	paths, err := initPaths()
	if err != nil {
		return nil, fmt.Errorf("error al inicializar rutas: %w", err)
	}

	// Logger que descarta output
	logger := log.New(io.Discard, "[nucleus] ", log.LstdFlags)

	return &Core{
		Logger: logger,
		Config: make(map[string]interface{}),
		Paths:  paths,
		IsJSON: false,
	}, nil
}

// SetJSONMode configura el modo de salida JSON
func (c *Core) SetJSONMode(enabled bool) {
	c.IsJSON = enabled
}

// initPaths inicializa las rutas del sistema
func initPaths() (PathConfig, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return PathConfig{}, err
	}

	bloomRoot := filepath.Join(homeDir, ".bloom")
	nucleusRoot := filepath.Join(bloomRoot, ".nucleus")

	paths := PathConfig{
		Root:   nucleusRoot,
		Logs:   filepath.Join(nucleusRoot, "logs"),
		Config: filepath.Join(nucleusRoot, "config"),
		Bin:    filepath.Join(nucleusRoot, "bin"),
	}

	// Crear directorios si no existen
	dirs := []string{paths.Root, paths.Logs, paths.Config, paths.Bin}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return PathConfig{}, err
		}
	}

	return paths, nil
}

// Close cierra recursos del Core
func (c *Core) Close() error {
	return nil
}
