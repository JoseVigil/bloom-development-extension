// internal/supervisor/service.go
package supervisor

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	bloomDirName         = ".bloom"
	nucleusPrefix        = ".nucleus-"
	nucleusConfigRelPath = ".core/nucleus-config.json"
)

// NucleusConfigFile espeja el contenido de .core/nucleus-config.json.
// Mantener sincronizado con el lado TS que lea el mismo archivo (si existe
// un equivalente a org-resolver.ts que lo parsee — no confirmado todavía,
// ver nota en resolveOrg() más abajo).
type NucleusConfigFile struct {
	Organization struct {
		Slug string `json:"slug"`
		Name string `json:"name,omitempty"`
	} `json:"organization"`
}

// Config es el resultado de resolver el Nucleus activo para el proceso
// actual: workspace root, slug de organización, y el JSON de config parseado.
//
// Se construye una sola vez por invocación de comando (LoadNucleusConfig) y
// viaja por los mismos call sites que en TS documenta MandateFsContext
// (mandate-paths.ts): comandos de mandate, watcher, y cualquier hook futuro
// que necesite resolver paths de .mandates/.
type Config struct {
	WorkspacePath string
	Slug          string
	Raw           NucleusConfigFile
}

// LoadNucleusConfig auto-descubre el Nucleus activo subiendo desde el
// directorio de trabajo actual (CWD) hasta encontrar
// <root>/.bloom/.nucleus-{slug}/.
//
// Es la única LoadNucleusConfig del paquete internal/supervisor — existía
// otra con el mismo nombre en mandate_config.go (versión legacy, instalación
// de máquina única) que chocaba en compilación. Se renombró a
// LoadMachineNucleusConfig(); ver ese archivo para el porqué.
//
// Mecanismo (debe permanecer equivalente al resolveOrg() del lado TS —
// ver src/utils/org-resolver.ts, importado por create-mandate.handler.ts.
// NOTA: no tengo el contenido real de org-resolver.ts todavía, así que esta
// implementación sigue la descripción textual que se dio en el turno
// anterior, no el código fuente TS. Si resolveOrg.ts hace algo distinto
// (por ejemplo, lee el slug de una env var en vez de escanear el FS),
// esto hay que ajustarlo para que coincida — señalarlo si es el caso):
//
//  1. Buscar carpeta .bloom subiendo desde CWD.
//  2. Dentro de .bloom, listar subcarpetas que matcheen ".nucleus-*".
//  3. Extraer el slug del nombre de carpeta (todo lo que sigue a ".nucleus-").
//  4. Leer .core/nucleus-config.json bajo esa carpeta para validar que es
//     un Nucleus real (no solo una carpeta con el nombre correcto).
func LoadNucleusConfig() (*Config, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return nil, fmt.Errorf("no pude obtener el directorio de trabajo: %w", err)
	}
	return loadNucleusConfigFrom(cwd)
}

// loadNucleusConfigFrom es la versión testeable de LoadNucleusConfig,
// parametrizada por punto de partida en vez de os.Getwd().
func loadNucleusConfigFrom(start string) (*Config, error) {
	workspaceRoot, bloomDir, err := findBloomDir(start)
	if err != nil {
		return nil, err
	}

	slug, nucleusDir, err := findNucleusDir(bloomDir)
	if err != nil {
		return nil, err
	}

	configPath := filepath.Join(nucleusDir, filepath.FromSlash(nucleusConfigRelPath))
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("no pude leer %s (¿nucleus mal inicializado?): %w", configPath, err)
	}

	var parsed NucleusConfigFile
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("nucleus-config.json inválido en %s: %w", configPath, err)
	}

	// El slug de la carpeta manda para resolver paths — si el JSON trae un
	// organization.slug distinto, no lo pisamos silenciosamente ni fallamos:
	// el nombre de carpeta es la fuente de verdad para MandatesRoot(),
	// porque es lo que determina el path real en disco. Un slug distinto
	// adentro del JSON sería una inconsistencia a reportar aparte, no algo
	// que debamos resolver acá arbitrariamente.
	if parsed.Organization.Slug != "" && parsed.Organization.Slug != slug {
		return nil, fmt.Errorf(
			"inconsistencia de org: carpeta %q pero nucleus-config.json declara organization.slug=%q — revisar manualmente",
			nucleusPrefix+slug, parsed.Organization.Slug,
		)
	}

	return &Config{
		WorkspacePath: workspaceRoot,
		Slug:          slug,
		Raw:           parsed,
	}, nil
}

// findBloomDir sube desde `start` hasta encontrar una carpeta `.bloom`.
// Devuelve (workspaceRoot, pathA.bloom, error).
func findBloomDir(start string) (string, string, error) {
	dir, err := filepath.Abs(start)
	if err != nil {
		return "", "", fmt.Errorf("no pude resolver path absoluto de %s: %w", start, err)
	}

	for {
		candidate := filepath.Join(dir, bloomDirName)
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			return dir, candidate, nil
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			return "", "", fmt.Errorf("no encontré carpeta %s subiendo desde %s", bloomDirName, start)
		}
		dir = parent
	}
}

// findNucleusDir busca la primera subcarpeta de bloomDir con prefijo
// ".nucleus-" y devuelve (slug, pathCompleto).
//
// Asume un único Nucleus activo por workspace. Si en algún momento se
// soporta más de uno (multi-org en el mismo workspace), esta función
// necesita un criterio de desambiguación explícito — no hay documento que
// lo cubra hoy, así que no lo invento acá.
func findNucleusDir(bloomDir string) (string, string, error) {
	entries, err := os.ReadDir(bloomDir)
	if err != nil {
		return "", "", fmt.Errorf("no pude leer %s: %w", bloomDir, err)
	}

	var matches []string
	for _, e := range entries {
		if e.IsDir() && strings.HasPrefix(e.Name(), nucleusPrefix) {
			matches = append(matches, e.Name())
		}
	}

	switch len(matches) {
	case 0:
		return "", "", fmt.Errorf("no encontré ninguna carpeta %s* dentro de %s", nucleusPrefix, bloomDir)
	case 1:
		slug := strings.TrimPrefix(matches[0], nucleusPrefix)
		if slug == "" {
			return "", "", fmt.Errorf("carpeta %q en %s no tiene slug después del prefijo", matches[0], bloomDir)
		}
		return slug, filepath.Join(bloomDir, matches[0]), nil
	default:
		return "", "", fmt.Errorf(
			"encontré %d carpetas %s* en %s (%v) — multi-org en el mismo workspace no está soportado, indefinido cuál usar",
			len(matches), nucleusPrefix, bloomDir, matches,
		)
	}
}

// MandatesRoot devuelve el path absoluto a .mandates/ para este Nucleus.
// Debe coincidir exactamente con mandatesRoot() en mandate-paths.ts (TS):
//
//	<workspace_path>/.bloom/.nucleus-{org}/.mandates
//
// No renombrar/mover sin actualizar el lado TS — mismo comentario que ya
// existe en mandate-paths.ts sobre no romper ese contrato implícito.
func (c *Config) MandatesRoot() string {
	return filepath.Join(c.WorkspacePath, bloomDirName, nucleusPrefix+c.Slug, ".mandates")
}
