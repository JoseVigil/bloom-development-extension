package ignition

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sentinel/internal/core"
	"sentinel/internal/health"
	"strings"
	"time"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("RUNTIME", func(c *core.Core) *cobra.Command {
		var mode string
		cmd := &cobra.Command{
			Use:   "launch [profile_id]",
			Short: "Arranca una instancia de navegador para un perfil",
			Args:  cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				profileID := args[0]
				ig := New(c)
				ig.SetupReaper()
				if err := ig.Launch(profileID, mode); err != nil {
					c.Logger.Error("Fallo de lanzamiento: %v", err)
					os.Exit(1)
				}
				select {} // Bloqueo para telemetría
			},
		}
		// Definimos el flag para el modo cockpit o discovery
		cmd.Flags().StringVar(&mode, "mode", "--cockpit", "Modo de lanzamiento (--cockpit o --discovery)")
		return cmd
	})
}

// --- ESTRUCTURAS ---

type IgnitionSpec struct {
	Engine struct {
		Executable string `json:"executable"`
		Type       string `json:"type"`
	} `json:"engine"`
	EngineFlags []string `json:"engine_flags"`
	Paths       struct {
		Extension string `json:"extension"`
		LogsBase  string `json:"logs_base"`
		UserData  string `json:"user_data"`
	} `json:"paths"`
	TargetURL   string   `json:"target_url"`
	CustomFlags []string `json:"custom_flags"`
	LaunchID    string   `json:"launch_id"`  
	ProfileID   string   `json:"profile_id"` 
}

type LaunchResponse struct {
	Status string `json:"status"`
	Data   struct {
		ProfileID string `json:"profile_id"`
		Launch struct {
			LaunchID string `json:"launch_id"`
			PID      int    `json:"pid"`
		} `json:"launch"`
		LogFiles struct {
			DebugLog string `json:"debug_log"`
			NetLog   string `json:"net_log"`
		} `json:"log_files"`
	} `json:"data"`
}

type Ignition struct {
	Core      *core.Core
	Telemetry *TelemetryHub
	Guardians map[string]*health.GuardianInstance
	SpecPath  string
	Session   struct {
		ServicePID int
		BrowserPID int
		LaunchID   string
	}
}

func New(c *core.Core) *Ignition {
	return &Ignition{
		Core:      c,
		Telemetry: NewTelemetryHub(c),
		Guardians: make(map[string]*health.GuardianInstance),
	}
}

// --- MÉTODOS DE CICLO DE VIDA ---

func (ig *Ignition) Launch(profileID string, mode string) error {
	ig.Core.Logger.Info("[IGNITION] 🚀 Iniciando secuencia soberana de lanzamiento (Modo: %s).", mode)

	// 1. Obtener datos del perfil desde el inventario centralizado
	profileData, err := ig.getProfileData(profileID)
	if err != nil {
		return fmt.Errorf("error crítico de inventario: %v", err)
	}

	ig.SpecPath = profileData["spec_path"].(string)

	// 2. Generar Identidad Lógica de Sesión (Contador + ShortID + Time)
	launchID := ig.generateLogicalLaunchID(profileID)
	ig.Session.LaunchID = launchID

	// 3. Pre-flight: Limpieza quirúrgica de entorno
	ig.Core.Logger.Info("[IGNITION] Realizando pre-flight check...")
	ig.preFlight(profileID)
	
	// 4. Inicializar Hub de Telemetría
	ig.Telemetry.Setup()

	// 5. INYECCIÓN DE IDENTIDAD (Spec, JS Config y Manifiesto Nativo)
	// Aquí aplicamos el AJUSTE CRÍTICO de URL de Landing
	if err := ig.prepareSessionFiles(profileID, launchID, profileData, mode); err != nil {
		return fmt.Errorf("fallo en la inyección de identidad: %v", err)
	}

	ig.Core.Logger.Info("[IGNITION] Sincronizando estados con el sistema de archivos...")
	time.Sleep(800 * time.Millisecond) 

	// 6. Iniciar Servicio de Soporte (Brain.exe)
	if err := ig.startBrainService(); err != nil {
		return err
	}

	// 7. EJECUCIÓN (Contrato: Go ordena, Python ejecuta)
	finalPhysicalID, err := ig.execute(profileID)
	if err != nil {
		return err
	}

	// 8. DESPLIEGUE DEL GUARDIAN (Monitoreo de PIDs)
	guardian, err := health.NewGuardian(
		ig.Core, 
		profileID, 
		launchID, 
		ig.Session.ServicePID, 
	)
	if err == nil {
		ig.Guardians[profileID] = guardian
		guardian.Start() 
		ig.Core.Logger.Info("[IGNITION] 🛡️ Guardian desplegado con éxito.")
	} else {
		ig.Core.Logger.Error("[IGNITION] Error crítico: No se pudo desplegar el Guardian.")
	}

	// 9. MONITOR DE HANDSHAKE (Fase Crítica de Enlace)
	ig.Telemetry.StartHandshakeMonitor(profileID, launchID)
	ig.Core.Logger.Info("[IGNITION] Esperando validación LATE_BINDING_SUCCESS (Timeout: 20s)...")

	select {
	case <-ig.Telemetry.SuccessChan:
		ig.Core.Logger.Success("[IGNITION] 🔥 HANDSHAKE CONFIRMADO. Sistema en línea.")
		
		// Activar minería de telemetría post-handshake
		ig.Telemetry.StartGranularTelemetry(profileID, launchID)
		
		// Iniciar análisis de logs en segundo plano
		ig.startPostLaunchAnalysis(profileID, finalPhysicalID)
		return nil

	case <-time.After(20 * time.Second):
		return fmt.Errorf("timeout fatal: La extensión no respondió al handshake (ID: %s)", launchID)
	}
}

// --- MÉTODOS DE APOYO Y LOGICA ---

func (ig *Ignition) startBrainService() error {
	ig.Core.Logger.Info("[IGNITION] Levantando servicio base brain.exe...")
	cmd := exec.Command("brain.exe", "service", "start")
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("no se pudo ejecutar brain.exe: %v", err)
	}

	ig.Session.ServicePID = cmd.Process.Pid

	// Esperar disponibilidad del puerto 5678
	for i := 0; i < 15; i++ {
		conn, _ := net.DialTimeout("tcp", "127.0.0.1:5678", 500*time.Millisecond)
		if conn != nil {
			conn.Close()
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("timeout: el servicio brain.exe no respondió en el puerto 5678")
}

func (ig *Ignition) generateLogicalLaunchID(profileID string) string {
	shortUUID := profileID[:8]
	timestamp := time.Now().Format("150405")

	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, _ := os.ReadFile(profilesPath)

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	json.Unmarshal(data, &root)

	counter := 1
	for i, p := range root.Profiles {
		if p["id"] == profileID {
			if val, ok := p["launch_count"].(float64); ok {
				counter = int(val) + 1
			}
			root.Profiles[i]["launch_count"] = counter
			break
		}
	}

	// Persistir el contador inmediatamente
	updatedData, _ := json.MarshalIndent(root, "", "  ")
	_ = os.WriteFile(profilesPath, updatedData, 0644)

	return fmt.Sprintf("%03d_%s_%s", counter, shortUUID, timestamp)
}

func (ig *Ignition) prepareSessionFiles(profileID string, launchID string, profileData map[string]interface{}, mode string) error {
	// 1. ACTUALIZAR IGNITION_SPEC.JSON
	specData, err := os.ReadFile(ig.SpecPath)
	if err != nil { return fmt.Errorf("no se pudo leer ignition_spec: %v", err) }
	
	var spec IgnitionSpec
	if err := json.Unmarshal(specData, &spec); err != nil { return err }
	
	spec.LaunchID = launchID
	spec.ProfileID = profileID
	
	// AJUSTE CRÍTICO 2: URL de Landing Dinámica
	if mode == "landing" {
		spec.TargetURL = fmt.Sprintf("chrome-extension://%s/landing/index.html", ig.Core.Config.Provisioning.ExtensionID)
	} else {
		spec.TargetURL = fmt.Sprintf("chrome-extension://%s/discovery/index.html", ig.Core.Config.Provisioning.ExtensionID)
	}
	
	updatedSpec, _ := json.MarshalIndent(spec, "", "  ")
	if err := os.WriteFile(ig.SpecPath, updatedSpec, 0644); err != nil { return err }

	// 2. ACTUALIZAR SYNAPSE.CONFIG.JS (Identidad para el Frontend)
	shortID := profileID[:8]
	extDir := spec.Paths.Extension
	configPath := filepath.Join(extDir, "synapse.config.js")
	jsContent := fmt.Sprintf(`self.SYNAPSE_CONFIG = { 
    profileId: '%s', 
    bridge_name: 'com.bloom.synapse.%s',
    launchId: "%s",
    profile_alias: "%s",
    mode: "%s",
    extension_id: "%s"
};`, profileID, shortID, launchID, profileData["alias"].(string), mode, ig.Core.Config.Provisioning.ExtensionID)
	
	if err := os.WriteFile(configPath, []byte(jsContent), 0644); err != nil {
		return fmt.Errorf("error escribiendo synapse.config.js: %v", err)
	}

	// 3. ACTUALIZAR MANIFIESTO NATIVO (Sincronización de Bridge)
	manifestName := fmt.Sprintf("com.bloom.synapse.%s.json", shortID)
	manifestPath := filepath.Join(profileData["config_dir"].(string), manifestName)

	mData, err := os.ReadFile(manifestPath)
	if err != nil {
		return fmt.Errorf("manifiesto nativo ausente en carpeta config: %v", err)
	}

	var manifest map[string]interface{}
	json.Unmarshal(mData, &manifest)
	
	// Actualizar argumentos para que el Bridge C++ envíe el LaunchID correcto
	manifest["args"] = []string{"--profile-id", profileID, "--launch-id", launchID}

	updatedManifest, _ := json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(manifestPath, updatedManifest, 0644); err != nil {
		return err
	}

	ig.Core.Logger.Info("[IGNITION] 🆔 Identidad [%s] inyectada en Spec, JS y Native Host.", launchID)
	return nil
}

func (ig *Ignition) execute(profileID string) (string, error) {
	ig.Core.Logger.Info("[IGNITION] Ejecutando orden de lanzamiento en engine...")
	cmd := exec.Command("brain.exe", "profile", "launch", profileID, "--spec", ig.SpecPath)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")

	stdout, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("fallo al invocar el engine: %v", err)
	}

	resChan := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if idx := strings.Index(line, "{"); idx != -1 {
				var resp LaunchResponse
				if err := json.Unmarshal([]byte(line[idx:]), &resp); err == nil {
					if resp.Status == "success" {
						ig.Session.BrowserPID = resp.Data.Launch.PID
						_ = ig.updateProfilesConfig(profileID, resp.Data.Launch.LaunchID, resp.Data.LogFiles.DebugLog, resp.Data.LogFiles.NetLog)
						resChan <- resp.Data.Launch.LaunchID
						return
					}
				}
			}
		}
	}()

	select {
	case physicalID := <-resChan:
		return physicalID, nil
	case <-time.After(12 * time.Second):
		return "", fmt.Errorf("timeout: brain.exe no devolvió confirmación de lanzamiento")
	}
}

func (ig *Ignition) getProfileData(profileID string) (map[string]interface{}, error) {
	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil { return nil, err }

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	if err := json.Unmarshal(data, &root); err != nil { return nil, err }

	for _, p := range root.Profiles {
		if p["id"] == profileID { return p, nil }
	}
	return nil, fmt.Errorf("perfil no registrado")
}

func (ig *Ignition) updateProfilesConfig(profileID string, physicalID string, debugLog string, netLog string) error {
	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil { return err }

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	json.Unmarshal(data, &root)

	for i, p := range root.Profiles {
		if p["id"] == profileID {
			root.Profiles[i]["last_physical_id"] = physicalID        
			root.Profiles[i]["last_logical_id"]  = ig.Session.LaunchID 
			root.Profiles[i]["log_files"] = map[string]string{
				"debug_log": debugLog,
				"net_log":   netLog,
			}
			break
		}
	}

	updatedData, _ := json.MarshalIndent(root, "", "  ")
	return os.WriteFile(profilesPath, updatedData, 0644)
}

func (ig *Ignition) startPostLaunchAnalysis(profileID string, launchID string) {
	go func() {
		time.Sleep(2 * time.Second)
		ig.runAnalysisCommand("read-log", profileID, launchID)
		ig.runAnalysisCommand("mining-log", profileID, launchID)
	}()
	go func() {
		time.Sleep(10 * time.Second)
		ig.runAnalysisCommand("read-net-log", profileID, launchID)
	}()
}

func (ig *Ignition) runAnalysisCommand(commandType string, profileID string, launchID string) {
	args := []string{"--json", "chrome", commandType, profileID, "--launch-id", launchID}
	if commandType == "read-net-log" {
		args = append(args, "--filter-ai")
	}
	cmd := exec.Command("brain.exe", args...)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUTF8=1")
	_, _ = cmd.CombinedOutput()
}

func (ig *Ignition) preFlight(profileID string) {
	// 1. Liberar puerto del servicio
	ig.freePortQuirurgico(5678)
	
	// 2. Eliminar lock de instancia de Chrome
	lock := filepath.Join(ig.Core.Paths.ProfilesDir, profileID, "SingletonLock")
	if _, err := os.Stat(lock); err == nil {
		_ = os.Remove(lock)
		ig.Core.Logger.Info("[IGNITION] SingletonLock eliminado.")
	}
}

func (ig *Ignition) freePortQuirurgico(port int) {
	cmd := exec.Command("cmd", "/C", fmt.Sprintf("netstat -ano | findstr :%d", port))
	out, _ := cmd.Output()
	lines := strings.Split(string(out), "\r\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 5 { continue }
		// taskkill /F /PID {pid} /T
		if fields[4] != "0" && fields[4] != "" {
			_ = exec.Command("taskkill", "/F", "/PID", fields[4], "/T").Run()
		}
	}
	time.Sleep(1 * time.Second)
}