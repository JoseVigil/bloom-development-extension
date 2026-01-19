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

// Estructuras de Configuración
type ProfileFlags struct {
	EngineFlags []string `json:"engine_flags"`
	CustomFlags []string `json:"custom_flags"`
}

type PathsConfig struct {
	UserData   string `json:"user_data"`
	Extension  string `json:"extension"`
	LogsBase   string `json:"logs_base"`
}

type EngineConfig struct {
	Type       string `json:"type"`
	Executable string `json:"executable"`
}

type IgnitionSpec struct {
	Paths       PathsConfig  `json:"paths"`
	Engine      EngineConfig `json:"engine"` 
	TargetURL   string       `json:"target_url"`
	EngineFlags []string     `json:"engine_flags"`
	CustomFlags []string     `json:"custom_flags"`
}

type LaunchResponse struct {
	Status string `json:"status"`
	Data   struct {
		ProfileID string `json:"profile_id"`
		Launch    struct {
			LaunchID string `json:"launch_id"`
			PID      int    `json:"pid"`
		} `json:"launch"`
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

// Launch orquesta la secuencia crítica
func (ig *Ignition) Launch(profileID string, mode string) error {
	ig.Core.Logger.Info("[IGNITION] 🚀 Iniciando secuencia (Static Spec Mode).")
	
	// 1. Localizar el Spec pre-existente (Creado por Electron/Create)
	// Ruta: AppData/Local/BloomNucleus/config/profile/{ID}/ignition_spec.json
	ig.SpecPath = filepath.Join(ig.Core.Paths.AppDataDir, "config", "profile", profileID, "ignition_spec.json")

	// Validar que el archivo existe antes de seguir
	if _, err := os.Stat(ig.SpecPath); os.IsNotExist(err) {
		return fmt.Errorf("error crítico: El Spec no existe en %s. Electron falló en la creación", ig.SpecPath)
	}

	// 2. Pre-flight y Limpieza de Telemetría
	ig.preFlight(profileID)
	ig.Telemetry.Setup()

	// 3. !!! EL PASO CLAVE: INYECTAR EN LA RUTA QUE DICE EL SPEC !!!
	// Leemos el Spec para saber dónde Electron puso la extensión
	if err := ig.prepareExtension(profileID); err != nil {
		return err
	}

	// 4. Levantar Brain Service
	if err := ig.startBrainService(); err != nil {
		return err
	}

	// 5. Lanzar (Pasando la ruta del Spec estático a Python)
	launchID, err := ig.execute(profileID)
	if err != nil {
		return err
	}

	// 6. Tailing y Handshake
	ig.Telemetry.StartTailing(profileID, launchID)

	ig.Core.Logger.Info("[IGNITION] Esperando validación LATE_BINDING_SUCCESS...")
	select {
	case <-ig.Telemetry.SuccessChan:
		ig.Core.Logger.Success("[IGNITION] 🔥 Handshake confirmado. ÉXITO.")
		return nil
	case <-time.After(20 * time.Second):
		return fmt.Errorf("timeout: La extensión no respondió. Revisa logs en AppData/logs/profiles/%s", profileID)
	}
}

// prepareExtension lee el Spec para inyectar el config en el lugar correcto
func (ig *Ignition) prepareExtension(profileID string) error {
	// Leemos el JSON que Electron nos dejó
	data, err := os.ReadFile(ig.SpecPath)
	if err != nil { return err }

	var spec IgnitionSpec
	json.Unmarshal(data, &spec)

	// La ruta de la extensión ahora viene del Spec estático
	// Nota: Python y Go deben resolver esto contra la misma base (AppData)
	appData := ig.Core.Paths.AppDataDir
	extDir := filepath.Join(appData, spec.Paths.Extension)
	
	os.MkdirAll(extDir, 0755)
	
	// Inyectar synapse.config.js
	configPath := filepath.Join(extDir, "synapse.config.js")
	bridgeName := fmt.Sprintf("com.bloom.synapse.%s", profileID[:8])
	content := fmt.Sprintf("self.SYNAPSE_CONFIG = { profileId: '%s', bridge_name: '%s' };", profileID, bridgeName)
	
	ig.Core.Logger.Info("[IGNITION] Inyectando config en: %s", extDir)
	return os.WriteFile(configPath, []byte(content), 0644)
}

func (ig *Ignition) execute(profileID string) (string, error) {
	ig.Core.Logger.Info("[IGNITION] Disparando Brain CLI (Debug Mode)...")
	
	cmd := exec.Command("brain.exe", "profile", "launch", profileID, "--spec", ig.SpecPath)
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	
	// CAPTURAMOS AMBOS: Salida normal y Errores
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe() // <--- NUEVO: Queremos ver el crash de Python

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("error fatal al iniciar brain.exe: %v", err)
	}

	resChan := make(chan string, 1)
	errChan := make(chan string, 1)

	// Goroutine 1: Escanear JSON de éxito
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			line := scanner.Text()
			if strings.Contains(line, "{") {
				var resp LaunchResponse
				if err := json.Unmarshal([]byte(line[strings.Index(line, "{"):]), &resp); err == nil {
					if resp.Status == "success" {
						ig.Session.BrowserPID = resp.Data.Launch.PID
						resChan <- resp.Data.Launch.LaunchID
						return
					}
				}
			}
		}
	}()

	// Goroutine 2: Escanear errores de Python (Tracebacks)
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
		return "", fmt.Errorf("Python crasheó: %s", pyErr)
	case <-time.After(8 * time.Second):
		return "", fmt.Errorf("timeout: Python no respondió (posible crash silencioso)")
	}
}

func (ig *Ignition) forceExtensionConfig(profileID string) error {
	extDir := filepath.Join(ig.Core.Paths.AppDataDir, "profiles", profileID, "extension")
	os.MkdirAll(extDir, 0755)
	
	configPath := filepath.Join(extDir, "synapse.config.js")
	bridgeName := fmt.Sprintf("com.bloom.synapse.%s", profileID[:8])
	
	content := fmt.Sprintf("self.SYNAPSE_CONFIG = { profileId: '%s', bridge_name: '%s' };", profileID, bridgeName)
	
	ig.Core.Logger.Info("[IGNITION] Configuración de extensión inyectada.")
	return os.WriteFile(configPath, []byte(content), 0644)
}

func (ig *Ignition) preFlight(profileID string) {
	ig.Core.Logger.Info("[IGNITION] Pre-flight: Liberando recursos...")
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
		pidStr := fields[4]
		if pidStr != "0" && pidStr != "" {
			ig.Core.Logger.Warning("[IGNITION] Limpiando puerto %d (PID: %s)", port, pidStr)
			exec.Command("taskkill", "/F", "/PID", pidStr, "/T").Run()
		}
	}
	time.Sleep(1 * time.Second)
}

func (ig *Ignition) startBrainService() error {
	cmd := exec.Command("brain.exe", "service", "start")
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("no se pudo iniciar brain service: %v", err)
	}
	ig.Session.ServicePID = cmd.Process.Pid
	
	for i := 0; i < 20; i++ {
		conn, _ := net.DialTimeout("tcp", "127.0.0.1:5678", 500*time.Millisecond)
		if conn != nil {
			conn.Close()
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("timeout: brain service no responde")
}

func (ig *Ignition) loadProfileFlags(profileID string) ProfileFlags {
	synapseDir := filepath.Join(ig.Core.Paths.AppDataDir, "profiles", profileID, "synapse")
	flagsPath := filepath.Join(synapseDir, "profile_flags.json")

	defaults := ProfileFlags{
		EngineFlags: []string{"--no-sandbox", "--test-type", "--disable-web-security", "--disable-features=IsolateOrigins,site-per-process", "--remote-debugging-port=0", "--no-first-run", "--enable-logging", "--v=1", "--disable-blink-features=AutomationControlled"},
		CustomFlags: []string{},
	}

	if _, err := os.Stat(flagsPath); os.IsNotExist(err) {
		data, _ := json.MarshalIndent(defaults, "", "  ")
		os.WriteFile(flagsPath, data, 0644)
		return defaults
	}

	data, _ := os.ReadFile(flagsPath)
	var config ProfileFlags
	json.Unmarshal(data, &config)
	return config
}

func (ig *Ignition) generateSpec(profileID string, mode string) error {
	synapseDir := filepath.Join(ig.Core.Paths.AppDataDir, "profiles", profileID, "synapse")
	os.MkdirAll(synapseDir, 0755)
	ig.SpecPath = filepath.Join(synapseDir, "ignition_spec.json")

	config := ig.loadProfileFlags(profileID)
	extID := "hpblclepliicmihaplldignhjdggnkdh"
	
	targetURL := fmt.Sprintf("chrome-extension://%s/landing/index.html", extID)
	if mode == "--discovery" {
		targetURL = fmt.Sprintf("chrome-extension://%s/discovery/index.html", extID)
	}

	// 1. Definir Motor y Ruta (Aquí puedes luego conectar tu .env)
	engineType := "chromium" 
	exePath := "bin/chrome-win/chrome.exe"

	// 2. Construir el Spec Prístino
	spec := IgnitionSpec{
		Paths: PathsConfig{
			UserData:  fmt.Sprintf("profiles/%s", profileID),
			Extension: fmt.Sprintf("profiles/%s/extension", profileID),
			LogsBase:  fmt.Sprintf("logs/profiles/%s", profileID),
		},
		Engine: EngineConfig{
			Type:       engineType,
			Executable: exePath,
		},
		TargetURL:   targetURL,
		EngineFlags: config.EngineFlags,
		CustomFlags: config.CustomFlags,
	}

	data, _ := json.MarshalIndent(spec, "", "  ")
	ig.Core.Logger.Info("[IGNITION] Spec generado: Motor=%s, URL=%s", engineType, targetURL[:20]+"...")
	return os.WriteFile(ig.SpecPath, data, 0644)
}