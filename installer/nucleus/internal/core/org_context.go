// internal/core/org_context.go
package core

import (
	"encoding/json"
	"errors"
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

// ActiveOrgContext is the active organization persisted by the installed
// Nucleus in config/nucleus.json.
type ActiveOrgContext struct {
	OrgSlug          string
	OrganizationID   string
	AuthorityBaseURL string
	WorkspacePath    string
	NucleusRoot      string
}

type machineNucleusConfig struct {
	AuthorityBaseURL string `json:"authority_base_url"`
	Onboarding       struct {
		ActiveOrgSlug string `json:"active_org_slug"`
		Organizations []struct {
			OrgSlug        string `json:"org_slug"`
			OrganizationID string `json:"organization_id"`
			WorkspacePath  string `json:"workspace_path"`
		} `json:"organizations"`
	} `json:"onboarding"`
}

// ResolveActiveOrgContext reads the installed machine configuration. It is
// independent from the process CWD and fails closed on inconsistent data.
func ResolveActiveOrgContext() (*ActiveOrgContext, error) {
	configPath := filepath.Join(ResolveAppDataDir(), "config", "nucleus.json")
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("no pude leer nucleus.json en %s: %w", configPath, err)
	}

	var cfg machineNucleusConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, fmt.Errorf("nucleus.json inválido en %s: %w", configPath, err)
	}
	if cfg.Onboarding.ActiveOrgSlug == "" {
		return nil, fmt.Errorf("nucleus.json en %s no tiene onboarding.active_org_slug", configPath)
	}

	for _, org := range cfg.Onboarding.Organizations {
		if org.OrgSlug != cfg.Onboarding.ActiveOrgSlug {
			continue
		}
		if org.WorkspacePath == "" {
			return nil, fmt.Errorf(
				"organización activa %q en %s no tiene workspace_path",
				org.OrgSlug,
				configPath,
			)
		}
		if org.OrganizationID == "" {
			return nil, fmt.Errorf("organization_id_missing: organización activa %q", org.OrgSlug)
		}
		if cfg.AuthorityBaseURL == "" {
			return nil, errors.New("authority_base_url_missing")
		}

		nucleusRoot := filepath.Join(
			org.WorkspacePath,
			BloomDirName,
			NucleusPrefix+org.OrgSlug,
		)
		nucleusConfig := filepath.Join(nucleusRoot, ".core", ".nucleus-config.json")
		if info, statErr := os.Stat(nucleusConfig); statErr != nil || info.IsDir() {
			if statErr != nil {
				return nil, fmt.Errorf("Nucleus activo inválido: no pude leer %s: %w", nucleusConfig, statErr)
			}
			return nil, fmt.Errorf("Nucleus activo inválido: %s no es un archivo", nucleusConfig)
		}

		return &ActiveOrgContext{
			OrgSlug:          org.OrgSlug,
			OrganizationID:   org.OrganizationID,
			AuthorityBaseURL: cfg.AuthorityBaseURL,
			WorkspacePath:    filepath.Clean(org.WorkspacePath),
			NucleusRoot:      filepath.Clean(nucleusRoot),
		}, nil
	}

	return nil, fmt.Errorf(
		"onboarding.active_org_slug=%q no existe en onboarding.organizations de %s",
		cfg.Onboarding.ActiveOrgSlug,
		configPath,
	)
}

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
// FIX 2 (Etapa 2, ORGANIZATION_SWITCH_IMPLEMENTATION_STATUS.md): el
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

	// 3. Installed machine configuration — canonical path for nucleus.exe
	//    invoked from PATH, independent from the caller's CWD.
	activeContext, configErr := ResolveActiveOrgContext()
	if configErr == nil {
		return activeContext.NucleusRoot, nil
	}
	if !errors.Is(configErr, os.ErrNotExist) {
		return "", configErr
	}

	// 4. Auto-descubrimiento por filesystem-scan — fallback for development
	//    environments without an installed machine configuration. El mecanismo que
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
// ETAPA 2 de ORGANIZATION_SWITCH_IMPLEMENTATION_STATUS.md — antes de este
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

// RecordOrganizationTenantID anota (o actualiza) el campo plano tenant_id en la
// entrada de onboarding.organizations[] de config/nucleus.json que corresponde a
// orgSlug — Sovereign Tenant Fase 5, ajuste pedido por Jose 2026-09-16, además de la
// reconciliación criptográfica que ya persiste TenantID en .ownership.json (ver
// governance/ownership_reconciliation.go). El propósito es exclusivamente de
// presentación: que interfaces gráficas (Conductor) puedan agrupar organizaciones por
// tenant sin leer .ownership.json de cada una.
//
// Deliberadamente aditivo — NO cambia la forma del array onboarding.organizations
// (nada de anidar por tenant): ese array también lo escribe Conductor (Electron/JS,
// fuera de este repo, confirmado en Cierre_Implementacion_Nucleus_Genesis_Bootstrap_
// v1_0.md), así que restructurarlo necesitaría coordinar un cambio de schema con ese
// código, no sólo con Nucleus. Por eso esta función lee y reescribe el archivo como
// JSON genérico (map[string]any) — mismo criterio que ya documentaba el diseño de
// writeActiveOrgContext en ese cierre — y toca únicamente la clave tenant_id dentro de
// la entrada ya existente, preservando cualquier otro campo, de esa organización o de
// cualquier otra sección del archivo (installation, system_map, binary_versions,
// milestones, ...), sin conocerlos.
//
// Contrapartida aceptada, no nueva de este cambio: encoding/json ordena las claves de
// un map[string]any alfabéticamente al serializar, así que el archivo puede terminar
// con las claves en otro orden que el original. El orden de claves no tiene
// significado en JSON; ningún lector confirmado de este archivo depende de él.
//
// Falla explícita (error) si orgSlug no aparece en onboarding.organizations, o si
// aparece pero su organization_id no coincide con organizationID — mismo criterio
// "fail closed on inconsistent data" que ya usa ResolveActiveOrgContext en este mismo
// archivo, para no anotar tenant_id en la entrada equivocada. El caller (authority_
// command.go, caso "sync") trata cualquier error de esta función como no-fatal.
//
// Idempotente: si la organización ya tiene exactamente ese tenant_id, no reescribe el
// archivo.
func RecordOrganizationTenantID(orgSlug, organizationID, tenantID string) error {
	if orgSlug == "" || organizationID == "" || tenantID == "" {
		return errors.New("record organization tenant id requires org slug, organization id and tenant id")
	}

	configPath := filepath.Join(ResolveAppDataDir(), "config", "nucleus.json")
	raw, err := os.ReadFile(configPath)
	if err != nil {
		return fmt.Errorf("no pude leer nucleus.json en %s: %w", configPath, err)
	}

	var root map[string]any
	if err := json.Unmarshal(raw, &root); err != nil {
		return fmt.Errorf("nucleus.json inválido en %s: %w", configPath, err)
	}

	onboarding, ok := root["onboarding"].(map[string]any)
	if !ok {
		return fmt.Errorf("nucleus.json en %s no tiene onboarding", configPath)
	}
	organizationsRaw, ok := onboarding["organizations"].([]any)
	if !ok {
		return fmt.Errorf("nucleus.json en %s no tiene onboarding.organizations", configPath)
	}

	var target map[string]any
	for _, entry := range organizationsRaw {
		candidate, ok := entry.(map[string]any)
		if !ok {
			continue
		}
		if slug, _ := candidate["org_slug"].(string); slug == orgSlug {
			target = candidate
			break
		}
	}
	if target == nil {
		return fmt.Errorf("org_slug %q no existe en onboarding.organizations de %s", orgSlug, configPath)
	}
	if existingID, _ := target["organization_id"].(string); existingID != organizationID {
		return fmt.Errorf(
			"onboarding.organizations[org_slug=%q].organization_id=%q no coincide con %q — me niego a anotar tenant_id en la entrada equivocada",
			orgSlug, existingID, organizationID,
		)
	}

	if current, _ := target["tenant_id"].(string); current == tenantID {
		return nil // idempotente: ya tiene exactamente este tenant_id.
	}
	target["tenant_id"] = tenantID

	data, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return fmt.Errorf("no pude serializar nucleus.json: %w", err)
	}
	return atomicWriteMachineConfig(configPath, append(data, '\n'))
}

// atomicWriteMachineConfig escribe config/nucleus.json de forma atómica (archivo
// temporal en el mismo directorio + rename) — mismo principio que ya usan
// governance/ownership_migration.go (atomicReplace) y blueprint.go (SaveBlueprint).
// Sin flock: este archivo no tiene hoy ningún mecanismo de lock, ni de Conductor ni de
// Nucleus (confirmado en Cierre_Implementacion_Nucleus_Genesis_Bootstrap_v1_0.md, "no
// hay file locking acá, a diferencia de .ownership.json") — agregar uno unilateral acá
// no protegería contra un escritor externo que no lo respeta, así que se deja como el
// mismo gap ya conocido y documentado, no uno introducido por este cambio.
func atomicWriteMachineConfig(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".nucleus.*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer func() { _ = os.Remove(tmpPath) }()
	if _, err = tmp.Write(data); err == nil {
		err = tmp.Sync()
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}
