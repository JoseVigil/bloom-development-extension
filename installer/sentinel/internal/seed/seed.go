package seed

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/startup"
	"strconv"
	"strings"
	"time"

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
  - bloom-cortex.blx en bin/cortex/
  - Permiso de escritura en HKCU\Software\Google\Chrome\NativeMessagingHosts
  - bloom-host.exe en bin/native/
  - Extension ID válido en configuración`
		cmd.Annotations["output"] = `{
  "success": true,
  "data": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "alias": "profile_001",
    "path": "C:\\Users\\User\\AppData\\Local\\BloomNucleus\\profiles\\550e8400-e29b-41d4-a716-446655440000",
    "is_master": true
  }
}`

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

type CortexMetadata struct {
	Version      string `json:"version"`
	BuildDate    string `json:"build_date"`
	Compatibility string `json:"compatibility"`
}

func HandleSeed(c *core.Core, alias string, isMaster bool) (string, string, error) {
	registry_data := loadProfilesRegistry(c)
	for _, p := range registry_data.Profiles {
		if p.Alias == alias {
			return "", "", fmt.Errorf("alias_duplicado: %s", alias)
		}
	}

	sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)

	bloomBaseDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "BloomNucleus")
	blxPath := filepath.Join(bloomBaseDir, "bin", "cortex", "bloom-cortex.blx")
	if _, err := os.Stat(blxPath); os.IsNotExist(err) {
		return "", "", fmt.Errorf("cortex_missing: %s no encontrado", blxPath)
	}

	c.Logger.Info("[SEED] ✓ Cortex package found: %s", blxPath)

	metadata, err := inspectCortexPackage(blxPath, c)
	if err != nil {
		return "", "", fmt.Errorf("cortex_inspection_failed: %v", err)
	}

	c.Logger.Info("[SEED] Cortex version: %s (build: %s)", metadata.Version, metadata.BuildDate)

	baseExtensionDir := filepath.Join(bloomBaseDir, "bin", "extension")
	
	c.Logger.Info("[SEED] Deploying base extension to: %s", baseExtensionDir)
	
	if _, err := os.Stat(baseExtensionDir); err == nil {
		c.Logger.Info("[SEED] Removing existing base extension directory")
		if err := os.RemoveAll(baseExtensionDir); err != nil {
			return "", "", fmt.Errorf("failed to remove existing extension: %v", err)
		}
	}
	
	if err := os.MkdirAll(baseExtensionDir, 0755); err != nil {
		return "", "", fmt.Errorf("failed to create base extension dir: %v", err)
	}
	
	if err := deployCortexPackage(blxPath, baseExtensionDir, c); err != nil {
		return "", "", fmt.Errorf("failed to deploy base extension: %v", err)
	}
	
	c.Logger.Info("[SEED] ✓ Base extension deployed to bin/extension")

	args := []string{"--json", "profile", "create", alias}
	if isMaster {
		args = append(args, "--master")
	}

	c.Logger.Info("[SEED] Executing: %s %v", sm.BrainPath, args)

	cmd := exec.Command(sm.BrainPath, args...)
	var out bytes.Buffer
	var errOut bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errOut
	if err := cmd.Run(); err != nil {
		c.Logger.Error("[SEED] Brain stderr: %s", errOut.String())
		c.Logger.Error("[SEED] Brain stdout: %s", out.String())
		return "", "", fmt.Errorf("brain_error: %v", err)
	}

	rawOut := strings.TrimSpace(out.String())
	jsonStart := strings.LastIndex(rawOut, "{")
	jsonEnd := strings.LastIndex(rawOut, "}")
	if jsonStart == -1 || jsonEnd == -1 {
		c.Logger.Error("[SEED] Invalid brain output: %s", rawOut)
		return "", "", fmt.Errorf("formato_invalido: %s", rawOut)
	}

	var brainRes struct{ UUID string `json:"uuid"` }
	if err := json.Unmarshal([]byte(rawOut[jsonStart:jsonEnd+1]), &brainRes); err != nil {
		c.Logger.Error("[SEED] Failed to parse brain response: %s", rawOut[jsonStart:jsonEnd+1])
		return "", "", err
	}
	uuid := brainRes.UUID

	profileDir := filepath.Join(c.Paths.ProfilesDir, uuid)
	extDir := filepath.Join(profileDir, "extension")
	logsDir := filepath.Join(c.Paths.LogsDir, "profiles", uuid)
	configDir := filepath.Join(c.Paths.AppDataDir, "config", "profile", uuid)
	specPath := filepath.Join(configDir, "ignition_spec.json")

	_ = os.MkdirAll(configDir, 0755)
	_ = os.MkdirAll(logsDir, 0755)

	if _, err := os.Stat(extDir); os.IsNotExist(err) {
		c.Logger.Error("[SEED] Brain failed to create extension directory at: %s", extDir)
		return "", "", fmt.Errorf("brain did not create extension directory")
	}

	c.Logger.Info("[SEED] ✓ Profile created by brain with extension at: %s", extDir)

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

func inspectCortexPackage(blxPath string, c *core.Core) (*CortexMetadata, error) {
	reader, err := zip.OpenReader(blxPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open blx: %v", err)
	}
	defer reader.Close()

	var metaFile *zip.File
	for _, f := range reader.File {
		if f.Name == "cortex.meta.json" {
			metaFile = f
			break
		}
	}

	if metaFile == nil {
		return nil, fmt.Errorf("cortex.meta.json not found in package")
	}

	rc, err := metaFile.Open()
	if err != nil {
		return nil, fmt.Errorf("failed to read meta: %v", err)
	}
	defer rc.Close()

	var metadata CortexMetadata
	if err := json.NewDecoder(rc).Decode(&metadata); err != nil {
		return nil, fmt.Errorf("invalid metadata format: %v", err)
	}

	return &metadata, nil
}

func deployCortexPackage(blxPath, destDir string, c *core.Core) error {
	reader, err := zip.OpenReader(blxPath)
	if err != nil {
		return fmt.Errorf("failed to open blx: %v", err)
	}
	defer reader.Close()

	for _, f := range reader.File {
		if strings.HasPrefix(f.Name, "__") || f.Name == "cortex.meta.json" {
			continue
		}

		targetPath := filepath.Join(destDir, f.Name)

		if f.FileInfo().IsDir() {
			_ = os.MkdirAll(targetPath, f.Mode())
			continue
		}

		if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
			return fmt.Errorf("failed to create dir: %v", err)
		}

		rc, err := f.Open()
		if err != nil {
			return fmt.Errorf("failed to open file in zip: %v", err)
		}

		outFile, err := os.OpenFile(targetPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return fmt.Errorf("failed to create target file: %v", err)
		}

		_, err = io.Copy(outFile, rc)
		rc.Close()
		outFile.Close()

		if err != nil {
			return fmt.Errorf("failed to write file: %v", err)
		}
	}

	return nil
}

func writeNativeManifest(c *core.Core, path, hostName, uuid string) error {
	bloomBaseDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "BloomNucleus")
	bridgePath := filepath.Join(bloomBaseDir, "bin", "native", "bloom-host.exe")

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
	if err != nil {
		return err
	}
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
			"logs_base": logsDir,
			"user_data": profileDir,
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
		if isMaster {
			registry_data.Profiles[i].Master = false
		}
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
	if err != nil {
		return ProfilesRegistry{Profiles: []ProfileEntry{}}
	}
	var registry_data ProfilesRegistry
	if err := json.Unmarshal(data, &registry_data); err != nil {
		var list []ProfileEntry
		json.Unmarshal(data, &list)
		registry_data.Profiles = list
	}
	return registry_data
}