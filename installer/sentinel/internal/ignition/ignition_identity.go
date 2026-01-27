package ignition

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

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
		"profileId":     profileID,
		"bridge_name":   fmt.Sprintf("com.bloom.synapse.%s", shortID),
		"launchId":      launchID,
		"profile_alias": profileData["alias"].(string),
		"mode":          mode,
		"extension_id":  ig.Core.Config.Provisioning.ExtensionID,
	}

	// ========== CAPA DE BUFFER EN DISCO PARA OVERRIDES ==========
	if configOverride != "" {
		// 1. Definir rutas de transito
		tmpDir := filepath.Join(ig.Core.Paths.AppDataDir, "tmp")
		tmpFile := filepath.Join(tmpDir, fmt.Sprintf("override_%s.json", launchID))

		// Asegurar que la carpeta existe
		if err := os.MkdirAll(tmpDir, 0755); err != nil {
			return nil, fmt.Errorf("no se pudo crear carpeta temporal: %v", err)
		}

		// 2. Preparar los datos (Manejo de Base64 o Crudo)
		var rawData []byte
		decoded, err := base64.StdEncoding.DecodeString(configOverride)
		if err == nil {
			rawData = decoded
		} else {
			rawData = []byte(configOverride)
		}

		// 3. Escribir a disco para "capturar" el estado real
		if err := os.WriteFile(tmpFile, rawData, 0644); err != nil {
			return nil, fmt.Errorf("error guardando buffer temporal: %v", err)
		}

		// 4. LIMPIEZA AUTOMÁTICA (Se ejecuta al salir de esta función)
		defer func() {
			os.Remove(tmpFile)
			// Intentamos borrar la carpeta, solo se borrará si está vacía
			os.Remove(tmpDir)
		}()

		// 5. PROCESAMIENTO DESDE DISCO
		bufferData, err := os.ReadFile(tmpFile)
		if err != nil {
			return nil, fmt.Errorf("error leyendo desde buffer: %v", err)
		}

		var overrides map[string]interface{}
		if err := json.Unmarshal(bufferData, &overrides); err != nil {
			return nil, fmt.Errorf("config-override inválido (incluso tras buffer). Tip: PowerShell rompe comillas, usa Base64. Error: %v", err)
		}

		// 6. Mezclar en la configuración
		for k, v := range overrides {
			configData[k] = v
		}

		ig.Core.Logger.Info("[IGNITION] 🔧 Override aplicado desde buffer temporal [%s]", tmpFile)
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

func (ig *Ignition) getProfileData(profileID string) (map[string]interface{}, error) {
	profilesPath := filepath.Join(ig.Core.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil {
		return nil, err
	}

	var root struct {
		Profiles []map[string]interface{} `json:"profiles"`
	}
	if err := json.Unmarshal(data, &root); err != nil {
		return nil, err
	}

	for _, p := range root.Profiles {
		if p["id"] == profileID {
			return p, nil
		}
	}
	return nil, fmt.Errorf("perfil no registrado")
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