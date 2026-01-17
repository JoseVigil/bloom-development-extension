package main

import (
	"encoding/json"
	"fmt"
	"os"
	"sentinel/internal/boot"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/health"
	"sentinel/internal/persistence"
)

func main() {
	// Inicialización del Core (Paths, Config, Logger)
	c, err := core.Initialize()
	if err != nil {
		fmt.Fprintf(os.Stderr, "✗ Error fatal: %v\n", err)
		os.Exit(1)
	}
	defer c.Close()

	// Enrutador de comandos CLI
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "health":
			runHealthCommand(c)
			return
		case "dev-start":
			runDevStartCommand(c)
			return
		}
	}

	// Comportamiento por defecto: Mostrar estado de la base
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

// runHealthCommand ejecuta la secuencia de auditoría del sistema
func runHealthCommand(c *core.Core) {
	c.Logger.Info("Iniciando escaneo del sistema...")
	
	// 1. Discovery: Localización proactiva de componentes
	c.Logger.Info("Fase 1: Autodescubrimiento de componentes")
	systemMap, err := discovery.DiscoverSystem(c.Paths.BinDir)
	if err != nil {
		c.Logger.Error("Error en Discovery: %v", err)
		fmt.Fprintf(os.Stderr, `{"error": "discovery_failed", "details": "%s"}`+"\n", err.Error())
		os.Exit(1)
	}
	
	c.Logger.Success("✓ brain.exe: %s", systemMap.BrainPath)
	c.Logger.Success("✓ chrome.exe: %s", systemMap.ChromePath)
	if systemMap.VSCodePlugin != "" {
		c.Logger.Success("✓ VSCode Plugin: %s (v%s)", systemMap.VSCodePlugin, systemMap.PluginVersion)
	} else {
		c.Logger.Warning("VSCode Plugin no encontrado")
	}
	
	// 2. Health Scan: Auditoría concurrente de servicios
	c.Logger.Info("Fase 2: Auditoría de servicios")
	report, err := health.CheckHealth(systemMap)
	if err != nil {
		c.Logger.Error("Error en Health Scan: %v", err)
		fmt.Fprintf(os.Stderr, `{"error": "health_scan_failed", "details": "%s"}`+"\n", err.Error())
		os.Exit(1)
	}
	
	for _, service := range report.Services {
		if service.Available {
			c.Logger.Success("✓ %s: %s", service.Name, service.Details)
		} else {
			c.Logger.Warning("✗ %s: %s", service.Name, service.Details)
		}
	}
	
	if report.OnboardingCompleted {
		c.Logger.Success("✓ Usuario registrado (onboarding completado)")
	} else {
		c.Logger.Warning("⚠ Onboarding pendiente")
	}
	
	// 3. Persistencia: Guardar estado en la "Caja Negra" nucleus.json
	c.Logger.Info("Fase 3: Persistiendo estado del sistema")
	if err := persistence.SaveNucleusState(c.Paths.AppDataDir, report); err != nil {
		c.Logger.Error("Error guardando nucleus.json: %v", err)
	} else {
		c.Logger.Success("✓ Estado guardado en nucleus.json")
	}
	
	// 4. Output: Representación JSON final para el integrador
	fmt.Println()
	c.Logger.Info("Reporte completo:")
	jsonOutput, _ := json.MarshalIndent(report, "", "  ")
	fmt.Println(string(jsonOutput))
}

// runDevStartCommand lanza VSCode en modo Extension Host para desarrollo
func runDevStartCommand(c *core.Core) {
	c.Logger.Info("Iniciando entorno de desarrollo VSCode...")

	// 1. Discovery del binario de VSCode
	codePath, err := discovery.FindVSCodeBinary()
	if err != nil {
		c.Logger.Error("Error localizando VSCode: %v", err)
		os.Exit(1)
	}
	c.Logger.Success("✓ VSCode detectado: %s", codePath)

	// 2. Obtener rutas desde el blueprint
	extPath := c.Config.Settings.ExtensionPath
	wsPath := c.Config.Settings.TestWorkspace

	if extPath == "" {
		c.Logger.Error("Configuración incompleta: extensionPath no definido en blueprint.json")
		os.Exit(1)
	}

	c.Logger.Info("Cargando extensión desde: %s", extPath)
	if wsPath != "" {
		c.Logger.Info("Usando workspace de prueba: %s", wsPath)
	}

	// 3. Boot: Lanzar proceso VSCode Extension Host
	err = boot.LaunchExtensionHost(codePath, extPath, wsPath)
	if err != nil {
		c.Logger.Error("Error al disparar el entorno: %v", err)
		os.Exit(1)
	}

	c.Logger.Success("✓ VSCode Extension Host lanzado con éxito")
	c.Logger.Info("Sentinel puede cerrarse mientras trabajas en VSCode")
}