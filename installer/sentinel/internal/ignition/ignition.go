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
		var configOverride string
		cmd := &cobra.Command{
			Use:   "launch [profile_id]",
			Short: "Arranca una instancia de navegador para un perfil",
			Args:  cobra.ExactArgs(1),
			Example: `  sentinel launch profile_001 --mode landing
  sentinel --json launch profile_002 --mode discovery | jq .
  sentinel --json launch profile_003 --mode discovery --config-override '{"register":true,"email":"user@example.com"}'`,
			Run: func(cmd *cobra.Command, args []string) {
				profileID := args[0]
				ig := New(c)
				
				chromePID, port, extLoaded, effectiveConfig, err := ig.Launch(profileID, mode, configOverride)
				if err != nil {
					if c.IsJSON {
						outputLaunchError(err)
					} else {
						c.Logger.Error("Fallo de lanzamiento: %v", err)
					}
					os.Exit(1)
				}
				
				if c.IsJSON {
					outputLaunchJSON(profileID, chromePID, port, extLoaded, effectiveConfig)
					os.Exit(0)
				}
				select {}
			},
		}
		cmd.Flags().StringVar(&mode, "mode", "landing", "Modo de lanzamiento (landing o discovery)")
		cmd.Flags().StringVar(&configOverride, "config-override", "", "JSON para sobrescribir campos en synapse.config.js")

		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["requires"] = `  - El perfil debe existir (usar 'sentinel seed' primero)
  - brain.exe disponible y ejecutable
  - Puerto 5678 libre para servicio Brain
  - Extension ID válido en ignition_spec.json
  - bloom-host.exe en bin/native/ para Native Messaging`

		return cmd
	})
}

func outputLaunchJSON(profileID string, chromePID, port int, extLoaded bool, effectiveConfig map[string]interface{}) {
	result := map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"profile_id":       profileID,
			"chrome_pid":       chromePID,
			"port":             port,
			"extension_loaded": extLoaded,
			"effective_config": effectiveConfig,
		},
	}
	jsonBytes, _ := json.Marshal(result)
	fmt.Println(string(jsonBytes))
}

func outputLaunchError(err error) {
	result := map[string]interface{}{
		"success": false,
		"error":   err.Error(),
	}
	jsonBytes, _ := json.Marshal(result)
	fmt.Println(string(jsonBytes))
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
		Guardians: make(map[string]*health.GuardianInstance),
	}
}

func (ig *Ignition) Launch(profileID string, mode string, configOverride string) (int, int, bool, map[string]interface{}, error) {
	ig.Core.Logger.Info("[IGNITION] 🚀 Iniciando secuencia soberana de lanzamiento (Modo: %s).", mode)

	profileData, err := ig.getProfileData(profileID)
	if err != nil {
		return 0, 0, false, nil, fmt.Errorf("error crítico de inventario: %v", err)
	}

	ig.SpecPath = profileData["spec_path"].(string)
	launchID := ig.generateLogicalLaunchID(profileID)
	ig.Session.LaunchID = launchID

	ig.Core.Logger.Info("[IGNITION] Realizando pre-flight check...")
	ig.preFlight(profileID)

	effectiveConfig, err := ig.prepareSessionFiles(profileID, launchID, profileData, mode, configOverride)
	if err != nil {
		return 0, 0, false, nil, fmt.Errorf("fallo en la inyección de identidad: %v", err)
	}

	ig.Core.Logger.Info("[IGNITION] Sincronizando estados con el sistema de archivos...")
	time.Sleep(800 * time.Millisecond)

	if err := ig.startBrainService(); err != nil {
		return 0, 0, false, nil, err
	}

	finalPhysicalID, err := ig.execute(profileID)
	if err != nil {
		return 0, 0, false, nil, err
	}
	_ = finalPhysicalID

	if ig.Core.IsJSON {
		return ig.Session.BrowserPID, 5678, true, effectiveConfig, nil
	}

	guardian, err := health.NewGuardian(ig.Core, profileID, launchID, ig.Session.ServicePID)
	if err == nil {
		ig.Guardians[profileID] = guardian
		guardian.Start()
		ig.Core.Logger.Info("[IGNITION] 🛡️ Guardian desplegado con éxito.")
	}

	ig.Core.Logger.Success("[IGNITION] 🔥 Sistema en línea.")
	return ig.Session.BrowserPID, 5678, true, effectiveConfig, nil
}

func (ig *Ignition) startBrainService() error {
	ig.Core.Logger.Info("[IGNITION] Levantando servicio base brain.exe...")
	cmd := exec.Command("brain.exe", "service", "start")
	cmd.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8")
	
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("no se pudo ejecutar brain.exe: %v", err)
	}

	ig.Session.ServicePID = cmd.Process.Pid

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

	updatedData, _ := json.MarshalIndent(root, "", "  ")
	_ = os.WriteFile(profilesPath, updatedData, 0644)

	return fmt.Sprintf("%03d_%s_%s", counter, shortUUID, timestamp)
}

func (ig *Ignition) prepareSessionFiles(profileID string, launchID string, profileData map[string]interface{}, mode string, configOverride string) (map[string]interface{}, error) {
	specData, err := os.ReadFile(ig.SpecPath)
	if err != nil { 
		return nil, fmt.Errorf("no se pudo leer ignition_spec: %v", err) 
	}
	
	var spec IgnitionSpec
	if err := json.Unmarshal(specData, &spec); err != nil { 
		return nil, err 
	}
	
	spec.LaunchID = launchID
	spec.ProfileID = profileID
	
	if mode == "landing" {
		spec.TargetURL = fmt.Sprintf("chrome-extension://%s/landing/index.html", ig.Core.Config.Provisioning.ExtensionID)
	} else {
		spec.TargetURL = fmt.Sprintf("chrome-extension://%s/discovery/index.html", ig.Core.Config.Provisioning.ExtensionID)
	}
	
	updatedSpec, _ := json.MarshalIndent(spec, "", "  ")
	if err := os.WriteFile(ig.SpecPath, updatedSpec, 0644); err != nil { 
		return nil, err 
	}

	// ========== CONFIG BUILDER ==========
	shortID := profileID[:8]
	extDir := spec.Paths.Extension
	
	// Base config
	configData := map[string]interface{}{
		"profileId":    profileID,
		"bridge_name":  fmt.Sprintf("com.bloom.synapse.%s", shortID),
		"launchId":     launchID,
		"profile_alias": profileData["alias"].(string),
		"mode":         mode,
		"extension_id": ig.Core.Config.Provisioning.ExtensionID,
	}
	
	// Merge override JSON
	if configOverride != "" {
		var overrides map[string]interface{}
		if err := json.Unmarshal([]byte(configOverride), &overrides); err != nil {
			return nil, fmt.Errorf("config-override inválido: %v", err)
		}
		
		for k, v := range overrides {
			configData[k] = v
		}
		
		ig.Core.Logger.Info("[IGNITION] 🔧 Config override aplicado: %d campos modificados", len(overrides))
	}
	
	// Serialize to JS
	configJSON, _ := json.MarshalIndent(configData, "    ", "  ")
	
	var jsContent string
	if mode == "discovery" {
		jsContent = fmt.Sprintf(`export const SYNAPSE_CONFIG = %s;`, string(configJSON))
	} else {
		jsContent = fmt.Sprintf(`self.SYNAPSE_CONFIG = %s;`, string(configJSON))
	}
	
	configPath := filepath.Join(extDir, fmt.Sprintf("%s.synapse.config.js", mode))
	if err := os.WriteFile(configPath, []byte(jsContent), 0644); err != nil {
		return nil, fmt.Errorf("error escribiendo synapse.config.js: %v", err)
	}

	// Native manifest update
	manifestName := fmt.Sprintf("com.bloom.synapse.%s.json", shortID)
	manifestPath := filepath.Join(profileData["config_dir"].(string), manifestName)

	mData, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("manifiesto nativo ausente en carpeta config: %v", err)
	}

	var manifest map[string]interface{}
	json.Unmarshal(mData, &manifest)
	manifest["args"] = []string{"--profile-id", profileID, "--launch-id", launchID}

	updatedManifest, _ := json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(manifestPath, updatedManifest, 0644); err != nil {
		return nil, err
	}

	ig.Core.Logger.Info("[IGNITION] 🆔 Identidad [%s] inyectada en Spec, JS y Native Host.", launchID)
	return configData, nil
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
			root.Profiles[i]["last_logical_id"] = ig.Session.LaunchID
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
	ig.freePortQuirurgico(5678)
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
		if fields[4] != "0" && fields[4] != "" {
			_ = exec.Command("taskkill", "/F", "/PID", fields[4], "/T").Run()
		}
	}
	time.Sleep(1 * time.Second)
}