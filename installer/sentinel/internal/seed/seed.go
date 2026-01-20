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
	ID            string `json:"id"`
	Alias         string `json:"alias"`
	Master        bool   `json:"master"`
	Path          string `json:"path"`
	SpecPath      string `json:"spec_path"`
	LogsDir       string `json:"logs_dir"`
	ExtensionPath string `json:"extension_path"` // Paso 1: Nuevo campo
}

type ProfilesRegistry struct {
	Profiles []ProfileEntry `json:"profiles"`
}

func HandleSeed(c *core.Core, alias string, isMaster bool) (string, error) {
	registry := loadProfilesRegistry(c)
	for _, p := range registry.Profiles {
		if p.Alias == alias {
			return "", fmt.Errorf("alias_duplicado: %s", alias)
		}
	}

	sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
	cmd := exec.Command(sm.BrainPath, "--json", "profile", "create", alias)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("brain_error: %v", err)
	}

	rawOut := strings.TrimSpace(out.String())
	jsonStart := strings.LastIndex(rawOut, "{")
	jsonEnd := strings.LastIndex(rawOut, "}")
	if jsonStart == -1 || jsonEnd == -1 {
		return "", fmt.Errorf("formato_invalido: %s", rawOut)
	}

	var brainRes struct{ UUID string `json:"uuid"` }
	if err := json.Unmarshal([]byte(rawOut[jsonStart:jsonEnd+1]), &brainRes); err != nil {
		return "", err
	}
	uuid := brainRes.UUID

	// Rutas Base del Perfil
	profileDir := filepath.Join(c.Paths.ProfilesDir, uuid)
	extDir := filepath.Join(profileDir, "extension")
	logsDir := filepath.Join(c.Paths.LogsDir, "profiles", uuid)
	configDir := filepath.Join(c.Paths.AppDataDir, "config", "profile", uuid)
	specPath := filepath.Join(configDir, "ignition_spec.json")

	_ = os.MkdirAll(configDir, 0755)
	_ = os.MkdirAll(extDir, 0755)
	_ = os.MkdirAll(logsDir, 0755)

	// Paso 2: Generar Spec con Template de Oro
	_ = writeIgnitionSpec(c, sm, uuid, profileDir, extDir, logsDir, specPath)

	updateProfilesInventory(c, uuid, alias, isMaster, profileDir, extDir, logsDir, specPath)

	if isMaster {
		status := startup.LoadCurrentStatus(c)
		status.MasterProfile = uuid
		status.Timestamp = time.Now().Format(time.RFC3339)
		_ = startup.SaveSystemStatus(c, status)
	}

	return uuid, nil
}

func writeIgnitionSpec(c *core.Core, sm *discovery.SystemMap, uuid, profileDir, extDir, logsDir, specPath string) error {
	spec := map[string]interface{}{
		"engine": map[string]string{
			"executable": sm.ChromePath,
			"type":       "chromium",
		},
		"engine_flags": []string{
			"--no-sandbox",
			"--test-type",
			"--disable-web-security",
			"--disable-features=IsolateOrigins,site-per-process",
			"--allow-running-insecure-content",
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-sync",
			"--remote-debugging-port=0",
			"--enable-logging",
			"--v=1",
		},
		"paths": map[string]string{
			"extension": extDir,
			"logs_base":  logsDir,
			"user_data":  profileDir,
		},
		"target_url":   fmt.Sprintf("chrome-extension://%s/discovery/index.html", c.Config.Provisioning.ExtensionID),
		"custom_flags": []string{},
	}
	data, _ := json.MarshalIndent(spec, "", "  ")
	return os.WriteFile(specPath, data, 0644)
}

func updateProfilesInventory(c *core.Core, uuid, alias string, isMaster bool, profileDir, extDir, logsDir, specPath string) {
	registry := loadProfilesRegistry(c)
	newEntry := ProfileEntry{
		ID:            uuid,
		Alias:         alias,
		Master:        isMaster,
		Path:          profileDir,
		SpecPath:      specPath,
		LogsDir:       logsDir,
		ExtensionPath: extDir,
	}

	found := false
	for i, p := range registry.Profiles {
		if isMaster { registry.Profiles[i].Master = false }
		if p.ID == uuid {
			registry.Profiles[i] = newEntry
			found = true
		}
	}
	if !found { registry.Profiles = append(registry.Profiles, newEntry) }

	data, _ := json.MarshalIndent(registry, "", "  ")
	_ = os.WriteFile(filepath.Join(c.Paths.AppDataDir, "config", "profiles.json"), data, 0644)
}

func loadProfilesRegistry(c *core.Core) ProfilesRegistry {
	path := filepath.Join(c.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(path)
	if err != nil { return ProfilesRegistry{Profiles: []ProfileEntry{}} }
	var registry ProfilesRegistry
	if err := json.Unmarshal(data, &registry); err != nil {
		var list []ProfileEntry
		json.Unmarshal(data, &list)
		registry.Profiles = list
	}
	return registry
}
