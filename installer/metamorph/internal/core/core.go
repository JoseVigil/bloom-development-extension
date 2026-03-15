package core

import (
	"encoding/json"
	"fmt"
	"os"
)

// Core es la estructura central de la aplicación
type Core struct {
	Config   *Config
	Logger   *Logger
	Paths    *PathConfig
	jsonMode bool // guardado para InitLoggerForCategory
}

// Config estructura de configuración
type Config struct {
	OutputJSON bool
	Verbose    bool
}

// NewCore crea una nueva instancia de Core.
// El logger NO se inicializa aquí — se inicializa en PersistentPreRun
// una vez que Cobra sabe qué comando se va a ejecutar, para que cada
// categoría de comando escriba en su propio archivo de log.
func NewCore(jsonMode bool) (*Core, error) {
	paths, err := InitPaths()
	if err != nil {
		return nil, fmt.Errorf("failed to initialize paths: %w", err)
	}

	return &Core{
		Config: &Config{
			OutputJSON: jsonMode,
			Verbose:    false,
		},
		Logger:   &Logger{}, // logger vacío hasta InitLoggerForCategory
		Paths:    paths,
		jsonMode: jsonMode,
	}, nil
}

// InitLoggerForCategory inicializa el logger con la categoría correspondiente
// al comando que se va a ejecutar. Debe llamarse desde PersistentPreRun en root.go.
// Si el logger ya fue inicializado, no hace nada (idempotente).
func (c *Core) InitLoggerForCategory(category string) error {
	if c.Logger != nil && c.Logger.file != nil {
		return nil // ya inicializado
	}

	logger, err := InitLogger(c.Paths, category, c.jsonMode)
	if err != nil {
		return fmt.Errorf("failed to initialize logger for category %s: %w", category, err)
	}

	c.Logger = logger
	return nil
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