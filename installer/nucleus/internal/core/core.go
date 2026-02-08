package core

import (
	"fmt"
	"io"
	"log"
)

// Core estructura central de Nucleus
type Core struct {
	Logger *log.Logger
	Config map[string]interface{}
	Paths  PathConfig
	IsJSON bool
}

// NewCore inicializa la estructura Core
func NewCore(output io.Writer) (*Core, error) {
	paths, err := InitPaths()
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
	paths, err := InitPaths()
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

// Close cierra recursos del Core
func (c *Core) Close() error {
	return nil
}