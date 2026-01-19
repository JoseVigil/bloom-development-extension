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
	"strings"
	"time"
)

// --- ESTRUCTURAS ---

type ProfileFlags struct {
	EngineFlags []string `json:"engine_flags"`
	CustomFlags []string `json:"custom_flags"`
}

type PathsConfig struct {
	UserData  string `json:"user_data"`
	Extension string `json:"extension"`
	LogsBase  string `json:"logs_base"`
}

type EngineConfig struct {
	Type       string `json:"type"`
	Executable string `json:"executable"`
}

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
}

type LaunchResponse struct {
	Status string `json:"status"`
	Data   struct {
		ProfileID string `json:"profile_id"`
		Launch    struct {
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
	}
}

// --- MÉTODOS CRÍTICOS ---

func (ig *Ignition) Launch(profileID string, mode string) error {
	ig.Core.Logger.Info("[IGNITION] 🚀 Iniciando secuencia para ID: %s", profileID)

	// 1. Intentar resolver la ruta desde profiles.json
	specPath, err := ig.resolveSpecPath(profileID)
	if err != nil {
		ig.Core.Logger.Warning("[IGNITION] El ID %s no está en profiles.json. Verificando ruta física...", profileID)
		ig.SpecPath = filepath.Join(ig.Core.Paths.AppDataDir, "config", "profile", profileID, "ignition_spec.json")
	} else {
		ig.SpecPath = specPath
	}

	ig.Core.Logger.Info("[IGNITION] Buscando Spec en: %s", ig.SpecPath)

	// 2. Validar existencia física del Spec
	if _, err := os.Stat(ig.SpecPath); os.IsNotExist(err) {
		return fmt.Errorf("error crítico: El Spec no existe en %s. Verifica el ID", ig.SpecPath)
	}

	// 3. Preparación
	ig.preFlight(profileID)
	ig.Telemetry.Setup()

	if err := ig.prepareExtension(profileID); err != nil {
		return err
	}

	if err := ig.startBrainService(); err != nil {
		return err
	}

	// 4. Lanzamiento (Python)
	launchID, err := ig.execute(profileID)
	if err != nil {
		return err
	}
	ig.Session.LaunchID = launchID // Guardamos el ID de sesión para el análisis

	// 5. Handshake
	ig.Telemetry.StartTailing(profileID, launchID)

	ig.Core.Logger.Info("[IGNITION] Esperando validación LATE_BINDING_SUCCESS...")
	select {
	case <-ig.Telemetry.SuccessChan:
		ig.Core.Logger.Success("[IGNITION] 🔥 Handshake confirmado. ÉXITO.")
		
		// --- DISPARO AUTOMÁTICO DE ANÁLISIS ---
		ig.startPostLaunchAnalysis(profileID, launchID)
		
		return nil
	case <-time.After(20 * time.Second):
		return fmt.Errorf("timeout: La extensión no respondió")
	}
}

func (ig *Ignition) execute(profileID string) (string, error) {
	ig.Core.Logger.Info("[IGNITION] Ejecutando Brain CLI...")

	cmd := exec.Command("brain.exe", "profile", "launch", profileID, "--spec", ig.SpecPath)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")

	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("fallo al iniciar brain.exe: %v", err)
	}

	resChan := make(chan string, 1)
	errChan := make(chan string, 1)

	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.Contains(line, "{") {
				var resp LaunchResponse
				if err := json.Unmarshal([]byte(line[strings.Index(line, "{"):]), &resp); err == nil {
					if resp.Status == "success" {
						ig.Session.BrowserPID = resp.Data.Launch.PID

						// ACTUALIZACIÓN DE PROFILES.JSON CON LOS LOGS
						ig.Core.Logger.Info("[IGNITION] Actualizando logs en profiles.json...")
						_ = ig.updateProfilesConfig(profileID, resp.Data.LogFiles.DebugLog, resp.Data.LogFiles.NetLog)

						resChan <- resp.Data.Launch.LaunchID
						return
					}
				}
			}
		}
	}()

	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			if line != "" {
				ig.Core.Logger.Error("[PYTHON-CRITICAL] %s", line)
				errChan <- line
			}
		}
	}()

	select {
	case lid := <-resChan:
		return lid, nil
	case pyErr := <-errChan:
		return "", fmt.Errorf("Python error: %s", pyErr)
	case <-time.After(12 * time.Second):
		return "", fmt.Errorf("timeout esperando respuesta de Python")
	}
}

// --- MÉTODOS DE ANÁLISIS POST-LANZAMIENTO ---

func (ig *Ignition) startPostLaunchAnalysis(profileID string, launchID string) {
	ig.Core.Logger.Info("[ANALYSIS] 🛡️ Activando centinelas de logs...")

	// 1. Logs de texto: Procesamiento casi inmediato
	go func() {
		time.Sleep(2 * time.Second)
		ig.runAnalysisCommand("read-log", profileID, launchID)
		ig.runAnalysisCommand("mining-log", profileID, launchID)
	}()

	// 2. LOG DE RED: Requiere una espera mucho mayor y es opcional para el éxito
	go func() {
		// Le damos 10 segundos para que Chromium genere suficiente tráfico 
		// y flushee los buffers iniciales al disco.
		time.Sleep(10 * time.Second) 
		ig.Core.Logger.Info("[ANALYSIS] [read-net-log] Intentando captura de tráfico...")
		ig.runAnalysisCommand("read-net-log", profileID, launchID)
	}()
}

func (ig *Ignition) runAnalysisCommand(commandType string, profileID string, launchID string) {
	ig.Core.Logger.Info("[ANALYSIS] [%s] Esperando sincronización de disco...", commandType)

	// 1. ESPERA TÁCTICA: Chromium tarda unos segundos en cerrar los buffers de log.
	// Si leemos muy rápido, el JSON de red estará incompleto.
	time.Sleep(3 * time.Second)

	// 2. Construcción de argumentos con flag --json para SILENCIAR emojis y ruido
	// Usamos --json a nivel global (antes de 'chrome') para forzar salida pura.
	args := []string{"--json", "chrome", commandType, profileID, "--launch-id", launchID}
	
	if commandType == "read-net-log" {
		args = append(args, "--filter-ai")
	}

	cmd := exec.Command("brain.exe", args...)
	
	// 3. BLINDAJE DE ENTORNO: Forzamos modo UTF-8 total en Python
	cmd.Env = append(os.Environ(), 
		"PYTHONIOENCODING=utf-8", 
		"PYTHONUTF8=1", // <--- Fuerza a Python 3.7+ a usar UTF-8 globalmente
	)

	// Ejecutamos
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Si falla, el error vendrá en un JSON limpio gracias al flag --json
		ig.Core.Logger.Error("[ANALYSIS-ERROR] %s: %v", commandType, err)
		return
	}

	// 4. ÉXITO
	ig.Core.Logger.Success("[ANALYSIS-REPORT] %s finalizado para sesión %s", commandType, launchID[:8])
	
	// Solo logueamos el RAW si no está vacío y queremos ver el resultado
	if len(output) > 0 {
		ig.Core.Logger.Info("[%s-RESULT]: %s", commandType, string(output))
	}
}

// --- MÉTODOS DE SOPORTE ---

func (ig *Ignition) resolveSpecPath(profileID string) (string, error) {
	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil { return "", err }

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	if err := json.Unmarshal(data, &root); err != nil { return "", err }

	for _, p := range root.Profiles {
		if id, ok := p["id"].(string); ok && id == profileID {
			if spec, ok := p["spec_path"].(string); ok {
				return spec, nil
			}
		}
	}
	return "", fmt.Errorf("ID no encontrado en profiles.json")
}

func (ig *Ignition) updateProfilesConfig(profileID string, debugLog string, netLog string) error {
	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil { return err }

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	json.Unmarshal(data, &root)

	found := false
	for i, p := range root.Profiles {
		if id, ok := p["id"].(string); ok && id == profileID {
			root.Profiles[i]["log_files"] = map[string]string{
				"debug_log": debugLog,
				"net_log":   netLog,
			}
			found = true
			break
		}
	}

	if !found { return fmt.Errorf("perfil no encontrado para actualizar logs") }
	newData, _ := json.MarshalIndent(root, "", "  ")
	return os.WriteFile(profilesPath, newData, 0644)
}

func (ig *Ignition) prepareExtension(profileID string) error {
	data, err := os.ReadFile(ig.SpecPath)
	if err != nil { return err }
	var spec IgnitionSpec
	json.Unmarshal(data, &spec)
	extDir := spec.Paths.Extension
	if !filepath.IsAbs(extDir) { extDir = filepath.Join(ig.Core.Paths.AppDataDir, extDir) }
	os.MkdirAll(extDir, 0755)
	configPath := filepath.Join(extDir, "synapse.config.js")
	bridgeName := fmt.Sprintf("com.bloom.synapse.%s", profileID[:8])
	content := fmt.Sprintf("self.SYNAPSE_CONFIG = { profileId: '%s', bridge_name: '%s' };", profileID, bridgeName)
	return os.WriteFile(configPath, []byte(content), 0644)
}

func (ig *Ignition) preFlight(profileID string) {
	ig.freePortQuirurgico(5678)
	lock := filepath.Join(ig.Core.Paths.AppDataDir, "profiles", profileID, "SingletonLock")
	os.Remove(lock)
}

func (ig *Ignition) freePortQuirurgico(port int) {
	cmd := exec.Command("cmd", "/C", fmt.Sprintf("netstat -ano | findstr :%d", port))
	out, _ := cmd.Output()
	lines := strings.Split(string(out), "\r\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 5 { continue }
		if fields[4] != "0" && fields[4] != "" {
			exec.Command("taskkill", "/F", "/PID", fields[4], "/T").Run()
		}
	}
	time.Sleep(1 * time.Second)
}

func (ig *Ignition) startBrainService() error {
	cmd := exec.Command("brain.exe", "service", "start")
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	if err := cmd.Start(); err != nil { return err }
	for i := 0; i < 20; i++ {
		conn, _ := net.DialTimeout("tcp", "127.0.0.1:5678", 500*time.Millisecond)
		if conn != nil { conn.Close(); return nil }
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("timeout iniciando brain service")
}