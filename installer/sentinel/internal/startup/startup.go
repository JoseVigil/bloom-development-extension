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
	// 1. CÁLCULO DE IDENTIDAD CRIPTOGRÁFICA
	extID, err := CalculateExtensionID(c.Config.Provisioning.GoldenKey)
	if err != nil {
		return fmt.Errorf("error identity: %w", err)
	}
	c.Config.Provisioning.ExtensionID = extID

	// 2. ACTUALIZAR BLUEPRINT.JSON (Persistencia de Identidad)
	if err := saveBlueprint(c); err != nil {
		c.Logger.Warning("No se pudo actualizar blueprint.json: %v", err)
	}

	// 3. SINCRONIZAR EXTENSION MANIFEST (Seguridad física)
	// Buscamos la carpeta extension en el binario o vía discovery
	sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
	extDeployPath := filepath.Join(c.Paths.AppDataDir, "bin", "extension")
	_ = SyncExtensionManifest(extDeployPath, c.Config.Provisioning.GoldenKey)

	// 4. CARGA ADITIVA DE ESTADO (Nucleus)
	status := LoadCurrentStatus(c)
	status.Timestamp = time.Now().Format(time.RFC3339)
	if status.SystemMap == nil {
		status.SystemMap = make(map[string]string)
	}

	// 5. MAPEO DE SYSTEM MAP
	status.SystemMap["brain_exe"] = sm.BrainPath
	status.SystemMap["chrome_exe"] = sm.ChromePath
	status.SystemMap["extension_id"] = extID
	status.SystemMap["browser_engine"] = c.Config.Settings.BrowserEngine
	status.SystemMap["extension_source_path"] = c.Config.Settings.ExtensionPath
	status.SystemMap["vscode_plugin"] = detectVSCodePlugin(c.Config.Settings.ExtensionPath)

	// 6. MANIFIESTO DUAL (Brain)
	if sm.BrainPath != "" {
		summary, err := ProcessBrainManifest(c, sm.BrainPath)
		if err == nil {
			status.BrainManifest = summary
		}
	}

	// 7. INTEGRIDAD DE MASTER
	if status.MasterProfile != "" {
		if !profileExistsInRegistry(c, status.MasterProfile) {
			status.MasterProfile = "" 
		}
	}

	status.ExecutablesValid = (sm.BrainPath != "" && sm.ChromePath != "")
	return SaveSystemStatus(c, status)
}

// saveBlueprint persiste los cambios de configuración (como el extension_id) de vuelta al archivo
func saveBlueprint(c *core.Core) error {
	path := filepath.Join(c.Paths.BinDir, "blueprint.json")
	
	// Serializar con indentación para legibilidad humana
	data, err := json.MarshalIndent(c.Config, "", "  ")
	if err != nil {
		return err
	}
	
	return os.WriteFile(path, data, 0644)
}

func UpdateActiveStatus(c *core.Core, updates map[string]string) {
	status := LoadCurrentStatus(c)
	if status.SystemMap == nil { status.SystemMap = make(map[string]string) }
	for k, v := range updates {
		status.SystemMap[k] = v
	}
	status.Timestamp = time.Now().Format(time.RFC3339)
	_ = SaveSystemStatus(c, status)
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

func SyncExtensionManifest(extPath, goldenKey string) error {
	path := filepath.Join(extPath, "manifest.json")
	data, err := os.ReadFile(path)
	if err != nil { return err }
	var manifest map[string]interface{}
	json.Unmarshal(data, &manifest)
	manifest["key"] = goldenKey
	updated, _ := json.MarshalIndent(manifest, "", "  ")
	return os.WriteFile(path, updated, 0644)
}

func detectVSCodePlugin(sourcePath string) string {
	pkgPath := filepath.Join(sourcePath, "package.json")
	if data, err := os.ReadFile(pkgPath); err == nil {
		var pkg struct{ Version string `json:"version"` }
		if err := json.Unmarshal(data, &pkg); err == nil && pkg.Version != "" {
			return pkg.Version + " (development source)"
		}
	}
	home, _ := os.UserHomeDir()
	extDir := filepath.Join(home, ".vscode", "extensions")
	files, _ := os.ReadDir(extDir)
	for _, f := range files {
		if strings.Contains(strings.ToLower(f.Name()), "bloom-nucleus-bridge") {
			parts := strings.Split(f.Name(), "-")
			return parts[len(parts)-1] + " (installed)"
		}
	}
	return "not_detected"
}

func ProcessBrainManifest(c *core.Core, brainPath string) (*ManifestSummary, error) {
	cmd := exec.Command(brainPath, "--json", "--help")
	output, err := cmd.Output()
	if err != nil { return nil, err }
	manifestFile := filepath.Join(c.Paths.AppDataDir, "config", "brain_manifest.json")
	_ = os.WriteFile(manifestFile, output, 0644)
	var full map[string]interface{}
	json.Unmarshal(output, &full)
	summary := &ManifestSummary{
		ManifestPath: manifestFile,
		Usage:        "brain [OPTIONS] <category> <command>",
		Categories:   []string{},
	}
	if cats, ok := full["categories"].([]interface{}); ok {
		for _, cat := range cats {
			if m, ok := cat.(map[string]interface{}); ok {
				summary.Categories = append(summary.Categories, m["name"].(string))
				if count, ok := m["command_count"].(float64); ok {
					summary.TotalCommands += int(count)
				}
			}
		}
	}
	return summary, nil
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
	if err != nil { return SystemStatus{SystemMap: make(map[string]string)} }
	var s SystemStatus
	json.Unmarshal(data, &s)
	if s.SystemMap == nil { s.SystemMap = make(map[string]string) }
	return s
}

func profileExistsInRegistry(c *core.Core, uuid string) bool {
	registryPath := filepath.Join(c.Paths.AppDataDir, "config", "profiles.json")
	data, err := os.ReadFile(registryPath)
	if err != nil { return false }
	var reg struct{ Profiles []map[string]interface{} `json:"profiles"` }
	json.Unmarshal(data, &reg)
	for _, p := range reg.Profiles {
		if p["id"] == uuid { return true }
	}
	return false
}

func FetchBrainManifest(brainPath string) (interface{}, error) {
	cmd := exec.Command(brainPath, "--json", "--help")
	output, err := cmd.Output()
	if err != nil { return nil, err }
	var manifest interface{}
	json.Unmarshal(output, &manifest)
	return manifest, nil
}