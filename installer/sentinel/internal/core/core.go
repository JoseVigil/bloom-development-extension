package core

import (
	"fmt"
	"github.com/spf13/cobra"
)

// CommandFactory define la firma de la función constructora
type CommandFactory func(c *Core) *cobra.Command

// RegisteredCommand vincula un comando con su categoría visual
type RegisteredCommand struct {
	Factory  CommandFactory
	Category string
}

// CommandRegistry es la lista global de comandos descubiertos
var CommandRegistry []RegisteredCommand

// RegisterCommand ahora requiere obligatoriamente una categoría
func RegisterCommand(category string, factory CommandFactory) {
	CommandRegistry = append(CommandRegistry, RegisteredCommand{
		Factory:  factory,
		Category: category,
	})
}

type Core struct {
	Paths  *Paths
	Config *Config
	Logger *Logger
	IsJSON bool  // Nuevo: indica si el output debe ser JSON
}

func Initialize() (*Core, error) {
	paths, err := InitPaths()
	if err != nil { return nil, fmt.Errorf("error al inicializar rutas: %w", err) }
	
	logger, err := InitLogger(paths.LogsDir)
	if err != nil { return nil, fmt.Errorf("error al inicializar logger: %w", err) }
	
	config, err := LoadConfig(paths.BinDir)
	if err != nil {
		if logger != nil { logger.Close() }
		return nil, fmt.Errorf("error al cargar configuración: %w", err)
	}
	
	return &Core{
		Paths:  paths,
		Config: config,
		Logger: logger,
		IsJSON: false,  // Por defecto: modo humano
	}, nil
}

// InitializeSilent inicializa Core en modo silencioso (sin logs a stdout)
// Usado cuando se ejecutan comandos --help o --json-help
func InitializeSilent() (*Core, error) {
	paths, err := InitPaths()
	if err != nil { return nil, fmt.Errorf("error al inicializar rutas: %w", err) }
	
	logger, err := InitLogger(paths.LogsDir)
	if err != nil { return nil, fmt.Errorf("error al inicializar logger: %w", err) }
	
	// Activar modo silencioso ANTES de cualquier log
	logger.SetSilentMode(true)
	
	config, err := LoadConfig(paths.BinDir)
	if err != nil {
		if logger != nil { logger.Close() }
		return nil, fmt.Errorf("error al cargar configuración: %w", err)
	}
	
	return &Core{
		Paths:  paths,
		Config: config,
		Logger: logger,
		IsJSON: false,
	}, nil
}

// SetJSONMode configura el modo de salida y reconfigura el logger
func (c *Core) SetJSONMode(enabled bool) {
	c.IsJSON = enabled
	if c.Logger != nil {
		c.Logger.SetJSONMode(enabled)
	}
}

func (c *Core) Close() error {
	if c.Logger != nil { return c.Logger.Close() }
	return nil
}