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
	"strconv"

	"github.com/spf13/cobra"
	"golang.org/x/sys/windows/registry"
)

func init() {
	core.RegisterCommand("IDENTITY", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "seed [alias] [is_master]",
			Short: "Registra una nueva identidad de perfil",
			Args:  cobra.ExactArgs(2),
			Example: `  sentinel seed profile_001 true
  sentinel --json seed burner_temp false | jq .`,
			Run: func(cmd *cobra.Command, args []string) {
				alias := args[0]
				isMaster, _ := strconv.ParseBool(args[1])
				
				uuid, profilePath, err := HandleSeed(c, alias, isMaster)
				if err != nil {
					if c.IsJSON {
						outputSeedError(err)
					} else {
						c.Logger.Error("Seed failed: %v", err)
					}
					os.Exit(1)
				}
				
				if c.IsJSON {
					outputSeedJSON(uuid, alias, profilePath, isMaster)
				} else {
					outputSeedHuman(c, uuid, alias, profilePath, isMaster)
				}
			},
		}

		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["requires"] = `  - brain.exe debe estar disponible en bin/
  - Permiso de escritura en HKCU\Software\Google\Chrome\NativeMessagingHosts
  - bloom-host.exe en bin/native/
  - Extension ID válido en configuración`

		return cmd
	})
}

func outputSeedJSON(uuid, alias, path string, isMaster bool) {
	result := map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"uuid":      uuid,
			"alias":     alias,
			"path":      path,
			"is_master": isMaster,
		},
	}
	jsonBytes, _ := json.Marshal(result)
	fmt.Println(string(jsonBytes))
}

func outputSeedError(err error) {
	result := map[string]interface{}{
		"success": false,
		"error":   err.Error(),
	}
	jsonBytes, _ := json.Marshal(result)
	fmt.Println(string(jsonBytes))
}

func outputSeedHuman(c *core.Core, uuid, alias, path string, isMaster bool) {
	res := map[string]interface{}{
		"status": "success",
		"uuid":   uuid,
		"alias":  alias,
		"master": isMaster,
	}
	out, _ := json.MarshalIndent(res, "", "  ")
	fmt.Println(string(out))
}

type ProfileEntry struct {
	ID            string `json:"id"`
	Alias         string `json:"alias"`
	Master        bool   `json:"master"`
	Path          string `json:"path"`
	SpecPath      string `json:"spec_path"`
	ConfigDir     string `json:"config_dir"`
	LogsDir       string `json:"logs_dir"`
	ExtensionPath string `json:"extension_path"`
	LaunchCount   int    `json:"launch_count"`
}

type ProfilesRegistry struct {
	Profiles []ProfileEntry `json:"profiles"`
}

func HandleSeed(c *core.Core, alias string, isMaster bool) (string, string, error) {
	registry_data := loadProfilesRegistry(c)
	for _, p := range registry_data.Profiles {
		if p.Alias == alias {
			return "", "", fmt.Errorf("alias_duplicado: %s", alias)
		}
	}

	sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
	cmd := exec.Command(sm.BrainPath, "--json", "profile", "create", alias)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return "", "", fmt.Errorf("brain_error: %v", err)
	}

	rawOut := strings.TrimSpace(out.String())
	jsonStart := strings.LastIndex(rawOut, "{")
	jsonEnd := strings.LastIndex(rawOut, "}")
	if jsonStart == -1 || jsonEnd == -1 {
		return "", "", fmt.Errorf("formato_invalido: %s", rawOut)
	}

	var brainRes struct{ UUID string `json:"uuid"` }
	if err := json.Unmarshal([]byte(rawOut[jsonStart:jsonEnd+1]), &brainRes); err != nil {
		return "", "", err
	}
	uuid := brainRes.UUID

	profileDir := filepath.Join(c.Paths.ProfilesDir, uuid)
	extDir := filepath.Join(profileDir, "extension")
	logsDir := filepath.Join(c.Paths.LogsDir, "profiles", uuid)
	configDir := filepath.Join(c.Paths.AppDataDir, "config", "profile", uuid)
	specPath := filepath.Join(configDir, "ignition_spec.json")

	_ = os.MkdirAll(configDir, 0755)
	_ = os.MkdirAll(extDir, 0755)
	_ = os.MkdirAll(logsDir, 0755)

	shortID := uuid[:8]
	hostName := fmt.Sprintf("com.bloom.synapse.%s", shortID)
	manifestPath := filepath.Join(configDir, hostName+".json")
	if err := writeNativeManifest(c, manifestPath, hostName, uuid); err != nil {
		return "", "", err
	}

	if err := registerInWindows(hostName, manifestPath); err != nil {
		c.Logger.Error("[SEED] No se pudo registrar Native Messaging: %v", err)
	}

	_ = writeIgnitionSpec(c, sm, uuid, profileDir, extDir, logsDir, specPath)
	updateProfilesInventory(c, uuid, alias, isMaster, profileDir, configDir, extDir, logsDir, specPath)

	if isMaster {
		status := startup.LoadCurrentStatus(c)
		status.MasterProfile = uuid
		status.Timestamp = time.Now().Format(time.RFC3339)
		_ = startup.SaveSystemStatus(c, status)
	}

	return uuid, profileDir, nil
}

func writeNativeManifest(c *core.Core, path, hostName, uuid string) error {
	bridgePath := filepath.Join(c.Paths.BinDir, "native", "bloom-host.exe")
	manifest := map[string]interface{}{
		"name":        hostName,
		"description": "Synapse v2 Native Bridge Host",
		"path":        bridgePath,
		"type":        "stdio",
		"allowed_origins": []string{
			fmt.Sprintf("chrome-extension://%s/", c.Config.Provisioning.ExtensionID),
		},
		"args": []string{"--profile-id", uuid},
	}
	data, _ := json.MarshalIndent(manifest, "", "  ")
	return os.WriteFile(path, data, 0644)
}

func registerInWindows(hostName, manifestPath string) error {
	keyPath := `Software\Google\Chrome\NativeMessagingHosts\` + hostName
	k, _, err := registry.CreateKey(registry.CURRENT_USER, keyPath, registry.ALL_ACCESS)
	if err != nil { return err }
	defer k.Close()
	return k.SetStringValue("", manifestPath)
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
			"--disable-session-crashed-bubble",
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

func updateProfilesInventory(c *core.Core, uuid, alias string, isMaster bool, profileDir, configDir, extDir, logsDir, specPath string) {
	registry_data := loadProfilesRegistry(c)
	newEntry := ProfileEntry{
		ID:            uuid,
		Alias:         alias,
		Master:        isMaster,
		Path:          profileDir,
		ConfigDir:     configDir,
		SpecPath:      specPath,
		LogsDir:       logsDir,
		ExtensionPath: extDir,
		LaunchCount:   0,
	}

	for i, p := range registry_data.Profiles {
		if isMaster { registry_data.Profiles[i].Master = false }
		if p.ID == uuid {
			newEntry.LaunchCount = p.LaunchCount
			registry_data.Profiles[i] = newEntry
			saveRegistry(c, registry_data)
			return
		}
	}
	registry_data.Profiles = append(registry_data.Profiles, newEntry)
	saveRegistry(c, registry_data)
}

func saveRegistry(c *core.Core, reg ProfilesRegistry) {
	path := filepath.Join(c.Paths.AppDataDir, "config", "profiles.json")
	data, _ := json.MarshalIndent(reg, "", "  ")
	_ = os.WriteFile(path, data, 0644)
}

func loadProfilesRegistry(c *core.Core) ProfilesRegistry {
	path := filepath.Join(c.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(path)
	if err != nil { return ProfilesRegistry{Profiles: []ProfileEntry{}} }
	var registry_data ProfilesRegistry
	if err := json.Unmarshal(data, &registry_data); err != nil {
		var list []ProfileEntry
		json.Unmarshal(data, &list)
		registry_data.Profiles = list
	}
	return registry_data
}