package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/health"
	"sentinel/internal/persistence"
)

func main() {
	c, err := core.Initialize()
	if err != nil {
		fmt.Fprintf(os.Stderr, "✗ Error fatal: %v\n", err)
		os.Exit(1)
	}
	defer c.Close()

	if len(os.Args) > 1 && os.Args[1] == "health" {
		runHealthCommand(c)
		return
	}

	c.Logger.Success("Sentinel Base Inicializada con éxito")
	fmt.Println(c.Paths.String())
	c.Logger.Info("Versión: %s", c.Config.Version)
}

func runHealthCommand(c *core.Core) {
	c.Logger.Info("Iniciando escaneo del sistema...")
	
	// 1. Discovery
	systemMap, err := discovery.DiscoverSystem(c.Paths.BinDir)
	if err != nil {
		c.Logger.Error("Error en Discovery: %v", err)
		os.Exit(1)
	}
	
	c.Logger.Success("✓ brain.exe: %s", systemMap.BrainPath)
	c.Logger.Success("✓ chrome.exe: %s", systemMap.ChromePath)

	// 2. Health Scan
	report, err := health.CheckHealth(systemMap)
	if err != nil {
		c.Logger.Error("Error en Health: %v", err)
		os.Exit(1)
	}

	// 3. Persistence
	persistence.SaveNucleusState(c.Paths.AppDataDir, report)
	c.Logger.Success("✓ Estado guardado en nucleus.json")

	// 4. Output
	jsonOutput, _ := json.MarshalIndent(report, "", "  ")
	fmt.Println("\nReporte completo:")
	fmt.Println(string(jsonOutput))
}