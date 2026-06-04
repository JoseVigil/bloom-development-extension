package ignition

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// generateLogicalLaunchID genera el ID lógico del launch.
// NO incrementa launch_count — solo lee el valor actual para construir el ID.
// El incremento real ocurre en commitLaunchCount(), que se llama únicamente
// desde Launch() después de que execute() retorna sin error (PID confirmado).
// Esto evita que los retries del worker Temporal corrompan el contador cuando
// la activity falla y Temporal la reintenta con el mismo input.
func (ig *Ignition) generateLogicalLaunchID(profileID string) string {
	shortUUID := profileID
	if len(profileID) > 8 {
		shortUUID = profileID[:8]
	}
	timestamp := time.Now().Format("150405")

	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil {
		ig.Core.Logger.Info("[WARN] generateLogicalLaunchID: no se pudo leer profiles.json: %v", err)
		return fmt.Sprintf("001_%s_%s", shortUUID, timestamp)
	}

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	if err := json.Unmarshal(data, &root); err != nil {
		ig.Core.Logger.Info("[WARN] generateLogicalLaunchID: JSON inválido en profiles.json: %v", err)
		return fmt.Sprintf("001_%s_%s", shortUUID, timestamp)
	}

	// Leer el counter actual SIN incrementarlo.
	// El incremento real se hace en commitLaunchCount() tras éxito confirmado.
	counter := 1
	for _, p := range root.Profiles {
		if p["id"] == profileID {
			if val, ok := p["launch_count"].(float64); ok {
				counter = int(val) + 1
			}
			break
		}
	}

	return fmt.Sprintf("%03d_%s_%s", counter, shortUUID, timestamp)
}

// commitLaunchCount persiste el incremento de launch_count y el last_launch_id
// SOLO tras un launch exitoso. Llamado desde Launch() después de execute() OK.
// Garantiza que los retries de Temporal no incrementan el contador múltiples veces.
func (ig *Ignition) commitLaunchCount(profileID string, launchID string) error {
	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil {
		return fmt.Errorf("no se pudo leer profiles.json: %v", err)
	}

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	if err := json.Unmarshal(data, &root); err != nil {
		return fmt.Errorf("JSON inválido en profiles.json: %v", err)
	}

	found := false
	for i, p := range root.Profiles {
		if p["id"] == profileID {
			counter := 1
			if val, ok := p["launch_count"].(float64); ok {
				counter = int(val) + 1
			}
			root.Profiles[i]["launch_count"] = counter
			root.Profiles[i]["last_launch_id"] = launchID
			found = true
			break
		}
	}

	if !found {
		return fmt.Errorf("perfil %s no encontrado en profiles.json", profileID)
	}

	updatedData, _ := json.MarshalIndent(root, "", "  ")
	if err := os.WriteFile(profilesPath, updatedData, 0644); err != nil {
		return fmt.Errorf("error escribiendo profiles.json: %v", err)
	}

	return nil
}

// prepareSessionFiles genera los archivos de configuración para la sesión
// CRITICAL: Este es el ÚNICO lugar donde se generan los archivos *.synapse.config.js
// Python (Brain) ya NO genera estos archivos - delegación completa a Go
func (ig *Ignition) prepareSessionFiles(profileID string, launchID string, profileData map[string]interface{}, mode string, configOverride string) (map[string]interface{}, error) {
	// === 1. CARGAR Y ACTUALIZAR IGNITION SPEC ===
	specData, err := os.ReadFile(ig.SpecPath)
	if err != nil {
		return nil, fmt.Errorf("no se pudo leer ignition_spec: %v", err)
	}

	var spec IgnitionSpec
	if err := json.Unmarshal(specData, &spec); err != nil {
		return nil, fmt.Errorf("ignition_spec JSON inválido: %v", err)
	}

	spec.LaunchID = launchID
	spec.ProfileID = profileID

	if mode == "landing" {
		spec.TargetURL = fmt.Sprintf("chrome-extension://%s/landing/index.html", ig.Core.Config.Provisioning.ExtensionID)
	} else {
		spec.TargetURL = fmt.Sprintf("chrome-extension://%s/discovery/index.html", ig.Core.Config.Provisioning.ExtensionID)
	}

	// Limpiar siempre el ConfigOverride antes de repoblarlo.
	spec.ConfigOverride = nil

	if configOverride != "" {
		var overridesMap map[string]interface{}
		if err := json.Unmarshal([]byte(configOverride), &overridesMap); err != nil {
			return nil, fmt.Errorf("config-override inválido al poblar spec: %v", err)
		}
		spec.ConfigOverride = overridesMap
		ig.Core.Logger.Info("[IGNITION] 📦 configOverride escrito en ignition_spec.json: %s", configOverride)
	}

	updatedSpec, _ := json.MarshalIndent(spec, "", "  ")
	if err := os.WriteFile(ig.SpecPath, updatedSpec, 0644); err != nil {
		return nil, fmt.Errorf("error escribiendo ignition_spec: %v", err)
	}

	// === 2. CONSTRUIR CONFIGURACIÓN BASE (desde profiles.json) ===
	shortID := profileID
	if len(profileID) > 8 {
		shortID = profileID[:8]
	}
	extDir := spec.Paths.Extension

	// launch_flags agrupa todos los flags del comando launch.
	// El JS (discovery.js / landing.js) los lee desde este nodo.
	launchFlags := map[string]interface{}{
		"register":  getBoolField(profileData, "register", false),
		"heartbeat": getBoolField(profileData, "heartbeat", true),
		"service":   getStringField(profileData, "service", ""),
		"step":      getStringField(profileData, "step", ""),
		"alias":     getStringField(profileData, "alias", "MasterWorker"),
		"role":      getStringField(profileData, "role", "Worker"),
		"email":     getStringField(profileData, "email", ""),
		"extension": ig.Core.Config.Provisioning.ExtensionID,
		"mode":      mode,
	}

	// linked_accounts dentro de launch_flags
	if accounts, ok := profileData["linked_accounts"].([]interface{}); ok {
		launchFlags["linked_accounts"] = accounts
	} else {
		launchFlags["linked_accounts"] = []interface{}{}
	}

	configData := map[string]interface{}{
		"profileId":     profileID,
		"bridge_name":   fmt.Sprintf("com.bloom.synapse.%s", shortID),
		"launchId":      launchID,
		"profile_alias": getStringField(profileData, "alias", "MasterWorker"),
		"mode":          mode,
		"extension_id":  ig.Core.Config.Provisioning.ExtensionID,
		"launch_flags":  launchFlags,
	}

	// === 3. AGREGAR CAMPOS ESPECÍFICOS DE LANDING (desde profiles.json) ===
	if mode == "landing" {
		configData["total_launches"] = getIntField(profileData, "launch_count", 0)
		configData["intents_done"]   = getIntField(profileData, "intents_done", 0)
		configData["uptime"]         = calculateUptime(profileData)
		configData["last_synch"]     = getStringField(profileData, "last_synch", time.Now().Format(time.RFC3339))
		configData["created_at"]     = getStringField(profileData, "created_at", time.Now().Format(time.RFC3339))
		configData["last_launch_at"] = time.Now().Format(time.RFC3339)
	}

	// === 4. APLICAR OVERRIDES ===
	// Los overrides de flags de launch se enrutan dentro de launch_flags.
	// El resto de overrides se aplican en la raíz de configData.
	if configOverride != "" {
		var overrides map[string]interface{}

		if err := json.Unmarshal([]byte(configOverride), &overrides); err != nil {
			return nil, fmt.Errorf("config-override inválido al aplicar: %v", err)
		}

		// Campos que pertenecen a launch_flags
		launchFlagKeys := map[string]bool{
			"register": true, "heartbeat": true, "service": true,
			"step": true, "alias": true, "role": true,
			"email": true, "extension": true, "mode": true,
			"linked_accounts": true,
		}

		for k, v := range overrides {
			if launchFlagKeys[k] {
				launchFlags[k] = v
			} else {
				configData[k] = v
			}
		}

		// Reasignar launch_flags actualizado
		configData["launch_flags"] = launchFlags

		ig.Core.Logger.Info("[IGNITION] 🔧 %d overrides aplicados", len(overrides))
	}

	// === 5. GENERAR ARCHIVO SYNAPSE.CONFIG.JS ===
	configJSON, _ := json.MarshalIndent(configData, "", "  ")
	jsContent := fmt.Sprintf(`self.SYNAPSE_CONFIG = %s;`, string(configJSON))

	configPath := filepath.Join(extDir, fmt.Sprintf("%s.synapse.config.js", mode))
	if err := os.WriteFile(configPath, []byte(jsContent), 0644); err != nil {
		return nil, fmt.Errorf("error escribiendo synapse.config.js: %v", err)
	}

	// === 5.1 VALIDAR QUE EL ARCHIVO SE CREÓ CORRECTAMENTE ===
	if _, err := os.Stat(configPath); err != nil {
		return nil, fmt.Errorf("validación fallida: config no generado correctamente en %s: %v", configPath, err)
	}

	generatedContent, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("validación fallida: no se pudo releer config: %v", err)
	}
	ig.Core.Logger.Info("[IGNITION] ✅ Config generado (%d bytes): %s", len(generatedContent), configPath)

	// === 5.2 ESCRIBIR HARNESS CONFIG (solo perfiles --dev) ===
	profileAlias := getStringField(profileData, "alias", "MasterWorker")
	if err := writeHarnessConfig(profileID, launchID, profileAlias, extDir); err != nil {
		// No fatal — el harness simplemente no tendrá config en esta sesión
		ig.Core.Logger.Info("[WARN] Could not write harness config: %v", err)
	}

	// === 6. ACTUALIZAR NATIVE HOST MANIFEST ===
	manifestName := fmt.Sprintf("com.bloom.synapse.%s.json", shortID)

	configDirRaw, ok := profileData["config_dir"]
	if !ok {
		return nil, fmt.Errorf("campo config_dir ausente en profileData para perfil %s", profileID)
	}
	configDir, ok := configDirRaw.(string)
	if !ok || configDir == "" {
		return nil, fmt.Errorf("campo config_dir inválido en profileData para perfil %s", profileID)
	}

	manifestPath := filepath.Join(configDir, manifestName)

	mData, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("manifiesto nativo ausente: %v", err)
	}

	var manifest map[string]interface{}
	if err := json.Unmarshal(mData, &manifest); err != nil {
		return nil, fmt.Errorf("manifiesto nativo JSON inválido: %v", err)
	}
	manifest["args"] = []string{
		"--profile-id",    profileID,
		"--launch-id",     launchID,
		"--user-base-dir", ig.Core.Paths.AppDataDir,
	}

	updatedManifest, _ := json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(manifestPath, updatedManifest, 0644); err != nil {
		return nil, fmt.Errorf("error escribiendo manifiesto nativo: %v", err)
	}

	// === 6.1 REGISTRAR CLAVE DE WINDOWS ===
	// registerNativeHost es una función multiplataforma definida en:
	//   ignition_registry_windows.go  → implementación real (solo Windows)
	//   ignition_registry_unix.go     → no-op (Darwin / Linux)
	hostName   := fmt.Sprintf("com.bloom.synapse.%s", shortID)
	regKeyPath := `SOFTWARE\Google\Chrome\NativeMessagingHosts\` + hostName

	if err := registerNativeHostHKCU(regKeyPath, manifestPath, ig.Core.Logger); err != nil {
		ig.Core.Logger.Error("[IGNITION] No se pudo registrar HKCU: %v", err)
	} else {
		ig.Core.Logger.Info("[IGNITION] ✅ Registry key registrada en HKCU: %s", regKeyPath)
	}

	// cleanupHKLM elimina la clave HKLM residual si existe.
	// En Darwin/Linux es un no-op (ver ignition_registry_unix.go).
	cleanupHKLM(regKeyPath, ig.Core.Logger)

	ig.Core.Logger.Info("[IGNITION] 🆔 Identidad [%s] inyectada en Spec, JS y Native Host.", launchID)
	ig.Core.Logger.Info("[IGNITION] 📁 Archivos de sesión preparados:")
	ig.Core.Logger.Info("           - ignition_spec.json: ✅")
	ig.Core.Logger.Info("           - %s.synapse.config.js: ✅", mode)
	ig.Core.Logger.Info("           - native host manifest: ✅")

	return configData, nil
}

// updateProfileWithOverrides persiste overrides en profiles.json
func (ig *Ignition) updateProfileWithOverrides(profileID string, overrides map[string]interface{}) error {
	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil {
		return fmt.Errorf("no se pudo leer profiles.json: %v", err)
	}

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	if err := json.Unmarshal(data, &root); err != nil {
		return fmt.Errorf("JSON inválido en profiles.json: %v", err)
	}

	found := false
	for i, p := range root.Profiles {
		if p["id"] == profileID {
			found = true
			for k, v := range overrides {
				fieldName := k
				switch k {
				case "profile_alias":
					fieldName = "alias"
				case "extension_id":
					continue
				}
				root.Profiles[i][fieldName] = v
			}
			root.Profiles[i]["updated_at"] = time.Now().Format(time.RFC3339)
			break
		}
	}

	if !found {
		return fmt.Errorf("perfil %s no encontrado en profiles.json", profileID)
	}

	updatedData, _ := json.MarshalIndent(root, "", "  ")
	if err := os.WriteFile(profilesPath, updatedData, 0644); err != nil {
		return fmt.Errorf("error escribiendo profiles.json: %v", err)
	}

	return nil
}

func (ig *Ignition) getProfileData(profileID string) (map[string]interface{}, error) {
	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil {
		return nil, fmt.Errorf("no se pudo leer profiles.json: %v", err)
	}

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	if err := json.Unmarshal(data, &root); err != nil {
		return nil, fmt.Errorf("JSON inválido en profiles.json: %v", err)
	}

	for _, p := range root.Profiles {
		if p["id"] == profileID {
			return p, nil
		}
	}
	return nil, fmt.Errorf("perfil no registrado: %s", profileID)
}

func (ig *Ignition) updateProfilesConfig(profileID string, physicalID string, debugLog string, netLog string) error {
	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil {
		return err
	}

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	if err := json.Unmarshal(data, &root); err != nil {
		return err
	}

	for i, p := range root.Profiles {
		if p["id"] == profileID {
			root.Profiles[i]["last_physical_id"] = physicalID
			root.Profiles[i]["last_logical_id"]  = ig.Session.LaunchID
			root.Profiles[i]["last_launch_id"]   = ig.Session.LaunchID
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

// writeHarnessConfig escribe harness.synapse.config.json en extensionDir.
//
// Es un no-op silencioso si harness/index.html no existe en extensionDir,
// lo que garantiza que solo actúa en perfiles creados con `sentinel seed --dev`.
//
// El archivo de salida es JSON puro (no JS) para evitar que el Service Worker
// de Chrome lo evalúe con new Function() / eval(), lo que viola la CSP de
// Chrome Extensions ("unsafe-eval" no permitido en Service Workers).
// background.js lo carga con fetch() + JSON.parse(), que es CSP-safe.
//
// No es fatal: un error solo emite Warning y no interrumpe el launch.
func writeHarnessConfig(profileID, launchID, profileAlias, extensionDir string) error {
	// Detección de dev mode: la presencia del archivo harness/index.html
	// es la señal canónica — solo existe en perfiles creados con --dev.
	harnessPage := filepath.Join(extensionDir, "harness", "index.html")
	if _, err := os.Stat(harnessPage); os.IsNotExist(err) {
		// Perfil prod — no-op normal
		return nil
	}

	harnessData := map[string]string{
		"profileId":    profileID,
		"launchId":     launchID,
		"profileAlias": profileAlias,
		"generatedAt":  time.Now().UTC().Format(time.RFC3339),
	}

	configJSON, err := json.MarshalIndent(harnessData, "", "  ")
	if err != nil {
		return fmt.Errorf("error serializando harness config: %v", err)
	}

	configPath := filepath.Join(extensionDir, "harness.synapse.config.json")
	return os.WriteFile(configPath, configJSON, 0644)
}

// ========== HELPER FUNCTIONS ==========

func getBoolField(data map[string]interface{}, field string, defaultValue bool) bool {
	if val, ok := data[field].(bool); ok {
		return val
	}
	return defaultValue
}

func getStringField(data map[string]interface{}, field string, defaultValue string) string {
	if val, ok := data[field].(string); ok {
		return val
	}
	return defaultValue
}

func getIntField(data map[string]interface{}, field string, defaultValue int) int {
	if val, ok := data[field].(float64); ok {
		return int(val)
	}
	return defaultValue
}

func calculateUptime(profileData map[string]interface{}) int {
	createdAtStr := getStringField(profileData, "created_at", "")
	if createdAtStr == "" {
		return 0
	}
	createdAt, err := time.Parse(time.RFC3339, createdAtStr)
	if err != nil {
		return 0
	}
	return int(time.Since(createdAt).Seconds())
}
