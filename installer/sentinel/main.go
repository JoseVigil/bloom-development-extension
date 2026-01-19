package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"sentinel/internal/boot"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/health"
	"sentinel/internal/persistence"
	"sentinel/internal/ignition"
	"sentinel/internal/startup" 
	"sentinel/internal/seed"    
	"syscall"
	"time"
)

// RPCRequest define la estructura de comandos entrantes desde Electron
type RPCRequest struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

func main() {
	// 1. Inicialización del Core (Config y Paths)
	c, err := core.Initialize()
	if err != nil {
		fmt.Fprintf(os.Stderr, "✗ Error fatal de inicialización: %v\n", err)
		os.Exit(1)
	}
	defer c.Close()

	// 2. FASE STARTUP: Identidad, Manifiesto y Estado Inicial
	if err := startup.Initialize(c); err != nil {
		c.Logger.Error("Fallo crítico en fase Startup: %v", err)
		os.Exit(1)
	}

	// 3. ENRUTADOR DE COMANDOS CLI
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "health":
			runHealthCommand(c)
			return

		case "seed":
			if len(os.Args) < 4 {
				c.Logger.Error("Uso: sentinel seed [alias] [is_master (true|false)]")
				os.Exit(1)
			}
			alias := os.Args[2]
			isMaster, _ := strconv.ParseBool(os.Args[3])
			runSeedCommand(c, alias, isMaster)
			return

		case "bridge":
			runBridgeMode(c)
			return

		case "dev-start":
			runDevStartCommand(c)
			return

		case "launch":
			if len(os.Args) < 3 {
				c.Logger.Error("Uso: sentinel launch [profile_id] [--cockpit|--discovery]")
				os.Exit(1)
			}
			profileID := os.Args[2]
			mode := "--cockpit"
			if len(os.Args) > 3 {
				mode = os.Args[3]
			}
			runLaunchCommand(c, profileID, mode)
			return
		}
	}

	// Salida por defecto si no hay argumentos
	c.Logger.Success("Sentinel Base v%s activa y sincronizada.", c.Config.Version)
	fmt.Println(c.Paths.String())
}

// runDevStartCommand orquestra el entorno de desarrollo y actualiza el estado dinámicamente
func runDevStartCommand(c *core.Core) {
	c.Logger.Info("🚀 Iniciando Entorno de Desarrollo Integrado...")

	// A. Discovery de herramientas de desarrollo
	codePath, _ := discovery.FindVSCodeBinary()
	extPath := c.Config.Settings.ExtensionPath
	wsPath := c.Config.Settings.TestWorkspace
	runtimePath := filepath.Join(c.Paths.AppDataDir, "resources", "runtime")

	// B. Registro de descubrimientos en nucleus.json
	startup.UpdateActiveStatus(c, map[string]string{
		"vscode_exe":        codePath,
		"vscode_workspace":  wsPath,
		"svelte_app_path":   filepath.Join(extPath, "webview", "app"),
		"operational_mode":  "development",
		"dev_runtime_path":  runtimePath,
	})

	// C. Lanzamiento de Svelte (Vite)
	svelteCmd, err := boot.LaunchSvelte(extPath)
	if err != nil {
		c.Logger.Warning("No se pudo iniciar Svelte: %v", err)
	}

	// D. Sincronización de Entorno VSCode
	sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
	_ = boot.SyncVScodeSettings(extPath, sm.BrainPath, filepath.Join(runtimePath, "python.exe"))

	// E. Lanzamiento de VSCode Extension Host
	vsCmd, err := boot.LaunchExtensionHost(codePath, extPath, wsPath, runtimePath)
	if err != nil {
		c.Logger.Error("Fallo al lanzar VSCode: %v", err)
		if svelteCmd != nil { boot.KillProcessTree(svelteCmd.Process.Pid) }
		os.Exit(1)
	}

	// F. INTEGRACIÓN BOOT -> HEALTH
	// Esperamos a que los puertos se abran para actualizar nucleus.json con la salud real
	c.Logger.Info("Esperando sincronización de servicios...")
	time.Sleep(2 * time.Second)
	_, _ = health.CheckHealth(c, sm)
	c.Logger.Success("✓ Estado del sistema actualizado en nucleus.json")

	// G. Manejo de terminación
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	
	c.Logger.Info(">>> Entorno LISTO. Presiona Ctrl+C para cerrar todo.")
	<-sigs 

	fmt.Println()
	c.Logger.Info("Finalizando procesos de desarrollo...")
	boot.KillProcessTree(vsCmd.Process.Pid)
	if svelteCmd != nil { boot.KillProcessTree(svelteCmd.Process.Pid) }
	boot.CleanPorts([]int{5173, 3001, 5678})
	c.Logger.Success("✓ Sistema limpio.")
}

// runSeedCommand ejecuta el aprovisionamiento de perfiles vía CLI
func runSeedCommand(c *core.Core, alias string, isMaster bool) {
	uuid, err := seed.HandleSeed(c, alias, isMaster)
	if err != nil {
		res, _ := json.Marshal(map[string]string{"status": "error", "message": err.Error()})
		fmt.Println(string(res))
		os.Exit(1)
	}
	
	res, _ := json.Marshal(map[string]interface{}{
		"status": "success", 
		"uuid":   uuid, 
		"alias":  alias,
		"master": isMaster,
	})
	fmt.Println(string(res))
}

// runBridgeMode establece el canal JSON-RPC persistente con Electron
func runBridgeMode(c *core.Core) {
	c.Logger.Info("📡 Modo Bridge Activo (Esperando comandos JSON)")
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		var req RPCRequest
		if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
			sendError("JSON_PARSE_ERROR", err.Error())
			continue
		}

		switch req.Method {
		case "seed":
			var params struct { Alias string; Master bool }
			json.Unmarshal(req.Params, &params)
			uuid, err := seed.HandleSeed(c, params.Alias, params.Master)
			if err != nil {
				sendError("SEED_ERROR", err.Error())
			} else {
				sendResponse(map[string]string{"status": "success", "uuid": uuid})
			}
		case "health":
			sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
			report, _ := health.CheckHealth(c, sm)
			sendResponse(report)
		case "ping":
			sendResponse("pong")
		default:
			sendError("UNKNOWN_METHOD", req.Method)
		}
	}
}

// Helpers de comunicación Bridge
func sendResponse(data interface{}) {
	res, _ := json.Marshal(map[string]interface{}{"result": data})
	fmt.Println(string(res))
}

func sendError(code, msg string) {
	res, _ := json.Marshal(map[string]interface{}{
		"error": map[string]string{"code": code, "message": msg},
	})
	fmt.Println(string(res))
}

// runHealthCommand ejecuta una auditoría manual desde la terminal
func runHealthCommand(c *core.Core) {
	c.Logger.Info("Iniciando escaneo de integridad...")
	sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
	report, err := health.CheckHealth(c, sm)
	if err != nil {
		c.Logger.Error("Error en Health: %v", err)
		return
	}
	
	// Sincronizar con el estado persistente
	persistence.SaveNucleusState(c, report)
	
	out, _ := json.MarshalIndent(report, "", "  ")
	fmt.Println(string(out))
}

// runLaunchCommand dispara el motor de ignición para un perfil
func runLaunchCommand(c *core.Core, profileID string, mode string) {
	c.Logger.Info("🔥 Sentinel Ignition: Perfil %s", profileID)
	ig := ignition.New(c)
	ig.SetupReaper()
	
	if err := ig.Launch(profileID, mode); err != nil {
		c.Logger.Error("Fallo de lanzamiento: %v", err)
		os.Exit(1)
	}
	
	// Bloqueo para mantener la telemetría viva hasta que el Reaper actúe
	select {} 
}