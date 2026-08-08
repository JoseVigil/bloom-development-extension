// internal/core/org_context.go
package core

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// BloomDirName y NucleusPrefix son la convención de nombres compartida por
// todo el sistema para localizar el Nucleus activo de un workspace:
//
//	<workspace>/.bloom/.nucleus-{slug}/
//
// Exportadas para que internal/supervisor (Mandates) las consuma en vez de
// mantener su propia copia de las mismas constantes — deben permanecer
// idénticas a BLOOM_DIR_NAME / NUCLEUS_PREFIX en src/utils/org-resolver.ts
// (TS, VS Code extension).
const (
	BloomDirName  = ".bloom"
	NucleusPrefix = ".nucleus-"
)

// ResolveNucleusRoot devuelve la ruta absoluta a la carpeta de datos de la
// organización activa: ~/.bloom/.nucleus-{org}/
//
// FIX (auditoría multi-org): vault.go, blueprint.go, ownership.go y
// alfred.go resolvían esta ruta cada uno por su cuenta, hardcodeada como
// ~/.bloom/.nucleus/ — SIN sufijo de org. create.go nunca escribe ahí:
// delega en `brain nucleus create --org <slug>`, que produce
// ~/.bloom/.nucleus-{slug}/. Resultado real: con cualquier --org != "",
// vault/blueprint/ownership/alfred leen y escriben en una carpeta que
// create.go jamás generó — silenciosamente tratada como "no existe todavía"
// en vez de "es la org equivocada".
//
// FIX 2 (Etapa 2, PROMPT-EJECUCION-synapse-switch-organization.md): el
// fallback de más abajo dependía enteramente de BLOOM_ORG, una env var que
// (confirmado por auditoría de código — grep completo de Setenv/spawn-env/
// export en todo el repo) NINGÚN proceso escribe nunca. Ni vault.go,
// blueprint.go, ownership.go ni alfred.go exponen un flag --org propio
// tampoco. Resultado real: fuera de tests que setean BLOOM_NUCLEUS_ROOT a
// mano, esta función fallaba SIEMPRE en uso normal — Vault/Ownership/
// Blueprint/Alfred no tenían ninguna forma real de resolver la organización
// activa. Se agrega el mismo mecanismo de auto-descubrimiento por
// filesystem-scan que ya usaba (con éxito) Mandates vía
// internal/supervisor.LoadNucleusConfig() / src/utils/org-resolver.ts (TS)
// — ver ScanForNucleus()/ScanForNucleusFrom() más abajo en este mismo
// archivo. BLOOM_ORG se conserva como override
// explícito de menor prioridad que el scan automático no toca (por si algo
// externo al repo lo está seteando hoy; no se pudo confirmar ni descartar
// eso con certeza, así que no se elimina la lectura, solo deja de ser el
// único camino).
//
// Este es ahora el ÚNICO lugar que arma este path. Ningún otro archivo debe
// volver a hacer filepath.Join(homeDir, ".bloom", ".nucleus...") a mano.
func ResolveNucleusRoot(orgSlug string) (string, error) {
	// 1. Override explícito de la ruta completa — alfred.go ya usaba esta
	//    env var de forma aislada; se generaliza acá para que todos los
	//    módulos la respeten por igual (útil también para tests/simulation_env,
	//    donde queremos un resultado determinístico sin depender de CWD).
	if root := os.Getenv("BLOOM_NUCLEUS_ROOT"); root != "" {
		return root, nil
	}

	// 2. Org explícita pasada por el caller (ej. un futuro flag --org en
	//    los comandos vault/alfred), o BLOOM_ORG como override manual de
	//    menor prioridad — ver nota FIX 2 arriba sobre por qué esto ya no
	//    es el único camino.
	if orgSlug == "" {
		orgSlug = os.Getenv("BLOOM_ORG")
	}

	if orgSlug != "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(homeDir, ".bloom", fmt.Sprintf(".nucleus-%s", orgSlug)), nil
	}

	// 3. Auto-descubrimiento por filesystem-scan — el mecanismo que
	//    realmente funciona hoy en uso normal (mismo que Mandates). Sube
	//    desde CWD (o BLOOM_NUCLEUS_PATH para procesos de background) hasta
	//    encontrar .bloom/.nucleus-{slug}/.
	_, _, nucleusDir, scanErr := ScanForNucleus()
	if scanErr != nil {
		return "", fmt.Errorf(
			"no active organization: set BLOOM_NUCLEUS_ROOT, pass --org, set BLOOM_ORG, or run this from inside a workspace created by 'nucleus create' (scan fallback failed: %w)",
			scanErr,
		)
	}

	return nucleusDir, nil
}

// ScanForNucleusFrom sube desde startDir buscando la primera carpeta .bloom
// que contenga exactamente una subcarpeta .nucleus-{slug}. Devuelve
// (workspacePath, slug, nucleusDir).
//
// ETAPA 2 de PROMPT-EJECUCION-synapse-switch-organization.md — antes de este
// cambio existían DOS copias independientes de este escaneo: una en
// internal/supervisor/supervisor.go (findBloomDir + findNucleusDir, usada
// por Mandates) y ninguna equivalente del lado de ResolveNucleusRoot()
// (usada por Vault/Ownership/Blueprint/Alfred, que dependían en cambio de la
// env var BLOOM_ORG). Auditoría confirmó que BLOOM_ORG nunca la escribe
// ningún proceso del repo — ni Conductor, ni Brain, ni ningún script — así
// que ResolveNucleusRoot() fallaba siempre en uso real fuera de tests. Esta
// función consolida el escaneo acá, en internal/core, que ya es importado
// tanto por internal/vault y internal/governance (vía ResolveNucleusRoot)
// como por internal/supervisor — así Vault y Mandates quedan viendo
// exactamente la misma organización activa, resuelta por el mismo código.
//
// IMPORTANTE — esto NO cambia el comportamiento que ya tenía
// internal/supervisor.LoadNucleusConfig(): se para en la PRIMERA carpeta
// .bloom encontrada subiendo, exista o no un .nucleus-{slug} completo
// adentro (a diferencia de findValidNucleus() en org-resolver.ts, que si
// encuentra un .bloom "huérfano" — sin .nucleus-*/.core/.nucleus-config.json
// completo — lo saltea y sigue subiendo a buscar un ancestro válido). Esa
// diferencia de comportamiento entre Go y TS ya existía antes de este
// cambio y sigue existiendo después — no se resuelve acá porque está fuera
// del alcance de Etapa 2 (unificar BLOOM_ORG vs. scan), pero queda
// documentada explícitamente para que no se pierda: si en algún momento
// aparece un caso real de .bloom huérfano tapando un ancestro válido, Go y
// TS todavía pueden divergir en cuál error devuelven.
func ScanForNucleusFrom(startDir string) (workspacePath, slug, nucleusDir string, err error) {
	dir, err := filepath.Abs(startDir)
	if err != nil {
		return "", "", "", fmt.Errorf("no pude resolver path absoluto de %s: %w", startDir, err)
	}

	for {
		candidate := filepath.Join(dir, BloomDirName)
		if info, statErr := os.Stat(candidate); statErr == nil && info.IsDir() {
			entries, readErr := os.ReadDir(candidate)
			if readErr != nil {
				return "", "", "", fmt.Errorf("no pude leer %s: %w", candidate, readErr)
			}

			var matches []string
			for _, e := range entries {
				if e.IsDir() && strings.HasPrefix(e.Name(), NucleusPrefix) {
					matches = append(matches, e.Name())
				}
			}

			switch len(matches) {
			case 1:
				foundSlug := strings.TrimPrefix(matches[0], NucleusPrefix)
				if foundSlug == "" {
					return "", "", "", fmt.Errorf(
						"carpeta %q en %s no tiene slug después del prefijo", matches[0], candidate,
					)
				}
				return dir, foundSlug, filepath.Join(candidate, matches[0]), nil
			case 0:
				return "", "", "", fmt.Errorf(
					"no encontré ninguna carpeta %s* dentro de %s", NucleusPrefix, candidate,
				)
			default:
				return "", "", "", fmt.Errorf(
					"encontré %d carpetas %s* en %s (%v) — multi-org en el mismo workspace no está soportado, indefinido cuál usar",
					len(matches), NucleusPrefix, candidate, matches,
				)
			}
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			return "", "", "", fmt.Errorf("no encontré carpeta %s subiendo desde %s", BloomDirName, startDir)
		}
		dir = parent
	}
}

// ScanForNucleus es la versión no-parametrizada de ScanForNucleusFrom:
// resuelve el punto de partida contra BLOOM_NUCLEUS_PATH (override para
// procesos de background sin CWD significativo del usuario — os.Getwd() ahí
// resuelve al directorio del binario instalado, no al workspace real; mismo
// criterio que ya usaba internal/supervisor.LoadNucleusConfig() antes de
// este cambio) o, si no está seteada, el CWD real del proceso.
func ScanForNucleus() (workspacePath, slug, nucleusDir string, err error) {
	if envPath := os.Getenv("BLOOM_NUCLEUS_PATH"); envPath != "" {
		return ScanForNucleusFrom(envPath)
	}
	cwd, err := os.Getwd()
	if err != nil {
		return "", "", "", fmt.Errorf("no pude obtener el directorio de trabajo: %w", err)
	}
	return ScanForNucleusFrom(cwd)
}
