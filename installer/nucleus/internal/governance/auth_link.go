// File: nucleus/internal/governance/auth_link.go
// Comando: nucleus auth link
// Categoría: GOVERNANCE
//
// Implementa Encargo_Correccion_Nucleus_Comando_Vinculacion_Organizacion_v2_0.md
// (renombre desde 'nucleus auth genesis' → 'nucleus auth link'; sin cambios de
// lógica/comportamiento en esta ronda — ver §2.1/§2.3).
//
// Vincula esta instalación de Nucleus con la organización creada por Génesis:
// llena el único hueco que faltaba entre "brain nucleus create" (crea el árbol
// local) y "nucleus authority sync" (ya sabe registrar la instalación y
// sincronizar, leyendo organizationId desde config/nucleus.json vía
// core.ResolveActiveOrgContext) — nada escribía ese organizationId real después
// de que el humano completa el login de GitHub en el navegador. Este comando
// abre el navegador en la variante GET de /v1/authority/genesis/login, recibe
// el organizationId pegado por el humano, lo escribe en config/nucleus.json, y
// corre inmediatamente la misma lógica que defaultAuthorityServices(c).Run("sync", nil)
// ya usa en authority_command.go — sin reabrir ni duplicar ese código.
//
// Nota de nomenclatura (v2.0 §0): "Génesis" es, en el backend, el flujo real de
// creación de organización vía login de GitHub
// (backend/src/authority/genesis-store.ts, endpoint /v1/authority/genesis/login)
// — ese nombre es correcto ahí y no cambia. El comando de este archivo se
// llamaba 'nucleus auth genesis' y colisionaba en el nombre con el concepto no
// relacionado "Mandate Genesis" de orchestration/*mandate_genesis* (bootstrap de
// mandates vía Temporal); por eso este comando pasa a llamarse 'nucleus auth
// link' y se retira el término "bootstrap" del vocabulario de este archivo.
//
// Logging estructurado (v2.0 §2.2): runAuthLink usa core.InitLogger(&c.Paths,
// "GOVERNANCE", c.IsJSON) — el mismo mecanismo interno de nucleus que ya usan
// otros comandos (ver alfred_server.go) para escribir a
// logs/nucleus/nucleus_governance_YYYYMMDD.log y auto-registrar el stream
// nucleus_governance en telemetry.json vía la primitiva interna de
// GetTelemetryManager (mismo lock/merge/rename atómico que usa
// 'nucleus telemetry register' — ver BLOOM_NUCLEUS_LOGGING_SPEC.md). No se creó
// ningún logger nuevo ni un archivo de log aparte: "GOVERNANCE" ya era una
// categoría de primera clase en internal/core/logger.go (icono y descripción
// propios) antes de este cambio. La única línea que sigue yendo por
// fmt.Fprint(out, ...) es el reporte final de evidencia (rendered) — se dejó así
// a propósito porque es el mismo patrón que usa el comando hermano
// 'nucleus authority sync' (ver renderAuthorityEvidence + fmt.Fprint en
// authority_command.go): ese reporte es el contrato de salida --json del
// comando y no debe llevar el prefijo de nivel/timestamp del logger.
package governance

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
	"nucleus/internal/core"
)

// openBrowser es una var (no una función suelta) para que los tests puedan
// reemplazarla y no dependan de tener un navegador real disponible.
var openBrowser = func(target string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", target)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", target)
	default:
		cmd = exec.Command("xdg-open", target)
	}
	return cmd.Start()
}

func init() {
	core.RegisterCommand("GOVERNANCE", createAuthCommand)
}

func createAuthCommand(c *core.Core) *cobra.Command {
	root := &cobra.Command{
		Use:         "auth",
		Short:       "Autenticar esta instalación de Nucleus contra Authority",
		Args:        cobra.NoArgs,
		Annotations: map[string]string{"category": "GOVERNANCE"},
	}
	root.SilenceUsage = true
	root.SilenceErrors = true
	root.AddCommand(createAuthLinkCommand(c))
	return root
}

func createAuthLinkCommand(c *core.Core) *cobra.Command {
	var authorityURL, orgSlug, workspacePath string

	cmd := &cobra.Command{
		Use:   "link",
		Short: "Vincula esta instalación de Nucleus con la organización creada por Génesis y corre el primer sync",
		Long: `Abre el navegador del sistema en <authority-url>/v1/authority/genesis/login para que
el humano complete el login de GitHub que Génesis necesita. Ese flujo está atado por
cookie al navegador que lo inició (protección anti-CSRF del diseño) — la CLI no puede
completarlo por su cuenta, ver Encargo_Correccion_Nucleus_Comando_Vinculacion_Organizacion_v2_0.md §0.

La página de callback devuelve el JSON crudo que ya devuelve hoy (o alcanza con pegar
sólo el campo organizationId). Este comando toma esa respuesta, la escribe en
config/nucleus.json, y corre inmediatamente la misma lógica que 'nucleus authority sync'.

Requiere que 'nucleus create --org <slug> --path <path>' ya se haya corrido antes.`,
		Args: cobra.NoArgs,
		Annotations: map[string]string{
			"category":      "GOVERNANCE",
			"json_response": `{"schema":"bloom.authority.cli-evidence/v1","command":"sync","ok":true,"evidence":{"performed":true,"installation_id":"...","organization_id":"...","authority_version":"1"}}`,
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			return runAuthLink(cmd, c, authorityURL, orgSlug, workspacePath)
		},
	}

	cmd.Flags().StringVar(&authorityURL, "authority-url", "", "URL base del backend de Authority (obligatorio)")
	cmd.Flags().StringVar(&orgSlug, "org", "", "Slug de organización ya usado en 'nucleus create' (obligatorio)")
	cmd.Flags().StringVar(&workspacePath, "path", "", "Workspace path ya usado en 'nucleus create' (obligatorio)")
	_ = cmd.MarkFlagRequired("authority-url")
	_ = cmd.MarkFlagRequired("org")
	_ = cmd.MarkFlagRequired("path")

	return cmd
}

// runAuthLink vincula la instalación con la organización creada por Génesis y
// corre el primer sync. La narración operativa (URL a abrir, prompt de pegado,
// confirmación de organizationId) va por el logger estructurado de GOVERNANCE
// (ver nota de logging en el encabezado del archivo) — en modo interactivo esas
// líneas igual llegan a consola (el logger multiplexa a archivo + stdout/stderr
// según c.IsJSON), sólo que ahora también quedan en
// logs/nucleus/nucleus_governance_YYYYMMDD.log. El reporte final de evidencia
// (rendered) es la excepción: sigue yendo por fmt.Fprint(out, ...) sin pasar por
// el logger, igual que en 'nucleus authority sync', para no romper el contrato
// de salida --json.
func runAuthLink(cmd *cobra.Command, c *core.Core, authorityURL, orgSlug, workspacePath string) error {
	loginURL := strings.TrimRight(authorityURL, "/") + "/v1/authority/genesis/login"
	out := cmd.OutOrStdout()

	logger, err := core.InitLogger(&c.Paths, "GOVERNANCE", c.IsJSON)
	if err != nil {
		return fmt.Errorf("no pude inicializar el logger de GOVERNANCE: %w", err)
	}
	defer logger.Close()

	logger.Info("Abriendo el navegador en: %s", loginURL)
	logger.Info("Completá ahí el login de GitHub. Cuando termine, la página te va a mostrar un JSON (o directamente el organizationId). Pegalo acá y presioná Enter:")
	if err := openBrowser(loginURL); err != nil {
		logger.Warning("no pude abrir el navegador automáticamente: %v — abrí el link de arriba a mano", err)
	}

	line, err := readLine(cmd.InOrStdin())
	if err != nil {
		return fmt.Errorf("no pude leer la respuesta: %w", err)
	}
	organizationID, err := extractOrganizationID(line)
	if err != nil {
		return err
	}

	if err := writeActiveOrgContext(orgSlug, organizationID, authorityURL, workspacePath); err != nil {
		return fmt.Errorf("no pude registrar el organizationId en config/nucleus.json: %w", err)
	}
	logger.Success("organizationId registrado: %s", organizationID)

	report, syncErr := defaultAuthorityServices(c).Run("sync", nil)
	rendered, renderErr := renderAuthorityEvidence(report, c.IsJSON)
	if renderErr != nil {
		return renderErr
	}
	if _, writeErr := fmt.Fprint(out, rendered); writeErr != nil {
		return writeErr
	}
	return syncErr
}

// readLine lee una sola línea de r, tolerando que no termine en salto de línea
// (por ejemplo cuando el test o el usuario no manda un '\n' final).
func readLine(r io.Reader) (string, error) {
	reader := bufio.NewReader(r)
	line, err := reader.ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

// extractOrganizationID acepta tanto el organizationId pegado tal cual como el JSON
// crudo que devuelve hoy el callback de Génesis — si el texto pegado empieza con '{',
// lo parsea como JSON y extrae el campo organizationId (mismo nombre exacto que
// devuelve administration-route.ts); si no, usa el texto tal cual, recortado.
func extractOrganizationID(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", errors.New("respuesta vacía: pegá el organizationId o el JSON que te mostró la página")
	}
	if strings.HasPrefix(trimmed, "{") {
		var body struct {
			OrganizationID string `json:"organizationId"`
		}
		if err := json.Unmarshal([]byte(trimmed), &body); err != nil {
			return "", fmt.Errorf("no pude parsear el JSON pegado: %w", err)
		}
		if body.OrganizationID == "" {
			return "", errors.New("el JSON pegado no tiene el campo organizationId")
		}
		return body.OrganizationID, nil
	}
	return trimmed, nil
}

// writeActiveOrgContext escribe (o actualiza) la entrada de orgSlug en
// config/nucleus.json — mismo archivo y mismo shape que lee
// core.ResolveActiveOrgContext (internal/core/org_context.go).
//
// Lee el archivo como JSON genérico (map[string]any), no como un struct estrecho:
// no hay, en este módulo Go, evidencia de que este comando sea el único escritor de
// este archivo — un comentario ya existente en org_switch_guard.go documenta que
// Conductor (fuera de este repo) ya escribe onboarding.active_org_slug vía
// shared/onboarding-schema.js#getOrCreateOrg(). Leer/escribir genérico evita pisar a
// ciegas cualquier campo que ese u otro proceso externo ya haya escrito — se toca
// sólo lo que este comando necesita tocar (ver hallazgo de §2.4 en el cierre de
// Encargo_Implementacion_Nucleus_Genesis_Bootstrap_v1_0.md, que sigue vigente y sin
// resolver — ver v2.0 §5).
func writeActiveOrgContext(orgSlug, organizationID, authorityURL, workspacePath string) error {
	if orgSlug == "" || organizationID == "" || authorityURL == "" || workspacePath == "" {
		return errors.New("orgSlug, organizationID, authorityURL y workspacePath son obligatorios")
	}
	path := filepath.Join(core.ResolveAppDataDir(), "config", "nucleus.json")

	root := map[string]any{}
	raw, err := os.ReadFile(path)
	switch {
	case err == nil && len(strings.TrimSpace(string(raw))) > 0:
		if jsonErr := json.Unmarshal(raw, &root); jsonErr != nil {
			return fmt.Errorf("nucleus.json existente en %s es inválido, no lo piso a ciegas: %w", path, jsonErr)
		}
	case err != nil && !os.IsNotExist(err):
		return err
	}

	// authority_base_url: §2.2 paso 3 pide fijarlo "si no estaba seteado" — nunca
	// pisa un valor ya presente (pudo haberlo escrito Conductor u otro proceso).
	if current, _ := root["authority_base_url"].(string); current == "" {
		root["authority_base_url"] = authorityURL
	}

	onboarding, _ := root["onboarding"].(map[string]any)
	if onboarding == nil {
		onboarding = map[string]any{}
	}
	onboarding["active_org_slug"] = orgSlug

	organizations, _ := onboarding["organizations"].([]any)
	found := false
	for i, entryRaw := range organizations {
		entry, ok := entryRaw.(map[string]any)
		if !ok {
			continue
		}
		if slug, _ := entry["org_slug"].(string); slug != orgSlug {
			continue
		}
		// Sólo actualiza organization_id/workspace_path — preserva cualquier otro
		// campo que ya tuviera esta entrada.
		entry["organization_id"] = organizationID
		entry["workspace_path"] = workspacePath
		organizations[i] = entry
		found = true
		break
	}
	if !found {
		organizations = append(organizations, map[string]any{
			"org_slug":        orgSlug,
			"organization_id": organizationID,
			"workspace_path":  workspacePath,
		})
	}
	onboarding["organizations"] = organizations
	root["onboarding"] = onboarding

	encoded, err := json.MarshalIndent(root, "", "  ")
	if err != nil {
		return err
	}
	// atomicReplace ya vive en este mismo paquete (ownership_migration.go) — mismo
	// principio de escritura atómica (archivo temporal + rename) que usa
	// internal/authority/checkpoint.go, replicado ahí para no crear una dependencia
	// nueva entre paquetes.
	return atomicReplace(path, append(encoded, '\n'), 0600, "before_nucleus_config_rename")
}
