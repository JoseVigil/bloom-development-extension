package core

import (
	"encoding/json"
	"fmt"
	"os"
)

// Core es la estructura central de la aplicación
type Core struct {
	Config *Config
	Logger *Logger
	Paths  *PathConfig
}

// Config estructura de configuración
type Config struct {
	OutputJSON bool
	Verbose    bool
}

// NewCore crea una nueva instancia de Core.
// jsonMode debe detectarse en main.go antes de llamar esta función,
// igual que en sentinel, para que el logger arranque en el modo correcto.
func NewCore(jsonMode bool) (*Core, error) {
	paths, err := InitPaths()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize paths: %w", err)
	}

	logger, err := InitLogger(paths, "CORE", jsonMode)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize logger: %w", err)
	}

	return &Core{
		Config: &Config{
			OutputJSON: jsonMode,
			Verbose:    false,
		},
		Logger: logger,
		Paths:  paths,
	}, nil
}

// NewCoreSilent crea Core sin logger (para --help)
func NewCoreSilent() (*Core, error) {
	paths, err := InitPaths()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize paths: %w", err)
	}
	return &Core{
		Config: &Config{},
		Logger: &Logger{},
		Paths:  paths,
	}, nil
}

// Close cierra recursos
func (c *Core) Close() {
	if c.Logger != nil {
		c.Logger.Close()
	}
}

// OutputJSON imprime JSON al output
func (c *Core) OutputJSON(data interface{}) {
	bytes, _ := json.MarshalIndent(data, "", "  ")
	fmt.Fprintln(os.Stdout, string(bytes))
}

// SetJSONMode activa modo JSON
func (c *Core) SetJSONMode(enabled bool) {
	c.Config.OutputJSON = enabled
}