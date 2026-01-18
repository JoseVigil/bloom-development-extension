package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"sentinel/internal/boot"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/health"
	"sentinel/internal/persistence"
	"syscall"
)

func main() {
	c, err := core.Initialize()
	if err != nil {
		fmt.Fprintf(os.Stderr, "✗ Error fatal: %v\n", err)
		os.Exit(1)
	}
	defer c.Close()

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

	c.Logger.Success("Sentinel Base Inicializada con éxito")
	fmt.Println()
	fmt.Print(c.Paths.String())
	fmt.Println()
	c.Logger.Info("Versión: %s", c.Config.Version)
}

func runHealthCommand(c *core.Core) {
	c.Logger.Info("Iniciando escaneo del sistema...")
	systemMap, err := discovery.DiscoverSystem(c.Paths.BinDir)
	if err != nil {
		c.Logger.Error("Error en Discovery: %v", err)
		os.Exit(1)
	}
	
	report, err := health.CheckHealth(systemMap)
	if err != nil {
		c.Logger.Error("Error en Health Scan: %v", err)
		os.Exit(1)
	}
	
	persistence.SaveNucleusState(c.Paths.AppDataDir, report)
	
	jsonOutput, _ := json.MarshalIndent(report, "", "  ")
	fmt.Println(string(jsonOutput))
}

func runDevStartCommand(c *core.Core) {
	c.Logger.Info("🚀 Iniciando Entorno de Desarrollo Integrado...")

	// 1. Discovery VSCode
	codePath, err := discovery.FindVSCodeBinary()
	if err != nil {
		c.Logger.Error("Error localizando VSCode: %v", err)
		os.Exit(1)
	}

	extPath := c.Config.Settings.ExtensionPath
	wsPath := c.Config.Settings.TestWorkspace
	runtimePath := filepath.Join(c.Paths.AppDataDir, "resources", "runtime")

	// 2. Lanzar Svelte
	svelteCmd, err := boot.LaunchSvelte(extPath)
	var sveltePid int
	if err != nil {
		c.Logger.Warning("No se pudo iniciar Svelte: %v", err)
	} else {
		sveltePid = svelteCmd.Process.Pid
		c.Logger.Success("✓ Servidor Svelte iniciado (PID: %d)", sveltePid)
	}

	// 3. Lanzar VSCode
	vsCmd, err := boot.LaunchExtensionHost(codePath, extPath, wsPath, runtimePath)
	var vsPid int
	if err != nil {
		c.Logger.Error("Error lanzando VSCode: %v", err)
		// Si VSCode falla, limpiamos Svelte antes de salir
		if sveltePid > 0 { boot.KillProcessTree(sveltePid) }
		os.Exit(1)
	}
	vsPid = vsCmd.Process.Pid
	c.Logger.Success("✓ VSCode Extension Host activo (PID: %d)", vsPid)

	// 4. Manejo de Señales (Ctrl+C)
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)

	c.Logger.Info(">>> Entorno de desarrollo LISTO.")
	c.Logger.Info(">>> Presiona Ctrl+C para CERRAR VSCode y Svelte automáticamente.")

	<-sigs 

	fmt.Println()
	c.Logger.Info("Aniquilando entorno de desarrollo...")
	
	// 1. Cerramos la ventana de VS Code primero (el impacto visual)
	boot.KillProcessTree(vsPid)
	c.Logger.Success("✓ Ventana de desarrollo cerrada.")

	// 2. Cerramos Svelte
	boot.KillProcessTree(sveltePid)
	c.Logger.Success("✓ Servidor Svelte finalizado.")
	
	// 3. Limpieza final de puertos para asegurar
	boot.CleanPorts([]int{5173, 3001, 5678})
	
	c.Logger.Success("✓ Sistema limpio. Hasta la próxima.")
}