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
	"sentinel/internal/temporal"
	"sync"
	"time"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("SYSTEM", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "health",
			Short: "Escaneo de integridad del sistema",
			Long: `Escaneo de integridad del sistema

JSON OUTPUT (--json flag):
{"connected":true,"port":5678,"services":{"Core Bridge":{"status":"running","port":5678},"Bloom API (Swagger)":{"status":"running","port":48215},"Svelte Dev":{"status":"running","port":5173},"Ollama Engine":{"status":"running","port":11434},"Worker Manager":{"status":"running","port":0},"Temporal Server":{"status":"running","port":7233}},"profiles_registered":2}`,
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
  - Puertos 5678, 48215, 5173, 11434, 7233 accesibles para verificación`
		cmd.Annotations["output"] = `JSON (--json):
  {"connected":true,"port":5678,"services":{"Core Bridge":{"status":"running","port":5678},"Bloom API (Swagger)":{"status":"running","port":48215},"Svelte Dev":{"status":"running","port":5173},"Ollama Engine":{"status":"running","port":11434},"Worker Manager":{"status":"running","port":0},"Temporal Server":{"status":"running","port":7233}},"profiles_registered":2}`

		return cmd
	})

	// Comando check con subcomandos
	core.RegisterCommand("SYSTEM", func(c *core.Core) *cobra.Command {
		checkCmd := &cobra.Command{
			Use:   "check [componente]",
			Short: "Ejecuta un diagnóstico profundo de salud del sistema y procesos",
			Args:  cobra.MaximumNArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				component := ""
				if len(args) > 0 {
					component = args[0]
				}
				
				if err := RunHealthCheck(c, component); err != nil {
					c.Logger.Error("Error en diagnóstico: %v", err)
					os.Exit(1)
				}
			},
		}

		// Subcomando: check workers
		checkCmd.AddCommand(&cobra.Command{
			Use:   "workers",
			Short: "Lista todos los workers (Chrome Profiles) activos",
			Run: func(cmd *cobra.Command, args []string) {
				profiles := getActiveProfiles(c)
				if c.IsJSON {
					out, _ := json.MarshalIndent(profiles, "", "  ")
					fmt.Println(string(out))
					return
				}
				fmt.Println("📦 WORKERS ACTIVOS:")
				for _, p := range profiles {
					fmt.Printf("[%s] Status: %s | PID: %d\n", p.ProfileID, p.Status, p.PID)
				}
			},
		})

		// Subcomando: check workers health
		workersCmd := checkCmd.Commands()[0]
		workersCmd.AddCommand(&cobra.Command{
			Use:   "health",
			Short: "Resumen de salud de todos los workers",
			Run: func(cmd *cobra.Command, args []string) {
				profiles := getActiveProfiles(c)
				healthy := 0
				for _, p := range profiles {
					if p.Status == "active" || p.Status == "running" {
						healthy++
					}
				}
				if c.IsJSON {
					fmt.Printf(`{"total": %d, "healthy": %d}`+"\n", len(profiles), healthy)
				} else {
					c.Logger.Info("Salud de Workers: %d/%d operativos", healthy, len(profiles))
				}
			},
		})

		return checkCmd
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
	sc := make(chan startup.ServiceStatus, 6)
	wg.Add(6)
	
	// 1. Core Bridge
	go func() { defer wg.Done(); sc <- checkPort(5678, "Core Bridge", "TCP") }()
	
	// 2. Bloom API + Swagger (Puerto corregido a 48215)
	go func() { 
		defer wg.Done()
		addr := "127.0.0.1:48215"
		active := false
		// Intentamos validar Swagger UI directamente
		resp, err := http.Get(fmt.Sprintf("http://%s/documentation", addr))
		if err == nil && (resp.StatusCode == 200 || resp.StatusCode == 302) {
			active = true
			resp.Body.Close()
		}
		sc <- startup.ServiceStatus{Name: "Bloom API (Swagger)", Port: 48215, Active: active}
	}()
	
	// 3. Svelte Dev
	go func() { defer wg.Done(); sc <- checkPort(5173, "Svelte Dev", "TCP") }()
	
	// 4. Ollama Runtime
	go func() {
		defer wg.Done()
		addr := "127.0.0.1:11434"
		active := false
		resp, err := http.Get(fmt.Sprintf("http://%s/api/version", addr))
		if err == nil && resp.StatusCode == 200 {
			active = true
			resp.Body.Close()
		}
		sc <- startup.ServiceStatus{Name: "Ollama Engine", Port: 11434, Active: active}
	}()

	// 5. Worker Manager (Busca perfiles activos en el registry)
	go func() {
		defer wg.Done()
		profilesPath := filepath.Join(c.Paths.AppDataDir, "config", "profiles.json")
		active := false
		if data, err := os.ReadFile(profilesPath); err == nil {
			var reg process.ProfileRegistry
			if json.Unmarshal(data, &reg) == nil && len(reg.Profiles) > 0 {
				active = true
			}
		}
		sc <- startup.ServiceStatus{Name: "Worker Manager", Port: 0, Active: active}
	}()
	
	// 6. Temporal Runtime (consulta estado sin modificar)
	go func() {
		defer wg.Done()
		sc <- checkTemporalHealth(c)
	}()
	
	go func() { wg.Wait(); close(sc) }()
	
	status.Services = []startup.ServiceStatus{}
	for s := range sc { status.Services = append(status.Services, s) }
	
	_ = startup.SaveSystemStatus(c, *status)
	return status, nil
}

// checkTemporalHealth consulta el estado de Temporal sin modificar el runtime
// Cumple con el principio: health consume estado, no ejecuta infraestructura
func checkTemporalHealth(c *core.Core) startup.ServiceStatus {
	svc := startup.ServiceStatus{
		Name:   "Temporal Server",
		Port:   7233,
		Active: false,
	}
	
	// Si no hay manager inicializado, Temporal no está corriendo
	if c.TemporalManager == nil {
		return svc
	}
	
	// Obtener el manager sin crear uno nuevo
	tm := c.TemporalManager.(*temporal.Manager)
	
	// Consultar estado actual (FSM)
	state := tm.GetState()
	
	// Solo está activo si está en estado RUNNING
	if state == temporal.StateRunning {
		// Verificar que realmente responda
		healthy, _ := tm.HealthCheck()
		svc.Active = healthy
	}
	
	return svc
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

// RunHealthCheck ejecuta diagnóstico profundo de salud
func RunHealthCheck(c *core.Core, component string) error {
	c.Logger.Info("🔬 Iniciando diagnóstico profundo...")
	
	// Verificar integridad de carpetas
	c.Logger.Info("📂 Verificando integridad de directorios...")
	dirs := []string{c.Paths.LogsDir, c.Paths.AppDataDir, c.Paths.BinDir}
	for _, dir := range dirs {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			c.Logger.Warning("❌ Directorio no existe: %s", dir)
		} else {
			c.Logger.Success("✅ %s", dir)
		}
	}
	
	// Ejecutar health check normal
	sm, err := discovery.DiscoverSystem(c.Paths.BinDir)
	if err != nil {
		return fmt.Errorf("error en discovery: %w", err)
	}
	
	status, err := CheckHealth(c, sm)
	if err != nil {
		return fmt.Errorf("error en health check: %w", err)
	}
	
	// Mostrar resultados
	c.Logger.Info("📊 Resultados del diagnóstico:")
	for _, svc := range status.Services {
		if svc.Active {
			c.Logger.Success("✅ %s (puerto %d)", svc.Name, svc.Port)
		} else {
			c.Logger.Warning("❌ %s (puerto %d) - NO DISPONIBLE", svc.Name, svc.Port)
		}
	}
	
	return nil
}

// getActiveProfiles obtiene lista de perfiles activos desde profiles.json
func getActiveProfiles(c *core.Core) []process.ProfileStatus {
	profilesPath := filepath.Join(c.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil {
		 return []process.ProfileStatus{}
	}
	var reg process.ProfileRegistry
	json.Unmarshal(data, &reg)
	return reg.Profiles
}