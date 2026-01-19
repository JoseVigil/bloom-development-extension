package seed

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/startup"
	"strings"
	"time"
)

type ProfileEntry struct {
	ID       string `json:"id"`
	Alias    string `json:"alias"`
	Master   bool   `json:"master"`
	Path     string `json:"path"`
	SpecPath string `json:"spec_path"`
	LogsDir  string `json:"logs_dir"`
}

func HandleSeed(c *core.Core, alias string, isMaster bool) (string, error) {
	// 1. Validaciones de Integridad
	profiles := loadProfilesRegistry(c)
	for _, p := range profiles {
		if p.Alias == alias {
			return "", fmt.Errorf("alias_duplicado: %s", alias)
		}
	}

	if isMaster {
		status := startup.LoadCurrentStatus(c)
		if status.MasterProfile != "" {
			path := filepath.Join(c.Paths.ProfilesDir, status.MasterProfile)
			if info, err := os.Stat(path); err == nil && info.IsDir() {
				return "", fmt.Errorf("master_activo_detectado: %s", status.MasterProfile)
			}
		}
	}

	// 2. Ejecutar Brain con limpieza de salida
	sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
	cmd := exec.Command(sm.BrainPath, "--json", "profile", "create", alias)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("brain_execution_error: %v", err)
	}

	// Limpiamos la salida por si Brain escupe logs antes del JSON
	rawOut := out.String()
	jsonStart := strings.Index(rawOut, "{")
	if jsonStart == -1 {
		return "", fmt.Errorf("brain_invalid_json_output: %s", rawOut)
	}

	var brainRes struct{ UUID string `json:"uuid"` }
	if err := json.Unmarshal([]byte(rawOut[jsonStart:]), &brainRes); err != nil {
		return "", fmt.Errorf("parse_error: %v", err)
	}
	uuid := brainRes.UUID

	if uuid == "" {
		return "", fmt.Errorf("brain_empty_uuid_returned")
	}

	// 3. Generar Spec e Inventario
	configDir := filepath.Join(c.Paths.AppDataDir, "config", "profile", uuid)
	specPath := filepath.Join(configDir, "ignition_spec.json")
	os.MkdirAll(configDir, 0755)

	if err := writeIgnitionSpec(c, sm, uuid, specPath); err != nil {
		return "", err
	}

	if err := updateProfilesInventory(c, uuid, alias, isMaster, specPath); err != nil {
		return "", err
	}

	// 4. Impacto en Nucleus (Master Authority)
	if isMaster {
		status := startup.LoadCurrentStatus(c)
		status.MasterProfile = uuid
		status.Timestamp = time.Now().Format(time.RFC3339)
		startup.SaveSystemStatus(c, status)
	}

	return uuid, nil
}

func loadProfilesRegistry(c *core.Core) []ProfileEntry {
	path := filepath.Join(c.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(path)
	if err != nil { return []ProfileEntry{} }
	var p []ProfileEntry
	json.Unmarshal(data, &p)
	return p
}

func writeIgnitionSpec(c *core.Core, sm *discovery.SystemMap, uuid string, specPath string) error {
	spec := map[string]interface{}{
		"paths": map[string]string{
			"user_data": filepath.Join(c.Paths.ProfilesDir, uuid),
			"extension": filepath.Join(c.Paths.BinDir, "extension"),
			"logs_base": filepath.Join(c.Paths.LogsDir, "profiles", uuid),
		},
		"engine": map[string]string{
			"type":       "chromium",
			"executable": sm.ChromePath,
		},
		"target_url": fmt.Sprintf("chrome-extension://%s/discovery/index.html", c.Config.Provisioning.ExtensionID),
		"engine_flags": []string{"--no-sandbox", "--disable-web-security"},
	}
	data, _ := json.MarshalIndent(spec, "", "  ")
	return os.WriteFile(specPath, data, 0644)
}

func updateProfilesInventory(c *core.Core, uuid string, alias string, isMaster bool, specPath string) error {
	profiles := loadProfilesRegistry(c)
	if isMaster {
		for i := range profiles { profiles[i].Master = false }
	}
	profiles = append(profiles, ProfileEntry{
		ID: uuid, Alias: alias, Master: isMaster,
		Path: filepath.Join(c.Paths.ProfilesDir, uuid),
		SpecPath: specPath,
		LogsDir: filepath.Join(c.Paths.LogsDir, "profiles", uuid),
	})
	data, _ := json.MarshalIndent(profiles, "", "  ")
	return os.WriteFile(filepath.Join(c.Paths.AppDataDir, "config", "profiles.json"), data, 0644)
}