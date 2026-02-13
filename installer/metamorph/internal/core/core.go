package core

import (
	"encoding/json"
	"fmt"
	"io"
)

// Core es la estructura central de la aplicación
type Core struct {
	Config *Config
	Logger *Logger
	Paths  *PathConfig
	output io.Writer
}

// Config estructura de configuración
type Config struct {
	OutputJSON bool
	Verbose    bool
}

// NewCore crea una nueva instancia de Core
func NewCore(output io.Writer) (*Core, error) {
	paths, err := InitPaths()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize paths: %w", err)
	}

	logger := NewLogger(output)

	return &Core{
		Config: &Config{
			OutputJSON: false,
			Verbose:    false,
		},
		Logger: logger,
		Paths:  paths,
		output: output,
	}, nil
}

// NewCoreSilent crea Core sin output (para help)
func NewCoreSilent() (*Core, error) {
	return NewCore(io.Discard)
}

// Close cierra recursos
func (c *Core) Close() {
	// Cleanup si es necesario
}

// OutputJSON imprime JSON al output
func (c *Core) OutputJSON(data interface{}) {
	bytes, _ := json.MarshalIndent(data, "", "  ")
	fmt.Fprintln(c.output, string(bytes))
}

// SetJSONMode activa modo JSON
func (c *Core) SetJSONMode(enabled bool) {
	c.Config.OutputJSON = enabled
}