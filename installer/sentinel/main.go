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
	"sentinel/internal/ignition"
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
		case "launch":
			// Uso: sentinel.exe launch [ID_PERFIL] [--discovery o --cockpit]
			if len(os.Args) < 3 {
				c.Logger.Error("Uso: sentinel launch [profile_id] [--discovery|--cockpit]")
				os.Exit(1)
			}
			
			profileID := os.Args[2]
			mode := "--cockpit" // Default
			if len(os.Args) > 3 {
				mode = os.Args[3]
			}
			
			runLaunchCommand(c, profileID, mode)
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

func runLaunchCommand(c *core.Core, profileID string, mode string) {
	c.Logger.Info("🔥 Sentinel Ignition v2.0")
	
	// 1. Instanciar el módulo
	ig := ignition.New(c)
	
	// 2. Activar el Reaper (Kill Switch) 
	// Si Electron cierra el pipe o presionas Ctrl+C, esto limpia todo.
	ig.SetupReaper()

	// 3. Ejecutar la secuencia de lanzamiento
	// Este método bloquea la ejecución hasta que lee "LATE_BINDING_SUCCESS"
	// o falla por timeout/error.
	err := ig.Launch(profileID, mode)
	
	if err != nil {
		c.Logger.Error("❌ Error de Ignición: %v", err)
		ig.KillAll() // Limpieza de emergencia
		os.Exit(1)
	}

	// 4. Mantener el proceso vivo
	// Una vez que Ignition confirma el éxito, no queremos que Sentinel se cierre,
	// porque las goroutines de Telemetry (tail -f) deben seguir enviando logs a Electron.
	c.Logger.Success("📡 Telemetría activa. El flujo de datos está abierto.")
	
	select {} // Bloqueo infinito hasta que el Reaper actúe
}