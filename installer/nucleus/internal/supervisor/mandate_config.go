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

// loadNucleusConfig lee nucleus.json desde bloomBase/config/.
//
// CORRECCIÓN: el path real es <bloomBase>/config/nucleus.json, no
// <bloomBase>/nucleus.json directo — confirmado contra el filesystem real
// (macOS: ~/Library/BloomNucleus/config/nucleus.json). La versión anterior
// de este archivo no tenía el subdirectorio "config" y fallaba en runtime
// con "no pude leer nucleus.json" pese a que el archivo sí existía.
func loadNucleusConfig(bloomBase string) (*NucleusConfig, error) {
	configPath := filepath.Join(bloomBase, "config", "nucleus.json")
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

// LoadMachineNucleusConfig es el entrypoint público de la versión LEGACY:
// resuelve bloomBase y lee nucleus.json de la instalación de máquina
// (single global workspace vía onboarding.workspace_path/workspace_org).
//
// RENOMBRADO desde LoadNucleusConfig — chocaba en el mismo paquete
// (internal/supervisor) con la función de igual nombre en supervisor.go,
// que implementa el mecanismo de auto-descubrimiento por workspace
// (.bloom/.nucleus-{slug}/.core/nucleus-config.json) definido como decisión
// vigente. LoadNucleusConfig (sin sufijo) pasa a ser esa versión nueva —
// ver supervisor.go.
//
// Esta función NO se borró: si algún comando del repo real todavía la
// llama por su nombre viejo, el compilador lo va a marcar en ese call site
// (no va a fallar en silencio — *NucleusConfig y *Config son tipos
// distintos con campos distintos, así que cualquier acceso a
// cfg.Onboarding.* en ese call site rompe la build de forma visible, no
// se comporta mal calladamente). Si aparece ese error en otro archivo,
// el fix ahí es cambiar la llamada a LoadMachineNucleusConfig().
func LoadMachineNucleusConfig() (*NucleusConfig, error) {
	return loadNucleusConfig(resolveBloomBase())
}

// MandatesRoot retorna la carpeta que vigila mandate_watcher.go:
// Ruta completa: <workspace_path>/.bloom/.nucleus-{org}/.mandates
// Aquí se crean los directorios por mandate (mandate_state.json y mandate.json;
// gen_state.json quedó deprecado — ver mandate_watcher.go).
func (cfg *NucleusConfig) MandatesRoot() string {
	return filepath.Join(
		cfg.Onboarding.WorkspacePath,
		".bloom",
		".nucleus-"+cfg.Onboarding.WorkspaceOrg,
		".mandates",
	)
}