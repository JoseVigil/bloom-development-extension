package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings" 
	"sentinel/internal/ui"
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

		case "cockpit":
			runCockpit(c)
			return
		}
	}

	// Salida por defecto si no hay argumentos
	c.Logger.Success("Sentinel Base v%s activa y sincronizada.", c.Config.Version)
	fmt.Println(c.Paths.String())
}

// ============================================================================
// BRAIN SERVICE MANAGEMENT
// ============================================================================

// checkBrainHealth verifica que Brain Service esté realmente funcional
func checkBrainHealth(c *core.Core) error {
	c.Logger.Info("🔍 Verificando Brain Service...")
	
	// Intento 1: Check TCP básico
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 2*time.Second)
	if err != nil {
		return fmt.Errorf("Brain Service no responde en puerto 5678: %w", err)
	}
	conn.Close()
	
	c.Logger.Success("✓ Brain Service detectado en puerto 5678")
	
	// Intento 2: Validar que acepte conexiones (enviar ping simple)
	conn, err = net.Dial("tcp", "127.0.0.1:5678")
	if err != nil {
		return fmt.Errorf("No se puede establecer conexión con Brain: %w", err)
	}
	defer conn.Close()
	
	// Enviar mensaje de prueba (protocolo Brain: 4 bytes length + JSON)
	testMsg := []byte(`{"type":"HEALTH_PING"}`)
	length := uint32(len(testMsg))
	header := []byte{
		byte(length >> 24),
		byte(length >> 16),
		byte(length >> 8),
		byte(length),
	}
	
	conn.SetWriteDeadline(time.Now().Add(1 * time.Second))
	if _, err := conn.Write(append(header, testMsg...)); err != nil {
		return fmt.Errorf("Brain no acepta mensajes: %w", err)
	}
	
	c.Logger.Success("✓ Brain Service OPERATIVO")
	return nil
}

// startBrainService intenta arrancar Brain Service si no está corriendo
func startBrainService(c *core.Core) error {
	c.Logger.Info("🚀 Iniciando Brain Service...")
	
	// Buscar el ejecutable de Brain
	sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
	brainExe := sm.BrainPath
	
	if brainExe == "" || !fileExists(brainExe) {
		return fmt.Errorf("brain.exe no encontrado en: %s", c.Paths.BinDir)
	}
	
	c.Logger.Info("   Ejecutable: %s", brainExe)
	
	// Comando para iniciar Brain Service
	var cmd *exec.Cmd
	
	if runtime.GOOS == "windows" {
		// En Windows, usar start para ejecutar en background
		cmd = exec.Command("cmd", "/C", "start", "/B", brainExe, "service", "start", "--port", "5678")
	} else {
		cmd = exec.Command(brainExe, "service", "start", "--port", "5678", "--daemon")
	}
	
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("No se pudo iniciar Brain: %w", err)
	}
	
	c.Logger.Info("   PID: %d", cmd.Process.Pid)
	
	// Esperar a que el puerto esté disponible (máximo 10 segundos)
	for i := 0; i < 20; i++ {
		time.Sleep(500 * time.Millisecond)
		
		conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 500*time.Millisecond)
		if err == nil {
			conn.Close()
			c.Logger.Success("✓ Brain Service iniciado correctamente")
			return nil
		}
	}
	
	return fmt.Errorf("Brain Service no respondió después de 10 segundos")
}

// ensureBrainRunning garantiza que Brain esté operativo o falla
func ensureBrainRunning(c *core.Core) error {
	// Intento 1: ¿Está corriendo?
	if err := checkBrainHealth(c); err == nil {
		return nil // Ya está corriendo
	}
	
	c.Logger.Warning("⚠️  Brain Service no detectado, intentando iniciar...")
	
	// Intento 2: Arrancarlo
	if err := startBrainService(c); err != nil {
		return fmt.Errorf("CRÍTICO: No se pudo arrancar Brain Service: %w", err)
	}
	
	// Intento 3: Verificar que ahora esté funcionando
	time.Sleep(1 * time.Second)
	if err := checkBrainHealth(c); err != nil {
		return fmt.Errorf("Brain Service arrancó pero no responde: %w", err)
	}
	
	return nil
}

// ============================================================================
// DEV-START COMMAND (REFACTORED)
// ============================================================================

func runDevStartCommand(c *core.Core) {
	c.Logger.Info("🚀 Iniciando Entorno de Desarrollo Integrado...")

	// ✅ PASO CRÍTICO: Asegurar que Brain esté corriendo PRIMERO
	if err := ensureBrainRunning(c); err != nil {
		c.Logger.Error("❌ %v", err)
		c.Logger.Error("")
		c.Logger.Error("SOLUCIÓN:")
		c.Logger.Error("  1. Verifica que brain.exe exista en: %s", c.Paths.BinDir)
		c.Logger.Error("  2. O inicia Brain manualmente:")
		c.Logger.Error("     brain.exe service start --port 5678")
		c.Logger.Error("")
		os.Exit(1)
	}

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
		"brain_service":     "running", // ✅ Confirmado
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

	// F. HEALTH CHECK MEJORADO
	c.Logger.Info("🔍 Validando estado del ecosistema...")
	time.Sleep(2 * time.Second)
	
	report, err := health.CheckHealth(c, sm)
	if err != nil {
		c.Logger.Warning("⚠️  Health check reportó errores: %v", err)
	} else {
		c.Logger.Success("✓ Estado del sistema actualizado en nucleus.json")
	}
	
	// Guardar estado actualizado
	persistence.SaveNucleusState(c, report)

	// G. Manejo de terminación
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	
	c.Logger.Info("")
	c.Logger.Success(">>> Entorno LISTO. Presiona Ctrl+C para cerrar todo.")
	c.Logger.Info("")
	<-sigs 

	fmt.Println()
	c.Logger.Info("🛑 Finalizando procesos de desarrollo...")
	boot.KillProcessTree(vsCmd.Process.Pid)
	if svelteCmd != nil { boot.KillProcessTree(svelteCmd.Process.Pid) }
	boot.CleanPorts([]int{5173, 3001, 5678})
	c.Logger.Success("✓ Sistema limpio.")
}

// ============================================================================
// OTHER COMMANDS (Sin cambios)
// ============================================================================

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

func runHealthCommand(c *core.Core) {
	c.Logger.Info("🔍 Iniciando escaneo de integridad...")
	
	// ✅ Verificar Brain PRIMERO
	if err := checkBrainHealth(c); err != nil {
		c.Logger.Error("❌ Brain Service: %v", err)
	} else {
		c.Logger.Success("✓ Brain Service: Operativo")
	}
	
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

func runLaunchCommand(c *core.Core, profileID string, mode string) {
	c.Logger.Info("🔥 Sentinel Ignition: Perfil %s", profileID)
	
	// ✅ PRE-FLIGHT CHECK: Verificar Brain antes de lanzar
	if err := checkBrainHealth(c); err != nil {
		c.Logger.Error("❌ PRE-FLIGHT FAILED: %v", err)
		c.Logger.Error("")
		c.Logger.Error("Brain Service debe estar corriendo antes de lanzar perfiles.")
		c.Logger.Error("Ejecuta: brain.exe service start --port 5678")
		c.Logger.Error("")
		os.Exit(1)
	}
	
	ig := ignition.New(c)
	ig.SetupReaper()
	
	if err := ig.Launch(profileID, mode); err != nil {
		c.Logger.Error("Fallo de lanzamiento: %v", err)
		os.Exit(1)
	}
	
	// Bloqueo para mantener la telemetría viva hasta que el Reaper actúe
	select {} 
}

// ============================================================================
// HELPERS
// ============================================================================

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// ============================================================================
// UI COCKPIT
// ============================================================================

func runCockpit(c *core.Core) {
	terminal := ui.NewCockpit()

	// LANZAMOS EL MONITOREO EN BACKGROUND
	// Esto evita el deadlock porque permite que terminal.Run() se ejecute inmediatamente
	go func() {
		// Un pequeño delay para asegurar que la UI ya está lista
		time.Sleep(200 * time.Millisecond)

		// 1. Log estático de BRAIN
		today := time.Now().Format("20060102")
		brainLog := filepath.Join(c.Paths.LogsDir, fmt.Sprintf("brain_core_%s.log", today))
		terminal.WatchFile("BRAIN", brainLog)

		// 2. Escaneo constante de nuevos logs
		for {
			filepath.Walk(c.Paths.LogsDir, func(path string, info os.FileInfo, err error) error {
				if err == nil && !info.IsDir() && strings.HasSuffix(info.Name(), ".log") {
					// Filtrar solo los que nos interesan para no saturar
					name := info.Name()
					if strings.Contains(path, "guardian_") || 
					   strings.Contains(path, "engine_") || 
					   strings.Contains(name, "synapse_native") {
						terminal.WatchFile(name, path)
					}
				}
				return nil
			})
			time.Sleep(5 * time.Second)
		}
	}()

	// Iniciar la UI (esto bloquea el hilo principal y evita el deadlock)
	if err := terminal.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error en Sentinel Cockpit: %v\n", err)
		os.Exit(1)
	}
}