package main

import (
	"fmt"
	"os"
	"sentinel/internal/core"
)

func main() {
	c, err := core.Initialize()
	if err != nil {
		fmt.Fprintf(os.Stderr, "✗ Error fatal: %v\n", err)
		os.Exit(1)
	}
	defer c.Close()

	c.Logger.Success("Sentinel Base Inicializada con éxito")
	fmt.Println()
	
	fmt.Print(c.Paths.String())
	fmt.Println()
	
	c.Logger.Success("Todas las rutas validadas correctamente")
	
	c.Logger.Info("Versión: %s", c.Config.Version)
	c.Logger.Info("Perfiles cargados: %d", len(c.Config.Profiles))
	
	for i, profile := range c.Config.Profiles {
		status := "deshabilitado"
		if profile.Enabled {
			status = "habilitado"
		}
		c.Logger.Info("  [%d] %s (%s) - prioridad: %d", 
			i+1, profile.Name, status, profile.Priority)
	}
}