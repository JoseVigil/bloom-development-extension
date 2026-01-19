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

type ProfilesRegistry struct {
	Profiles []ProfileEntry `json:"profiles"`
}

func HandleSeed(c *core.Core, alias string, isMaster bool) (string, error) {
	// 1. Validaciones iniciales de Alias
	registry := loadProfilesRegistry(c)
	for _, p := range registry.Profiles {
		if p.Alias == alias {
			return "", fmt.Errorf("alias_duplicado: %s", alias)
		}
	}

	// 2. Ejecución de Brain
	sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
	cmd := exec.Command(sm.BrainPath, "--json", "profile", "create", alias)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("brain_error: %v", err)
	}

	// Extracción quirúrgica del JSON
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

	// 3. Infraestructura de Archivos
	configDir := filepath.Join(c.Paths.AppDataDir, "config", "profile", uuid)
	specPath := filepath.Join(configDir, "ignition_spec.json")
	_ = os.MkdirAll(configDir, 0755)

	_ = writeIgnitionSpec(c, sm, uuid, specPath)

	// 4. ACTUALIZACIÓN INTELIGENTE (UPSERT) DE INVENTARIO
	updateProfilesInventory(c, uuid, alias, isMaster, specPath)

	// 5. Sincronización de Autoridad en Nucleus
	if isMaster {
		status := startup.LoadCurrentStatus(c)
		status.MasterProfile = uuid
		status.Timestamp = time.Now().Format(time.RFC3339)
		_ = startup.SaveSystemStatus(c, status)
	}

	return uuid, nil
}

func loadProfilesRegistry(c *core.Core) ProfilesRegistry {
	path := filepath.Join(c.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(path)
	if err != nil { return ProfilesRegistry{Profiles: []ProfileEntry{}} }
	
	var registry ProfilesRegistry
	trimmed := strings.TrimSpace(string(data))
	if strings.HasPrefix(trimmed, "[") {
		var list []ProfileEntry
		json.Unmarshal(data, &list)
		registry.Profiles = list
	} else {
		json.Unmarshal(data, &registry)
	}
	return registry
}

func writeIgnitionSpec(c *core.Core, sm *discovery.SystemMap, uuid string, specPath string) error {
	spec := map[string]interface{}{
		"paths": map[string]string{
			"user_data": filepath.Join(c.Paths.ProfilesDir, uuid),
			"extension": filepath.Join(c.Paths.AppDataDir, "bin", "extension"),
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

// updateProfilesInventory implementa lógica de UPSERT para evitar duplicados
func updateProfilesInventory(c *core.Core, uuid string, alias string, isMaster bool, specPath string) {
	registry := loadProfilesRegistry(c)
	
	// Datos de la nueva entrada
	newEntry := ProfileEntry{
		ID:       uuid,
		Alias:    alias,
		Master:   isMaster,
		Path:     filepath.Join(c.Paths.ProfilesDir, uuid),
		SpecPath: specPath,
		LogsDir:  filepath.Join(c.Paths.LogsDir, "profiles", uuid),
	}

	found := false
	for i, p := range registry.Profiles {
		// 1. Si el nuevo es master, todos los existentes pierden la corona
		if isMaster {
			registry.Profiles[i].Master = false
		}
		// 2. Si el ID ya existe, actualizamos la entrada en lugar de añadir
		if p.ID == uuid {
			registry.Profiles[i] = newEntry
			found = true
		}
	}

	if !found {
		registry.Profiles = append(registry.Profiles, newEntry)
	}

	data, _ := json.MarshalIndent(registry, "", "  ")
	_ = os.WriteFile(filepath.Join(c.Paths.AppDataDir, "config", "profiles.json"), data, 0644)
}