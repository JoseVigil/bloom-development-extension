// internal/supervisor/service.go
package supervisor

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"nucleus/internal/core"
)

const (
	// nucleusConfigFilename es el nombre real del archivo tal como lo
	// escribe `nucleus create` (delegado a `brain nucleus create`, ver
	// internal/governance/create.go, campo "files_created" del
	// json_response: ".core/.nucleus-config.json").
	//
	// ES UN DOTFILE — con punto adelante, igual que el resto de la
	// estructura .bloom/.core/.governance/etc. Bug histórico: esta
	// constante vivía como ".core/nucleus-config.json" (sin el punto
	// inicial del nombre de archivo) directamente en
	// nucleusConfigRelPath, lo que rompía todo `mandate genesis` corrido
	// sobre un workspace creado con `nucleus create`. Mantener el nombre
	// acá, en una sola constante, para que este typo no pueda reaparecer.
	nucleusConfigFilename = ".nucleus-config.json"

	nucleusConfigRelPath = ".core/" + nucleusConfigFilename
)

// NucleusConfigFile espeja el contenido de .core/.nucleus-config.json.
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
//  4. Leer .core/.nucleus-config.json bajo esa carpeta para validar que es
//     un Nucleus real (no solo una carpeta con el nombre correcto).
func LoadNucleusConfig() (*Config, error) {
	// Etapa 2 (PROMPT-EJECUCION-synapse-switch-organization.md): el escaneo
	// en sí (antes duplicado acá como findBloomDir+findNucleusDir, con el
	// override BLOOM_NUCLEUS_PATH manejado en esta misma función) ahora vive
	// en internal/core.ScanForNucleus() — el mismo código que
	// core.ResolveNucleusRoot() usa para Vault/Ownership/Blueprint/Alfred.
	// Antes de este cambio existían dos copias independientes de esta
	// lógica que podían divergir en silencio; ahora Mandates y Vault
	// resuelven la organización activa exactamente con el mismo código.
	workspaceRoot, slug, nucleusDir, err := core.ScanForNucleus()
	if err != nil {
		return nil, err
	}
	return loadNucleusConfigAt(workspaceRoot, slug, nucleusDir)
}

// loadNucleusConfigFrom es la versión testeable de LoadNucleusConfig,
// parametrizada por punto de partida en vez de os.Getwd()/BLOOM_NUCLEUS_PATH.
func loadNucleusConfigFrom(start string) (*Config, error) {
	workspaceRoot, slug, nucleusDir, err := core.ScanForNucleusFrom(start)
	if err != nil {
		return nil, err
	}
	return loadNucleusConfigAt(workspaceRoot, slug, nucleusDir)
}

// loadNucleusConfigAt lee y valida .core/.nucleus-config.json dentro de un
// nucleusDir ya resuelto por internal/core.ScanForNucleus(From). Separado de
// la resolución del path en sí para que ambas variantes (LoadNucleusConfig /
// loadNucleusConfigFrom) compartan la misma lógica de lectura/validación.
func loadNucleusConfigAt(workspaceRoot, slug, nucleusDir string) (*Config, error) {
	configPath := filepath.Join(nucleusDir, filepath.FromSlash(nucleusConfigRelPath))
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("no pude leer %s (¿nucleus mal inicializado?): %w", configPath, err)
	}

	var parsed NucleusConfigFile
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("%s inválido en %s: %w", nucleusConfigFilename, configPath, err)
	}

	// El slug de la carpeta manda para resolver paths — si el JSON trae un
	// organization.slug distinto, no lo pisamos silenciosamente ni fallamos:
	// el nombre de carpeta es la fuente de verdad para MandatesRoot(),
	// porque es lo que determina el path real en disco. Un slug distinto
	// adentro del JSON sería una inconsistencia a reportar aparte, no algo
	// que debamos resolver acá arbitrariamente.
	if parsed.Organization.Slug != "" && parsed.Organization.Slug != slug {
		return nil, fmt.Errorf(
			"inconsistencia de org: carpeta %q pero %s declara organization.slug=%q — revisar manualmente",
			core.NucleusPrefix+slug, nucleusConfigFilename, parsed.Organization.Slug,
		)
	}

	return &Config{
		WorkspacePath: workspaceRoot,
		Slug:          slug,
		Raw:           parsed,
	}, nil
}

// findBloomDir/findNucleusDir vivían acá — se movieron a
// internal/core.ScanForNucleusFrom() en Etapa 2
// (PROMPT-EJECUCION-synapse-switch-organization.md) para que
// core.ResolveNucleusRoot() (Vault/Ownership/Blueprint/Alfred) y este
// LoadNucleusConfig (Mandates) compartan un único escaneo en vez de dos
// copias independientes que podían divergir. Ver nucleus_scan.go para el
// código real y las notas sobre la diferencia de comportamiento que sigue
// existiendo frente a findValidNucleus() en org-resolver.ts (TS) respecto a
// carpetas .bloom huérfanas.

// MandatesRoot devuelve el path absoluto a .mandates/ para este Nucleus.
// Debe coincidir exactamente con mandatesRoot() en mandate-paths.ts (TS):
//
//	<workspace_path>/.bloom/.nucleus-{org}/.mandates
//
// No renombrar/mover sin actualizar el lado TS — mismo comentario que ya
// existe en mandate-paths.ts sobre no romper ese contrato implícito.
func (c *Config) MandatesRoot() string {
	return filepath.Join(c.WorkspacePath, core.BloomDirName, core.NucleusPrefix+c.Slug, ".mandates")
}
