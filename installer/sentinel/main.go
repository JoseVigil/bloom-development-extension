package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strconv" // ✅ Añadido para convertir el string "true/false" a bool
	"sentinel/internal/boot"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/health"
	"sentinel/internal/persistence"
	"sentinel/internal/ignition"
	"sentinel/internal/startup" 
	"sentinel/internal/seed"    
	"syscall"
)

type RPCRequest struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

func main() {
	c, err := core.Initialize()
	if err != nil {
		fmt.Fprintf(os.Stderr, "✗ Error fatal: %v\n", err)
		os.Exit(1)
	}
	defer c.Close()

	if err := startup.Initialize(c); err != nil {
		c.Logger.Error("Fallo crítico de identidad: %v", err)
		os.Exit(1)
	}

	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "health":
			runHealthCommand(c)
			return
		case "seed": // ✅ NUEVO: Comando CLI directo para Electron o terminal
			// Uso: sentinel.exe seed [alias] [is_master]
			if len(os.Args) < 4 {
				c.Logger.Error("Uso: sentinel seed [alias] [true|false]")
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
				c.Logger.Error("Uso: sentinel launch [profile_id] [--discovery|--cockpit]")
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

	c.Logger.Success("Sentinel Base Inicializada con éxito")
	c.Logger.Info("Versión: %s", c.Config.Version)
}

// ✅ NUEVA FUNCIÓN: Ejecuta el aprovisionamiento desde CLI
func runSeedCommand(c *core.Core, alias string, isMaster bool) {
	uuid, err := seed.HandleSeed(c, alias, isMaster)
	if err != nil {
		res, _ := json.Marshal(map[string]string{"status": "error", "message": err.Error()})
		fmt.Println(string(res))
		os.Exit(1)
	}
	
	// ✅ Salida garantizada para Electron
	res, _ := json.Marshal(map[string]interface{}{
		"status": "success", 
		"uuid":   uuid, 
		"alias":  alias,
		"master": isMaster,
	})
	fmt.Println(string(res))
}

// ... resto de funciones (runBridgeMode, runHealthCommand, etc.) se mantienen igual ...

func runBridgeMode(c *core.Core) {
	c.Logger.Info("📡 Modo Bridge Activo")
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		var req RPCRequest
		if err := json.Unmarshal(scanner.Bytes(), &req); err != nil {
			continue
		}
		if req.Method == "seed" {
			var params struct {
				Alias  string `json:"alias"`
				Master bool   `json:"master"`
			}
			json.Unmarshal(req.Params, &params)
			uuid, err := seed.HandleSeed(c, params.Alias, params.Master)
			if err != nil {
				sendError(err.Error())
			} else {
				sendResponse(map[string]string{"status": "success", "uuid": uuid})
			}
		}
	}
}

func sendResponse(data interface{}) {
	res, _ := json.Marshal(map[string]interface{}{"result": data})
	fmt.Println(string(res))
}

func sendError(msg string) {
	res, _ := json.Marshal(map[string]interface{}{"error": msg})
	fmt.Println(string(res))
}

func runHealthCommand(c *core.Core) {
	systemMap, _ := discovery.DiscoverSystem(c.Paths.BinDir)
	report, _ := health.CheckHealth(c, systemMap)
	persistence.SaveNucleusState(c, report)
	jsonOutput, _ := json.MarshalIndent(report, "", "  ")
	fmt.Println(string(jsonOutput))
}

func runDevStartCommand(c *core.Core) {
	codePath, _ := discovery.FindVSCodeBinary()
	extPath := c.Config.Settings.ExtensionPath
	wsPath := c.Config.Settings.TestWorkspace
	runtimePath := filepath.Join(c.Paths.AppDataDir, "resources", "runtime")
	svelteCmd, _ := boot.LaunchSvelte(extPath)
	vsCmd, _ := boot.LaunchExtensionHost(codePath, extPath, wsPath, runtimePath)
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	<-sigs 
	boot.KillProcessTree(vsCmd.Process.Pid)
	if svelteCmd != nil { boot.KillProcessTree(svelteCmd.Process.Pid) }
}

func runLaunchCommand(c *core.Core, profileID string, mode string) {
	ig := ignition.New(c)
	ig.SetupReaper()
	if err := ig.Launch(profileID, mode); err != nil {
		os.Exit(1)
	}
	select {} 
}