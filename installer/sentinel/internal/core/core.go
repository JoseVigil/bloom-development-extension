package core

import (
	"fmt"
	"github.com/spf13/cobra"
)

// === SISTEMA DE REGISTRO DE COMANDOS (PRESERVADO) ===
type CommandFactory func(c *Core) *cobra.Command
type RegisteredCommand struct {
	Factory  CommandFactory
	Category string
}
var CommandRegistry []RegisteredCommand

func RegisterCommand(category string, factory CommandFactory) {
	fmt.Printf("DEBUG: Registrando comando en categoría %s\n", category)
	CommandRegistry = append(CommandRegistry, RegisteredCommand{
		Factory:  factory,
		Category: category,
	})
}

// === ESTRUCTURA CORE ===
type Core struct {
	Paths  *Paths
	Config *Config
	Logger *Logger
	IsJSON bool
	OllamaSupervisor any
}

func Initialize() (*Core, error) {
	paths, err := InitPaths()
	if err != nil {
		return nil, fmt.Errorf("error al inicializar rutas: %w", err)
	}

	// Sincronizado con la firma de InitLogger en logger.go
	logger, err := InitLogger(paths, "sentinel_core", "SENTINEL CORE", 1)
	if err != nil {
		return nil, fmt.Errorf("error al inicializar logger: %w", err)
	}

	config, err := LoadConfig(paths.BinDir)
	if err != nil {
		logger.Close()
		return nil, fmt.Errorf("error al cargar configuración: %w", err)
	}

	return &Core{
		Paths:  paths,
		Config: config,
		Logger: logger,
		IsJSON: false,
	}, nil
}

func InitializeSilent() (*Core, error) {
	c, err := Initialize()
	if err != nil {
		return nil, err
	}
	c.Logger.SetSilentMode(true)
	return c, nil
}

func (c *Core) SetJSONMode(enabled bool) {
	c.IsJSON = enabled
	if c.Logger != nil {
		c.Logger.SetJSONMode(enabled)
	}
}

func (c *Core) Close() error {
	if c.Logger != nil {
		return c.Logger.Close()
	}
	return nil
}