package ignition

import (
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
	var launchID string

	for i, p := range root.Profiles {
		if p["id"] == profileID {
			if val, ok := p["launch_count"].(float64); ok {
				counter = int(val) + 1
			}
			
			launchID = fmt.Sprintf("%03d_%s_%s", counter, shortUUID, timestamp)
			
			root.Profiles[i]["launch_count"] = counter
			root.Profiles[i]["last_launch_id"] = launchID
			break
		}
	}

	updatedData, _ := json.MarshalIndent(root, "", "  ")
	_ = os.WriteFile(profilesPath, updatedData, 0644)

	return launchID
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

	// === 2. CONSTRUIR CONFIGURACIÓN BASE (desde profiles.json) ===
	shortID := profileID[:8]
	extDir := spec.Paths.Extension

	configData := map[string]interface{}{
		"profileId":     profileID,
		"bridge_name":   fmt.Sprintf("com.bloom.synapse.%s", shortID),
		"launchId":      launchID,
		"profile_alias": getStringField(profileData, "alias", "MasterWorker"),
		"mode":          mode,
		"extension_id":  ig.Core.Config.Provisioning.ExtensionID,
	}

	// === 3. AGREGAR CAMPOS ESPECÍFICOS DE LANDING (desde profiles.json) ===
	if mode == "landing" {
		// Campos numéricos
		configData["total_launches"] = getIntField(profileData, "launch_count", 0)
		configData["intents_done"] = getIntField(profileData, "intents_done", 0)
		configData["uptime"] = calculateUptime(profileData)
		
		// Strings
		configData["role"] = getStringField(profileData, "role", "Worker")
		configData["last_synch"] = getStringField(profileData, "last_synch", time.Now().Format(time.RFC3339))
		
		// Timestamps
		configData["created_at"] = getStringField(profileData, "created_at", time.Now().Format(time.RFC3339))
		configData["last_launch_at"] = time.Now().Format(time.RFC3339)
		
		// Linked accounts (array complejo)
		if accounts, ok := profileData["linked_accounts"].([]interface{}); ok {
			configData["linked_accounts"] = accounts
		} else {
			// Default vacío si no existe
			configData["linked_accounts"] = []interface{}{}
		}
	}

	// === 4. APLICAR OVERRIDES ===
	if configOverride != "" {
		var overrides map[string]interface{}
		
		if err := json.Unmarshal([]byte(configOverride), &overrides); err != nil {
			return nil, fmt.Errorf("config-override inválido: %v", err)
		}

		for k, v := range overrides {
			configData[k] = v
		}

		ig.Core.Logger.Info("[IGNITION] 🔧 %d overrides aplicados", len(overrides))
	}

	// === 5. GENERAR ARCHIVO SYNAPSE.CONFIG.JS ===
	// IMPORTANTE: Este es el ÚNICO lugar donde se genera este archivo
	// Python ya NO lo genera - evita race conditions y duplicación
	configJSON, _ := json.MarshalIndent(configData, "", "  ")

	var jsContent string
	jsContent = fmt.Sprintf(`self.SYNAPSE_CONFIG = %s;`, string(configJSON))

	configPath := filepath.Join(extDir, fmt.Sprintf("%s.synapse.config.js", mode))
	if err := os.WriteFile(configPath, []byte(jsContent), 0644); err != nil {
		return nil, fmt.Errorf("error escribiendo synapse.config.js: %v", err)
	}

	// === 5.1 VALIDAR QUE EL ARCHIVO SE CREÓ CORRECTAMENTE ===
	if _, err := os.Stat(configPath); err != nil {
		return nil, fmt.Errorf("validación fallida: config no generado correctamente en %s: %v", configPath, err)
	}
	
	// Verificar que el contenido sea válido (opcional pero recomendado)
	generatedContent, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("validación fallida: no se puede leer config generado: %v", err)
	}
	
	if len(generatedContent) == 0 {
		return nil, fmt.Errorf("validación fallida: config generado está vacío")
	}

	ig.Core.Logger.Info("[IGNITION] ✅ Config generado y validado: %s (%d bytes)", configPath, len(generatedContent))

	// === 6. ACTUALIZAR NATIVE HOST MANIFEST ===
	manifestName := fmt.Sprintf("com.bloom.synapse.%s.json", shortID)
	manifestPath := filepath.Join(profileData["config_dir"].(string), manifestName)

	mData, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("manifiesto nativo ausente: %v", err)
	}

	var manifest map[string]interface{}
	json.Unmarshal(mData, &manifest)
	manifest["args"] = []string{"--profile-id", profileID, "--launch-id", launchID}

	updatedManifest, _ := json.MarshalIndent(manifest, "", "  ")
	if err := os.WriteFile(manifestPath, updatedManifest, 0644); err != nil {
		return nil, err
	}

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
			
			// Aplicar cada override
			for k, v := range overrides {
				// Mapear nombres de campos si es necesario
				fieldName := k
				
				// Mapeo especial para campos específicos
				switch k {
				case "profile_alias":
					fieldName = "alias"
				case "extension_id":
					// Este NO se guarda en profiles.json, es global
					continue
				}
				
				root.Profiles[i][fieldName] = v
			}
			
			// Actualizar timestamp de modificación
			root.Profiles[i]["updated_at"] = time.Now().Format(time.RFC3339)
			
			break
		}
	}
	
	if !found {
		return fmt.Errorf("perfil %s no encontrado en profiles.json", profileID)
	}
	
	// Escribir archivo actualizado
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
			root.Profiles[i]["last_launch_id"] = ig.Session.LaunchID
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

// ========== HELPER FUNCTIONS ==========

// getStringField obtiene un campo string con fallback
func getStringField(data map[string]interface{}, field string, defaultValue string) string {
	if val, ok := data[field].(string); ok {
		return val
	}
	return defaultValue
}

// getIntField obtiene un campo int con fallback
func getIntField(data map[string]interface{}, field string, defaultValue int) int {
	if val, ok := data[field].(float64); ok {
		return int(val)
	}
	return defaultValue
}

// calculateUptime calcula el uptime desde created_at
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