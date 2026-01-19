package startup

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"strings"
	"time"
)

type ServiceStatus struct {
	Name   string `json:"name"`
	Port   int    `json:"port"`
	Active bool   `json:"active"`
}

type ManifestSummary struct {
	ManifestPath  string   `json:"manifest_path"`
	Usage         string   `json:"usage"`
	Categories    []string `json:"categories"`
	TotalCommands int      `json:"total_commands"`
}

type SystemStatus struct {
	Timestamp           string            `json:"timestamp"`
	OnboardingCompleted bool              `json:"onboarding_completed"`
	ExecutablesValid    bool              `json:"executables_valid"`
	MasterProfile       string            `json:"master_profile"`
	SystemMap           map[string]string `json:"system_map"`
	Services            []ServiceStatus   `json:"services"`
	BrainManifest       *ManifestSummary  `json:"brain_manifest_summary"` 
}

func Initialize(c *core.Core) error {
	// 1. Identidad Criptográfica
	extID, err := CalculateExtensionID(c.Config.Provisioning.GoldenKey)
	if err != nil {
		return fmt.Errorf("error identity: %w", err)
	}
	c.Config.Provisioning.ExtensionID = extID

	// 2. Sincronizar Extension Manifest
	if err := SyncExtensionManifest(c, extID); err != nil {
		c.Logger.Warning("Sync manifest falló: %v", err)
	}

	// 3. Cargar estado
	status := LoadCurrentStatus(c)
	status.Timestamp = time.Now().Format(time.RFC3339)
	
	if status.SystemMap == nil {
		status.SystemMap = make(map[string]string)
	}

	// 4. Discovery & Blueprint Mapping
	sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
	status.SystemMap["brain_exe"] = sm.BrainPath
	status.SystemMap["chrome_exe"] = sm.ChromePath
	status.SystemMap["extension_id"] = extID
	status.SystemMap["browser_engine"] = c.Config.Settings.BrowserEngine
	status.SystemMap["extension_path"] = c.Config.Settings.ExtensionPath
	status.SystemMap["test_workspace"] = c.Config.Settings.TestWorkspace
	status.SystemMap["vscode_plugin"] = detectVSCodePlugin()

	// 5. Manifiesto Dual
	if sm.BrainPath != "" {
		summary, err := ProcessBrainManifest(c, sm.BrainPath)
		if err == nil {
			status.BrainManifest = summary
		}
	}

	// 6. Integridad de Master
	if status.MasterProfile != "" {
		if !profileExistsInRegistry(c, status.MasterProfile) {
			status.MasterProfile = "" 
		}
	}

	status.ExecutablesValid = validateFiles(sm.BrainPath, sm.ChromePath)
	return SaveSystemStatus(c, status)
}

// FetchBrainManifest es PÚBLICA para que health.go pueda usarla
func FetchBrainManifest(brainPath string) (interface{}, error) {
	cmd := exec.Command(brainPath, "--json", "--help")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var manifest interface{}
	if err := json.Unmarshal(output, &manifest); err != nil {
		return nil, err
	}
	return manifest, nil
}

// ProcessBrainManifest genera el archivo completo y el resumen para nucleus.json
func ProcessBrainManifest(c *core.Core, brainPath string) (*ManifestSummary, error) {
	cmd := exec.Command(brainPath, "--json", "--help")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	manifestFile := filepath.Join(c.Paths.AppDataDir, "config", "brain_manifest.json")
	os.WriteFile(manifestFile, output, 0644)

	var full map[string]interface{}
	json.Unmarshal(output, &full)

	summary := &ManifestSummary{
		ManifestPath: manifestFile,
		Usage:        "brain [OPTIONS] <category> <command>",
		Categories:   []string{},
	}

	if categories, ok := full["categories"].([]interface{}); ok {
		summary.TotalCommands = 0
		for _, cat := range categories {
			if cMap, ok := cat.(map[string]interface{}); ok {
				summary.Categories = append(summary.Categories, cMap["name"].(string))
				if count, ok := cMap["command_count"].(float64); ok {
					summary.TotalCommands += int(count)
				}
			}
		}
	}
	return summary, nil
}

func SyncExtensionManifest(c *core.Core, extID string) error {
	path := filepath.Join(c.Paths.BinDir, "extension", "manifest.json")
	data, err := os.ReadFile(path)
	if err != nil { return err }
	var manifest map[string]interface{}
	json.Unmarshal(data, &manifest)
	manifest["key"] = c.Config.Provisioning.GoldenKey
	updated, _ := json.MarshalIndent(manifest, "", "  ")
	return os.WriteFile(path, updated, 0644)
}

func CalculateExtensionID(pubKey string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(pubKey)
	if err != nil { return "", err }
	hasher := sha256.New()
	hasher.Write(raw)
	hash := hex.EncodeToString(hasher.Sum(nil))
	encodedID := ""
	for i := 0; i < 32; i++ {
		char := hash[i]
		if char >= '0' && char <= '9' { encodedID += string(char - '0' + 'a')
		} else { encodedID += string(char - 'a' + 'k') }
	}
	return encodedID, nil
}

func validateFiles(brain, chrome string) bool {
	if brain == "" || chrome == "" { return false }
	_, errB := os.Stat(brain)
	_, errC := os.Stat(chrome)
	return errB == nil && errC == nil
}

func SaveSystemStatus(c *core.Core, status SystemStatus) error {
	path := filepath.Join(c.Paths.AppDataDir, "config", "nucleus.json")
	os.MkdirAll(filepath.Dir(path), 0755)
	data, _ := json.MarshalIndent(status, "", "  ")
	return os.WriteFile(path, data, 0644)
}

func LoadCurrentStatus(c *core.Core) SystemStatus {
	path := filepath.Join(c.Paths.AppDataDir, "config", "nucleus.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return SystemStatus{SystemMap: make(map[string]string)}
	}
	var s SystemStatus
	json.Unmarshal(data, &s)
	if s.SystemMap == nil { s.SystemMap = make(map[string]string) }
	return s
}

func detectVSCodePlugin() string {
	home, _ := os.UserHomeDir()
	extensionsDir := filepath.Join(home, ".vscode", "extensions")
	files, err := os.ReadDir(extensionsDir)
	if err != nil { return "not_found" }
	for _, f := range files {
		if strings.Contains(strings.ToLower(f.Name()), "bloom-nucleus-bridge") {
			parts := strings.Split(f.Name(), "-")
			return parts[len(parts)-1]
		}
	}
	return "not_detected"
}

func profileExistsInRegistry(c *core.Core, uuid string) bool {
	registryPath := filepath.Join(c.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(registryPath)
	if err != nil { return false }
	var profiles []map[string]interface{}
	json.Unmarshal(data, &profiles)
	for _, p := range profiles {
		if p["id"] == uuid { return true }
	}
	return false
}