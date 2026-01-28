package health

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/process"
	"sentinel/internal/startup"
	"sync"
	"time"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("SYSTEM", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "health",
			Short: "Escaneo de integridad del sistema",
			Example: `  sentinel health
  sentinel --json health | jq '.services[] | select(.active == false)'`,
			Run: func(cmd *cobra.Command, args []string) {
				// Ejecutar health check
				c.Logger.Info("🔍 Iniciando escaneo de integridad...")
				
				if err := EnsureBrainRunning(c); err != nil {
					c.Logger.Error("❌ Brain Service: %v", err)
				} else {
					c.Logger.Success("✅ Brain Service: Operativo")
				}
				
				sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
				report, _ := CheckHealth(c, sm)
				
				// Salida según modo
				if c.IsJSON {
					outputHealthJSON(c, report)
				} else {
					outputHealthHuman(report)
				}
			},
		}

		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["requires"] = `  - brain.exe debe estar en PATH o en bin/
  - Puertos 5678, 3001, 5173 accesibles para verificación`

		return cmd
	})
}

// outputHealthJSON emite el resultado en formato JSON de una sola línea a stdout
func outputHealthJSON(c *core.Core, status *startup.SystemStatus) {
	// Mapear a la estructura requerida por Electron
	servicesMap := make(map[string]map[string]interface{})
	
	for _, svc := range status.Services {
		statusStr := "stopped"
		if svc.Active {
			statusStr = "running"
		}
		
		servicesMap[svc.Name] = map[string]interface{}{
			"status": statusStr,
			"port":   svc.Port,
		}
	}
	
	// Determinar si está conectado (al menos un servicio activo)
	connected := false
	for _, svc := range status.Services {
		if svc.Active {
			connected = true
			break
		}
	}
	
	// Contar perfiles registrados desde el archivo
	profilesCount := 0
	profilesPath := filepath.Join(c.Paths.AppDataDir, "config", "profiles.json")
	if data, err := os.ReadFile(profilesPath); err == nil {
		var reg process.ProfileRegistry
		if json.Unmarshal(data, &reg) == nil {
			profilesCount = len(reg.Profiles)
		}
	}
	
	result := map[string]interface{}{
		"connected":           connected,
		"port":                5678,  // Puerto principal de Brain
		"services":            servicesMap,
		"profiles_registered": profilesCount,
	}
	
	// Emitir en una sola línea
	jsonBytes, _ := json.Marshal(result)
	fmt.Println(string(jsonBytes))
}

// outputHealthHuman emite el resultado en formato legible para humanos
func outputHealthHuman(status *startup.SystemStatus) {
	out, _ := json.MarshalIndent(status, "", "  ")
	fmt.Println(string(out))
}

func EnsureBrainRunning(c *core.Core) error {
	if err := checkBrainHealth(c); err == nil { return nil }
	c.Logger.Warning("⚠️  Brain Service no detectado, intentando iniciar...")
	if err := startBrainService(c); err != nil { return err }
	time.Sleep(1 * time.Second)
	return checkBrainHealth(c)
}

func checkBrainHealth(c *core.Core) error {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 2*time.Second)
	if err != nil { return err }
	conn.Close()
	return nil
}

func startBrainService(c *core.Core) error {
	sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "start", "/B", sm.BrainPath, "service", "start", "--port", "5678")
	} else {
		cmd = exec.Command(sm.BrainPath, "service", "start", "--port", "5678", "--daemon")
	}
	return cmd.Start()
}

func CheckHealth(c *core.Core, sm *discovery.SystemMap) (*startup.SystemStatus, error) {
	statusObj := startup.LoadCurrentStatus(c)
	status := &statusObj
	status.Timestamp = time.Now().Format(time.RFC3339)
	status.SystemMap["brain_exe"] = sm.BrainPath
	status.SystemMap["chrome_exe"] = sm.ChromePath
	
	if c.Config.Provisioning.ExtensionID != "" {
		status.SystemMap["extension_id"] = c.Config.Provisioning.ExtensionID
		c.Logger.Info("[DEBUG] ExtensionID guardado: '%s'", c.Config.Provisioning.ExtensionID)
	} else {
		c.Logger.Warning("[DEBUG] ExtensionID está VACÍO en Config!")
	}
	
	var wg sync.WaitGroup
	sc := make(chan startup.ServiceStatus, 3)
	wg.Add(3)
	go func() { defer wg.Done(); sc <- checkPort(5678, "Core Bridge", "TCP") }()
	go func() { defer wg.Done(); sc <- checkPort(3001, "Extension API", "HTTP") }()
	go func() { defer wg.Done(); sc <- checkPort(5173, "Svelte Dev", "TCP") }()
	
	go func() { wg.Wait(); close(sc) }()
	status.Services = []startup.ServiceStatus{}
	for s := range sc { status.Services = append(status.Services, s) }
	
	_ = startup.SaveSystemStatus(c, *status)
	return status, nil
}

func checkPort(port int, name, proto string) startup.ServiceStatus {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	active := false
	if proto == "HTTP" {
		resp, err := http.Get(fmt.Sprintf("http://%s/health", addr))
		active = (err == nil && resp.StatusCode == 200)
	} else {
		conn, err := net.DialTimeout("tcp", addr, 1*time.Second)
		if err == nil { active = true; conn.Close() }
	}
	return startup.ServiceStatus{Name: name, Port: port, Active: active}
}