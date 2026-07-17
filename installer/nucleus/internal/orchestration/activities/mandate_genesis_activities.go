// internal/orchestration/activities/mandate_genesis_activities.go
package activities

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────
// CAMBIO esta sesión: se agrega ScaffoldMode para distinguir Fase 2
// (dry_run: solo análisis, escribe domain_proposal.json, no toca
// .scaffold/) de Fase 4 (real: escribe .scaffold/.domain_{name}/ de
// verdad). Antes de este cambio, ScaffoldDomainActivity era literalmente
// la misma función sin ninguna rama para las dos fases (confirmado en
// turno anterior) — este es el fix de esa inconsistencia.
//
// SIGUE PENDIENTE, no resuelto en este cambio: la llamada real a Brain
// (TODO original, TCP puerto 5678) no se implementa acá — sigue sin
// existir ese cliente. dry_run hoy sigue devolviendo un solo dominio
// (input.Project), no clustering real de Brain. Este cambio ordena el
// ciclo de vida (dry_run vs real, y cuándo se escribe qué), no agrega
// clustering — son problemas distintos.
//
// RUTA DE ESCRITURA: uso {mandatesRoot}/{mandateID}/domain_proposal.json
// (plano), el mismo layout que ya usan mandate.go / mandate_watcher.go /
// mandate_genesis_domains_cmd.go para mandate.json y mandate_state.json.
// NO uso la ruta anidada .bloom/.intents/.gen/.../.analysis/ que muestra
// bloom_project_tree_gen.txt — esa convención nunca se confirmó contra
// ningún escritor Go real que haya visto, y mezclar dos layouts de
// filesystem sin confirmación sería inventar. Si el layout anidado es el
// correcto, hay que decirlo explícitamente y este path cambia.
// ─────────────────────────────────────────────────────────────────────────

type ScaffoldMode string

const (
	ScaffoldModeDryRun ScaffoldMode = "dry_run" // Fase 2: solo análisis
	ScaffoldModeReal   ScaffoldMode = "real"    // Fase 4: escritura real
)

type ScaffoldDomainInput struct {
	MandateID    string
	ActionID     string
	DomainName   string
	Files        []string
	Mode         ScaffoldMode
	MandatesRoot string // requerido en ambos modos: dónde vive {mandateID}/
}

type ScaffoldDomainResult struct {
	ResultRef string // path relativo a .intents/.gen/.../report.json (dry_run) o al scaffold escrito (real)
	// Domains — CAMPO NUEVO esta sesión. Solo poblado en Mode=dry_run: la
	// misma lista que se acaba de escribir en domain_proposal.json. Se
	// devuelve acá porque el workflow (caller) NO puede leer archivos por
	// su cuenta — el código de un Workflow de Temporal debe ser
	// determinista, toda I/O tiene que pasar por una Activity. Sin esto,
	// MandateGenesisBuildWorkflow no tendría forma de construir
	// candidateDomains para pasarle a PersistHumanSyncActivity más
	// adelante sin una activity de lectura aparte.
	Domains []ProposedDomain
}

// ProposedDomain — un elemento de domains[] en domain_proposal.json.
//
// CAMBIO esta sesión (corrección de arquitectura sobre el turno anterior):
// id YA NO es igual a domainName. domainName es mutable (rename es
// operación obligatoria del diseño, confirmado en
// bloom-mandate-arquitectura-genesis-conductor.md) — un id derivado de un
// campo mutable rompe trazabilidad en cuanto alguien renombra después de
// que ya se emitieron eventos o se escribieron carpetas con ese id. El id
// ahora se genera una sola vez acá (dom_{slug}_{sufijo}) y no cambia
// aunque domainName cambie después.
//
// suggestedActionCount se agrega al shape en este turno (no estaba en la
// versión anterior) — hoy siempre vale 1 porque no hay clustering real
// (mismo placeholder que cohesionScore: 1.0), ver nota en scaffoldDryRun.
type ProposedDomain struct {
	ID                   string   `json:"id"`
	DomainName           string   `json:"domainName"`
	CohesionScore        float64  `json:"cohesionScore"`
	SuggestedActionCount int      `json:"suggestedActionCount"`
	Files                []string `json:"files"`
}

var slugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// domainSlug normaliza domainName para el prefijo legible del id: minúsculas,
// separadores no alfanuméricos colapsados a "_", sin guiones al borde.
// "Billing" -> "billing", "User Auth!!" -> "user_auth".
func domainSlug(domainName string) string {
	s := strings.ToLower(strings.TrimSpace(domainName))
	s = slugNonAlnum.ReplaceAllString(s, "_")
	s = strings.Trim(s, "_")
	if s == "" {
		s = "domain"
	}
	return s
}

// randomSuffix genera el sufijo corto que evita colisión entre dos
// dominios cuyo nombre normalice al mismo slug (p. ej. "Billing" y
// "billing " en el mismo proposal). 4 bytes hex = 8 caracteres es más de
// lo que pediste en el ejemplo (a3f1, 4 chars) — uso 2 bytes (4 hex chars)
// para calzar exacto con el ejemplo dado.
func randomSuffix() string {
	b := make([]byte, 2)
	if _, err := rand.Read(b); err != nil {
		// no debería pasar con crypto/rand, pero si pasa, un id sin
		// sufijo random sigue siendo mejor que un error duro acá — el
		// riesgo de colisión sube, no se cae todo el proposal por esto.
		return "0000"
	}
	return hex.EncodeToString(b)
}

// newDomainID arma el id estable definitivo: dom_{slug}_{sufijo}.
func newDomainID(domainName string) string {
	return fmt.Sprintf("dom_%s_%s", domainSlug(domainName), randomSuffix())
}

type DomainProposal struct {
	Status  string           `json:"status"` // "proposed"
	Domains []ProposedDomain `json:"domains"`
}

// ScaffoldDomainActivity habla por TCP (puerto 5678) con Brain para generar
// código de dominio. TODO original sigue sin resolver: esta función no
// llama a Brain todavía (mismo TODO que ya existía: "mismo patrón que
// sentinel_activities.go usa para invocar Brain" — sigo sin ese archivo,
// no lo invento).
func ScaffoldDomainActivity(input ScaffoldDomainInput) (ScaffoldDomainResult, error) {
	if input.MandatesRoot == "" {
		return ScaffoldDomainResult{}, fmt.Errorf("ScaffoldDomainActivity: MandatesRoot vacío para mandate %s", input.MandateID)
	}

	publishMandateEvent("mandate:action:started", map[string]interface{}{
		"mandateId":  input.MandateID,
		"actionId":   input.ActionID,
		"domainName": input.DomainName,
		"mode":       string(input.Mode),
		"startedAt":  time.Now().Format(time.RFC3339),
	})

	var resultRef string
	var domains []ProposedDomain
	var err error

	switch input.Mode {
	case ScaffoldModeReal:
		resultRef, err = scaffoldReal(input)
	case ScaffoldModeDryRun, "":
		// "" se trata como dry_run por compatibilidad hacia atrás con
		// callers que todavía no setean Mode explícitamente — no rompe
		// silenciosamente, pero tampoco explota. Si se prefiere que sea
		// error duro, es un cambio de una línea.
		resultRef, domains, err = scaffoldDryRun(input)
	default:
		err = fmt.Errorf("ScaffoldDomainActivity: Mode %q desconocido", input.Mode)
	}

	if err != nil {
		publishMandateEvent("mandate:action:failed", map[string]interface{}{
			"mandateId":  input.MandateID,
			"actionId":   input.ActionID,
			"domainName": input.DomainName,
			"error":      err.Error(),
		})
		return ScaffoldDomainResult{}, err
	}

	completedPayload := map[string]interface{}{
		"mandateId":   input.MandateID,
		"actionId":    input.ActionID,
		"domainName":  input.DomainName,
		"resultRef":   resultRef,
		"completedAt": time.Now().Format(time.RFC3339),
	}
	// domains — CAMPO NUEVO esta sesión, gap encontrado por Frontend
	// después de armar el flujo completo: sin esto, la UI nunca ve el id
	// real (dom_{slug}_{sufijo}) que scaffoldDryRun generó, y no tiene
	// cómo devolverlo en GenesisValidateSignal.Domains[].ID —
	// SignMandateActivity fallaría al firmar por "confirmedDomainIds
	// referencia domainId ausente en candidateDomains". Solo se agrega la
	// key en Mode=dry_run (domains no vacío); en Mode=real se omite del
	// todo en vez de mandar "domains": null — no hay una propuesta nueva
	// que anunciar en ese punto.
	if len(domains) > 0 {
		completedPayload["domains"] = domains
	}
	publishMandateEvent("mandate:action:completed", completedPayload)
	return ScaffoldDomainResult{ResultRef: resultRef, Domains: domains}, nil
}

// scaffoldDryRun es Fase 2: NO escribe .scaffold/, solo domain_proposal.json.
// Hoy sigue devolviendo un único dominio (input.Project vía input.DomainName)
// porque no hay clustering real de Brain — ver TODO al inicio del archivo.
// La estructura ya es domains[] (array), lista para cuando haya N reales.
func scaffoldDryRun(input ScaffoldDomainInput) (string, []ProposedDomain, error) {
	dir := filepath.Join(input.MandatesRoot, input.MandateID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", nil, fmt.Errorf("no pude crear %s: %w", dir, err)
	}

	proposal := DomainProposal{
		Status: "proposed",
		Domains: []ProposedDomain{
			{
				ID:                   newDomainID(input.DomainName),
				DomainName:           input.DomainName,
				CohesionScore:        1.0, // sin clustering real, cohesión no significa nada — placeholder explícito
				SuggestedActionCount: 1,   // idem — sin clustering real, siempre 1
				Files:                input.Files,
			},
		},
	}

	data, err := json.MarshalIndent(proposal, "", "  ")
	if err != nil {
		return "", nil, fmt.Errorf("no pude serializar domain_proposal.json: %w", err)
	}

	path := filepath.Join(dir, "domain_proposal.json")
	if err := os.WriteFile(path, data, 0644); err != nil {
		return "", nil, fmt.Errorf("no pude escribir domain_proposal.json: %w", err)
	}

	return "domain_proposal.json", proposal.Domains, nil
}

// scaffoldReal es Fase 4: escribe la carpeta física del dominio.
//
// INCOMPLETO A PROPÓSITO: solo crea el directorio y un marker mínimo.
// bloom_project_tree_gen.txt lista .gen.json, .gen_state.json,
// .semantic_scaffold.json, .context_gen_plan.json y .files/ dentro de cada
// .domain_{name}/ — no tengo el schema de ninguno de esos archivos
// confirmado contra código real (mismo problema que domain_proposal.json:
// existen en la documentación de diseño, no vi ningún writer). Escribir
// contenido inventado para esos archivos sería el mismo error que ya
// evitamos con domainId — así que no lo hago. Esto deja el scaffold real
// "creado pero vacío", explícitamente marcado, no simulado como completo.
func scaffoldReal(input ScaffoldDomainInput) (string, error) {
	domainDir := filepath.Join(input.MandatesRoot, input.MandateID, "scaffold", "domain_"+input.DomainName)
	if err := os.MkdirAll(domainDir, 0755); err != nil {
		return "", fmt.Errorf("no pude crear %s: %w", domainDir, err)
	}

	marker := map[string]interface{}{
		"domainName": input.DomainName,
		"files":      input.Files,
		"scaffoldedAt": time.Now().Format(time.RFC3339),
		"note": "contenido real de .gen.json/.semantic_scaffold.json/etc. no implementado — " +
			"schema no confirmado contra código, ver comentario de scaffoldReal",
	}
	data, err := json.MarshalIndent(marker, "", "  ")
	if err != nil {
		return "", fmt.Errorf("no pude serializar marker de %s: %w", input.DomainName, err)
	}
	markerPath := filepath.Join(domainDir, "_INCOMPLETE_SCAFFOLD.json")
	if err := os.WriteFile(markerPath, data, 0644); err != nil {
		return "", fmt.Errorf("no pude escribir marker de %s: %w", input.DomainName, err)
	}

	return filepath.Join("scaffold", "domain_"+input.DomainName), nil
}

// PublishMandateEventActivity es la versión "activity" para eventos que el
// workflow mismo dispara (no una activity de negocio), como all_complete.
func PublishMandateEventActivity(event string, data map[string]interface{}) error {
	publishMandateEvent(event, data)
	return nil
}

// publishMandateEvent hace POST al endpoint dual-emit del Control Plane
// (puerto 48215, el mismo que expone bootControlPlane en service.go).
func publishMandateEvent(event string, data map[string]interface{}) {
	body, _ := json.Marshal(map[string]interface{}{"event": event, "data": data})
	go func() {
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Post("http://localhost:48215/internal/mandate-event",
			"application/json", bytes.NewBuffer(body))
		if err != nil {
			return
		}
		defer resp.Body.Close()
	}()
}
