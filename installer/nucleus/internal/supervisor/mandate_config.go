// internal/supervisor/mandate_config.go
package supervisor

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// NucleusConfig espeja nucleus.json (instalación de máquina).
// Estructura mínima necesaria para leer la configuración de onboarding
// del workspace y organización del usuario.
type NucleusConfig struct {
	Onboarding struct {
		WorkspacePath string `json:"workspace_path"`
		WorkspaceOrg  string `json:"workspace_org"`
	} `json:"onboarding"`
}

// resolveBloomBase resuelve el directorio base de instalación de BloomNucleus.
// Usa el mismo patrón de paths que mandates.HooksBaseDir() para mantener
// consistencia en todo el repositorio.
// Replica el mismo switch por OS que ya usa mandates.HooksBaseDir() en
// mandate_runner.go, para no introducir un tercer criterio de resolución de
// paths en el repo. NO es el mismo campo que lee getBloomDir() (que lee
// installation.origin_path) — ese sigue viviendo donde ya vive.
func resolveBloomBase() string {
	switch runtime.GOOS {
	case "windows":
		return filepath.Join(os.Getenv("LOCALAPPDATA"), "BloomNucleus")
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "BloomNucleus")
	default:
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".local", "share", "BloomNucleus")
	}
}

// loadNucleusConfig lee nucleus.json desde bloomBase.
func loadNucleusConfig(bloomBase string) (*NucleusConfig, error) {
	configPath := filepath.Join(bloomBase, "nucleus.json")
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("no pude leer nucleus.json en %s: %w", configPath, err)
	}
	var cfg NucleusConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("nucleus.json inválido en %s: %w", configPath, err)
	}
	if cfg.Onboarding.WorkspaceOrg == "" {
		return nil, fmt.Errorf("nucleus.json en %s no tiene onboarding.workspace_org", configPath)
	}
	return &cfg, nil
}

// LoadNucleusConfig es el entrypoint público: resuelve bloomBase y lee
// nucleus.json. Usado hoy por orchestration/commands/mandate.go (via este
// export) — no confundir con getBloomDir(), que resuelve otro campo
// (installation.origin_path) para otro propósito (raíz del repo en dev).
func LoadNucleusConfig() (*NucleusConfig, error) {
	return loadNucleusConfig(resolveBloomBase())
}

// MandatesRoot retorna la carpeta que vigila mandate_watcher.go:
// Ruta completa: <workspace_path>/.bloom/.nucleus-{org}/.mandates
// Aquí se crean los directorios por mandate (con gen_state.json y mandate.json).
// <workspace_path>/.bloom/.nucleus-{org}/.mandates
func (cfg *NucleusConfig) MandatesRoot() string {
	return filepath.Join(
		cfg.Onboarding.WorkspacePath,
		".bloom",
		".nucleus-"+cfg.Onboarding.WorkspaceOrg,
		".mandates",
	)
}