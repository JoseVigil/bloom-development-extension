package core

import (
	"fmt"
)

type Core struct {
	Paths  *Paths
	Config *Config
	Logger *Logger
}

func Initialize() (*Core, error) {
	paths, err := InitPaths()
	if err != nil {
		return nil, fmt.Errorf("error al inicializar rutas: %w", err)
	}

	logger, err := InitLogger(paths.LogsDir)
	if err != nil {
		return nil, fmt.Errorf("error al inicializar logger: %w", err)
	}

	config, err := LoadConfig(paths.BinDir)
	if err != nil {
		logger.Close()
		return nil, fmt.Errorf("error al cargar configuración: %w", err)
	}

	core := &Core{
		Paths:  paths,
		Config: config,
		Logger: logger,
	}

	return core, nil
}

func (c *Core) Close() error {
	if c.Logger != nil {
		return c.Logger.Close()
	}
	return nil
}