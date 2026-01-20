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
	LaunchID    string   `json:"launch_id"`  // Dinámico
	ProfileID   string   `json:"profile_id"` // Dinámico
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

// --- MÉTODOS DE CICLO DE VIDA ---

func (ig *Ignition) Launch(profileID string, mode string) error {
	ig.Core.Logger.Info("[IGNITION] 🚀 Iniciando secuencia (Static Spec Mode).")

	// 1. Obtener datos del perfil desde el registro
	profileData, err := ig.getProfileData(profileID)
	if err != nil {
		return fmt.Errorf("error obteniendo datos del perfil: %v", err)
	}

	ig.SpecPath = profileData["spec_path"].(string)

	// 2. GENERAR EL ID DE LANZAMIENTO LÓGICO
	// Formato: 00X_shortuuid_shorttimestamp
	launchID := ig.generateLogicalLaunchID(profileID)
	ig.Session.LaunchID = launchID

	// 3. Pre-flight y Limpieza
	ig.preFlight(profileID)
	ig.Telemetry.Setup()

	// 4. PREPARACIÓN MULTI-ARCHIVO (Inyección de ID en Spec, JS y Manifest)
	if err := ig.prepareSessionFiles(profileID, launchID, profileData); err != nil {
		return err
	}

	// ============================================================
	// ⚡ FIX CRÍTICO: RESPIRO DE SINCRONIZACIÓN
	// Le damos tiempo al SO para persistir los archivos y a Chrome 
	// para que no use versiones en caché del manifiesto JSON.
	// ============================================================
	ig.Core.Logger.Info("[IGNITION] Sincronizando archivos con el sistema...")
	time.Sleep(800 * time.Millisecond) 
	// ============================================================

	// 5. Brain Service
	if err := ig.startBrainService(); err != nil {
		return err
	}

	// 6. Lanzamiento
	finalID, err := ig.execute(profileID)
	if err != nil {
		return err
	}

	// 7. Telemetría
	ig.Telemetry.StartTailing(profileID, finalID)

	ig.Core.Logger.Info("[IGNITION] Esperando validación LATE_BINDING_SUCCESS...")
	select {
	case <-ig.Telemetry.SuccessChan:
		ig.Core.Logger.Success("[IGNITION] 🔥 Handshake confirmado. ÉXITO.")
		ig.startPostLaunchAnalysis(profileID, finalID)
		return nil
	case <-time.After(20 * time.Second):
		return fmt.Errorf("timeout: La extensión no respondió")
	}
}

// --- ALGORITMO DE GENERACIÓN DE ID ---

func (ig *Ignition) generateLogicalLaunchID(profileID string) string {
	shortUUID := profileID[:8]
	timestamp := time.Now().Format("150405") // HHMMSS

	// 1. Leer profiles.json para manejar el contador
	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, _ := os.ReadFile(profilesPath)

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	json.Unmarshal(data, &root)

	counter := 1
	for i, p := range root.Profiles {
		if p["id"] == profileID {
			// Si existe un launch_count, incrementarlo
			if val, ok := p["launch_count"].(float64); ok {
				counter = int(val) + 1
			}
			root.Profiles[i]["launch_count"] = counter
			break
		}
	}

	// Guardar el nuevo contador
	updatedData, _ := json.MarshalIndent(root, "", "  ")
	_ = os.WriteFile(profilesPath, updatedData, 0644)

	return fmt.Sprintf("%03d_%s_%s", counter, shortUUID, timestamp)
}

// --- PREPARACIÓN DE ARCHIVOS DE SESIÓN ---

func (ig *Ignition) prepareSessionFiles(profileID string, launchID string, profileData map[string]interface{}) error {
	// 1. ACTUALIZAR IGNITION_SPEC.JSON
	specData, err := os.ReadFile(ig.SpecPath)
	if err != nil {
		return fmt.Errorf("no se pudo leer el spec: %v", err)
	}

	var spec IgnitionSpec
	json.Unmarshal(specData, &spec)
	spec.LaunchID = launchID
	spec.ProfileID = profileID
	updatedSpec, _ := json.MarshalIndent(spec, "", "  ")
	_ = os.WriteFile(ig.SpecPath, updatedSpec, 0644)

	// 2. ACTUALIZAR SYNAPSE.CONFIG.JS
	shortID := profileID[:8]
	extDir := spec.Paths.Extension
	if !filepath.IsAbs(extDir) {
		extDir = filepath.Join(ig.Core.Paths.AppDataDir, extDir)
	}

	configPath := filepath.Join(extDir, "synapse.config.js")
	alias := profileData["alias"].(string)
	extID := "hpblclepliicmihaplldignhjdggnkdh" // Estándar de la extensión

	jsContent := fmt.Sprintf(`self.SYNAPSE_CONFIG = { 
    profileId: '%s', 
    bridge_name: 'com.bloom.synapse.%s',
    launchId: "%s",
    profile_alias: "%s",
    extension_id: "%s"
};`, profileID, shortID, launchID, alias, extID)

	_ = os.WriteFile(configPath, []byte(jsContent), 0644)

	// 3. ACTUALIZAR COM.BLOOM.SYNAPSE.{SHORTID}.JSON (Manifiesto de Host)
	manifestName := fmt.Sprintf("com.bloom.synapse.%s.json", shortID)
	manifestPath := filepath.Join(ig.Core.Paths.AppDataDir, "profiles", profileID, "synapse", manifestName)

	if mData, err := os.ReadFile(manifestPath); err == nil {
		var manifest map[string]interface{}
		json.Unmarshal(mData, &manifest)

		// Actualizar argumentos
		args := []string{"--profile-id", profileID, "--launch-id", launchID}
		manifest["args"] = args

		updatedManifest, _ := json.MarshalIndent(manifest, "", "  ")
		_ = os.WriteFile(manifestPath, updatedManifest, 0644)
	}

	ig.Core.Logger.Info("[IGNITION] Sesión preparada: Archivos de configuración sincronizados.")
	return nil
}

// --- MÉTODOS DE APOYO ---

func (ig *Ignition) execute(profileID string) (string, error) {
	cmd := exec.Command("brain.exe", "profile", "launch", profileID, "--spec", ig.SpecPath)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")

	stdout, _ := cmd.StdoutPipe()
	if err := cmd.Start(); err != nil {
		return "", err
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
						_ = ig.updateProfilesConfig(profileID, resp.Data.LogFiles.DebugLog, resp.Data.LogFiles.NetLog)
						resChan <- resp.Data.Launch.LaunchID
						return
					}
				}
			}
		}
	}()

	select {
	case lid := <-resChan:
		return lid, nil
	case <-time.After(12 * time.Second):
		return "", fmt.Errorf("timeout esperando respuesta de Python")
	}
}

func (ig *Ignition) getProfileData(profileID string) (map[string]interface{}, error) {
	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil {
		return nil, err
	}

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	json.Unmarshal(data, &root)

	for _, p := range root.Profiles {
		if p["id"] == profileID {
			return p, nil
		}
	}
	return nil, fmt.Errorf("perfil no encontrado en el registro")
}

func (ig *Ignition) updateProfilesConfig(profileID string, debugLog string, netLog string) error {
	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil {
		return err
	}

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	json.Unmarshal(data, &root)

	for i, p := range root.Profiles {
		if p["id"] == profileID {
			root.Profiles[i]["log_files"] = map[string]string{
				"debug_log": debugLog,
				"net_log":   netLog,
			}
			break
		}
	}
	newData, _ := json.MarshalIndent(root, "", "  ")
	return os.WriteFile(profilesPath, newData, 0644)
}

// startPostLaunchAnalysis, preFlight, freePortQuirurgico y startBrainService se mantienen igual que en la versión anterior...
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
		if len(fields) < 5 {
			continue
		}
		if fields[4] != "0" && fields[4] != "" {
			_ = exec.Command("taskkill", "/F", "/PID", fields[4], "/T").Run()
		}
	}
	time.Sleep(1 * time.Second)
}

func (ig *Ignition) startBrainService() error {
	cmd := exec.Command("brain.exe", "service", "start")
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	if err := cmd.Start(); err != nil {
		return err
	}
	for i := 0; i < 15; i++ {
		conn, _ := net.DialTimeout("tcp", "127.0.0.1:5678", 500*time.Millisecond)
		if conn != nil {
			conn.Close()
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("timeout iniciando brain service")
}