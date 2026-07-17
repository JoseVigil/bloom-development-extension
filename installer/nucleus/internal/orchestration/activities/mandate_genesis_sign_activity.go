// internal/orchestration/activities/mandate_genesis_sign_activity.go
//
// RENOMBRADO en este turno: el nombre original que le puse a este archivo
// (mandate_genesis_activities.go) resultó ser el mismo que el archivo REAL
// del repo que contiene ScaffoldDomainActivity/PublishMandateEventActivity
// — ambos en el mismo paquete `activities`. Si se hubiera escrito con ese
// nombre, habría pisado el archivo real al copiarlo al repo. Este archivo
// sigue definiendo SignMandateActivity, sin cambios de contenido — solo de
// nombre de archivo.
package activities

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// ─────────────────────────────────────────────────────────────────────────
// NOTA DE ALCANCE — ACTUALIZADA esta sesión (corrección D-B1)
//
// signMandateActivity NO existía como código en ningún archivo Go
// disponible — solo como descripción de comportamiento en
// BLOOM_Mandate_Genesis_Backend_Design_v0_1_0.md §6.2. Fue implementada
// acá.
//
// CORRECCIÓN: en el turno anterior quedó marcada como "no enganchada
// todavía a MandateGenesisBuildWorkflow" — eso violaba D-B1 (Backend
// Design §0: Fase 4 se ejecuta con el MandateExecutionWorkflow que ya
// existe para `mandate run`, no con una llamada directa a
// ScaffoldDomainActivity desde el padre). Corregido: el workflow ahora SÍ
// llama a esta función antes de arrancar el child workflow — ver
// mandate_genesis_build_workflow.go.
//
// Esta función resuelve D-3 (dependsOn) de punta a punta a nivel de
// datos: lee dependsOn de DomainCandidate (gen-state.types.ts /
// mandate_state.json), lo traduce a dependsOn de Action (mandate.json), y
// ahora también devuelve las Actions en el resultado (Action.DomainName
// agregado esta sesión) para que el workflow pueda traducirlas a
// DomainAction sin tener que releer mandate.json ni parsear actionIds.
// ─────────────────────────────────────────────────────────────────────────

// DomainCandidateState espeja DomainCandidate (gen-state.types.ts) del lado
// Go. No existía ningún struct Go equivalente en los archivos recibidos —
// mandate_watcher.go define su propio MandateState mínimo, pero solo cubre
// ingest/cluster, no validate/humanSync (ver comentario de PhaseRecord ahí).
// Este es el primer código Go que necesita leer Fase 3 completa.
type DomainCandidateState struct {
	DomainID             string   `json:"domainId"`
	Name                 string   `json:"name"`
	CohesionScore        float64  `json:"cohesionScore"`
	SuggestedActionCount int      `json:"suggestedActionCount"`
	OverlapsWithExisting string   `json:"overlapsWithExisting,omitempty"`
	// D-3
	DependsOn []string `json:"dependsOn,omitempty"`
}

// HumanSyncState espeja HumanSyncRecord (gen-state.types.ts).
type HumanSyncState struct {
	CandidateDomains   []DomainCandidateState `json:"candidateDomains"`
	ConfirmedDomainIds []string               `json:"confirmedDomainIds,omitempty"`
	ConfirmedAt        string                 `json:"confirmedAt,omitempty"`
	// D-9 — ver mandate_genesis_domains_cmd.go para quién escribe esto.
	ConfirmedBy string `json:"confirmedBy,omitempty"`
}

type validatePhaseState struct {
	Status    string         `json:"status"`
	HumanSync HumanSyncState `json:"humanSync"`
}

// mandateGenesisState es la porción de mandate_state.json que
// signMandateActivity necesita leer. No redeclara todo GenState — solo los
// campos que este código toca, mismo criterio de mínima superficie que ya
// usa MandateState en mandate_watcher.go.
type mandateGenesisState struct {
	MandateID    string `json:"mandateId"`
	Project      string `json:"project"`
	CurrentPhase string `json:"currentPhase"`
	Phases       struct {
		Validate validatePhaseState `json:"validate"`
	} `json:"phases"`
}

// ActionPayload — forma confirmada en el contrato §3.1.
type ActionPayload struct {
	SubPhase string `json:"subPhase"` // siempre "scaffold" en Fase 4
	DomainID string `json:"domainId"`
}

// Action es la forma persistida en operational.actions[] de mandate.json
// (contrato §3.1). El schema completo no estaba confirmado contra código
// real (§3.3 del contrato) — este struct ES esa confirmación, a partir de
// ahora.
type Action struct {
	ActionID   string        `json:"actionId"`
	Type       string        `json:"type"`       // "run_intent"
	IntentType string        `json:"intentType"` // "gen"
	Payload    ActionPayload `json:"payload"`
	Status     string        `json:"status"` // "pending" al firmar
	ResultRef  *string       `json:"resultRef"`
	// D-3 (CERRADO esta sesión): actionIds de los que esta Action depende.
	// nil/[] = sin dependencias.
	DependsOn []string `json:"dependsOn,omitempty"`
	// DomainName — CAMPO NUEVO esta sesión, NO parte del shape original
	// del contrato §3.1. Se agrega para que el workflow (llamador) pueda
	// reconstruir DomainAction.DomainName directamente desde el resultado
	// de SignMandateActivity, sin tener que parsear "gen-action-{name}" de
	// vuelta ni releer mandate.json. Payload.DomainID sigue siendo el id
	// estable (dom_...) — este es el nombre legible, ya con rename
	// aplicado si hubo.
	DomainName string `json:"domainName"`
}

// OperationalBlock es el bloque operational de mandate.json.
type OperationalBlock struct {
	Workflow struct {
		// "parallel" es el default confirmado (D-B1/P2). "dependent" es
		// una DECISIÓN NUEVA de esta sesión para el caso con dependsOn —
		// no está confirmada en ws-events.ts ni en Backend Design. Se usa
		// acá porque el contrato no define un tercer valor, y dejar
		// "parallel" cuando hay dependsOn sería contradictorio. Revisar
		// contra el motor real de MandateExecutionWorkflow cuando P4 se
		// implemente — puede que el nombre o el mecanismo deba cambiar.
		Type string `json:"type"`
	} `json:"workflow"`
	Actions []Action `json:"actions"`
}

// MandateJSON es la forma mínima de mandate.json que esta activity escribe.
// No es el shape completo de un standard firmado (eso es Command Surface
// v0.2.0) — solo los campos que Fase 3→4 necesita.
type MandateJSON struct {
	MandateID   string           `json:"mandateId"`
	MandateType string           `json:"mandateType"` // "genesis" | "domain_expansion"
	Project     string           `json:"project"`
	Status      string           `json:"status"` // "signed"
	SignedAt    string           `json:"signedAt"`
	Operational OperationalBlock `json:"operational"`
}

type SignMandateResult struct {
	MandateID      string   `json:"mandateId"`
	ActionsCreated int      `json:"actionsCreated"`
	WorkflowType   string   `json:"workflowType"`
	SignedAt       string   `json:"signedAt"`
	// Actions — CAMPO NUEVO esta sesión: se devuelve la lista completa (no
	// solo el conteo) para que el workflow pueda construir []DomainAction
	// sin releer mandate.json. Antes de este cambio SignMandateActivity
	// estaba huérfana (nadie la llamaba) — ahora que sí se llama desde
	// MandateGenesisBuildWorkflow, este campo es lo que cierra el loop.
	Actions []Action `json:"actions"`
}

// actionIDFor arma el actionId con el formato confirmado en ws-events.ts
// (MandateActionStartedPayload) — "gen-action-{domainName}".
func actionIDFor(domainName string) string {
	return "gen-action-" + domainName
}

// SignMandateActivity es la Local Activity descrita en Backend Design §6.2
// — corre dentro del propio workflow de Temporal (autoridad de
// Nucleus/Vault, no se enruta a Brain, ver contrato §3.1). Lee
// mandate_state.json, valida que Fase 3 (validate) esté confirmada, arma
// operational.actions[] con dependsOn resuelto (D-3) y escribe mandate.json
// firmado.
//
// mandatesRoot/mandateID siguen el mismo layout que mandate.go
// (cfg.MandatesRoot()/{mandateID}/).
func SignMandateActivity(mandatesRoot, mandateID string) (SignMandateResult, error) {
	dir := filepath.Join(mandatesRoot, mandateID)

	raw, err := os.ReadFile(filepath.Join(dir, "mandate_state.json"))
	if err != nil {
		return SignMandateResult{}, fmt.Errorf("no pude leer mandate_state.json de %s: %w", mandateID, err)
	}

	var state mandateGenesisState
	if err := json.Unmarshal(raw, &state); err != nil {
		return SignMandateResult{}, fmt.Errorf("mandate_state.json inválido para %s: %w", mandateID, err)
	}

	hs := state.Phases.Validate.HumanSync
	if len(hs.ConfirmedDomainIds) == 0 {
		return SignMandateResult{}, fmt.Errorf(
			"mandate %s: no hay confirmedDomainIds — ¿se corrió 'mandate genesis domains confirm' antes de firmar?",
			mandateID,
		)
	}

	byID := make(map[string]DomainCandidateState, len(hs.CandidateDomains))
	for _, c := range hs.CandidateDomains {
		byID[c.DomainID] = c
	}

	confirmed := make(map[string]bool, len(hs.ConfirmedDomainIds))
	for _, id := range hs.ConfirmedDomainIds {
		confirmed[id] = true
	}

	actions := make([]Action, 0, len(hs.ConfirmedDomainIds))
	anyDependency := false

	for _, domainID := range hs.ConfirmedDomainIds {
		cand, ok := byID[domainID]
		if !ok {
			return SignMandateResult{}, fmt.Errorf(
				"mandate %s: confirmedDomainIds referencia domainId %q ausente en candidateDomains",
				mandateID, domainID,
			)
		}

		// D-3: traducir domainId → actionId, y solo para dependencias que
		// también están confirmadas. Una dependencia hacia un dominio
		// rechazado/no confirmado se descarta — no hay Action para
		// esperar. Decisión explícita, no comportamiento no especificado.
		var dependsOn []string
		for _, depID := range cand.DependsOn {
			if !confirmed[depID] {
				continue
			}
			depCand, ok := byID[depID]
			if !ok {
				continue
			}
			dependsOn = append(dependsOn, actionIDFor(depCand.Name))
		}
		if len(dependsOn) > 0 {
			anyDependency = true
		}

		actions = append(actions, Action{
			ActionID:   actionIDFor(cand.Name),
			Type:       "run_intent",
			IntentType: "gen",
			Payload: ActionPayload{
				SubPhase: "scaffold",
				DomainID: cand.DomainID,
			},
			Status:     "pending",
			ResultRef:  nil,
			DependsOn:  dependsOn,
			DomainName: cand.Name,
		})
	}

	workflowType := "parallel"
	if anyDependency {
		workflowType = "dependent" // ver nota en OperationalBlock.Workflow.Type
	}

	signedAt := time.Now().Format(time.RFC3339)

	mandateJSON := MandateJSON{
		MandateID:   state.MandateID,
		MandateType: "genesis",
		Project:     state.Project,
		Status:      "signed",
		SignedAt:    signedAt,
	}
	mandateJSON.Operational.Workflow.Type = workflowType
	mandateJSON.Operational.Actions = actions

	data, err := json.MarshalIndent(mandateJSON, "", "  ")
	if err != nil {
		return SignMandateResult{}, fmt.Errorf("no pude serializar mandate.json de %s: %w", mandateID, err)
	}
	if err := os.WriteFile(filepath.Join(dir, "mandate.json"), data, 0644); err != nil {
		return SignMandateResult{}, fmt.Errorf("no pude escribir mandate.json de %s: %w", mandateID, err)
	}

	return SignMandateResult{
		MandateID:      mandateID,
		ActionsCreated: len(actions),
		WorkflowType:   workflowType,
		SignedAt:       signedAt,
		Actions:        actions,
	}, nil
}

// ─────────────────────────────────────────────────────────────────────────
// PersistHumanSyncActivity — NUEVA esta sesión (corrección D-B1/reconciliación).
//
// Antes de este cambio existían dos vías de confirmación sin hablarse: el
// CLI (mandate_genesis_domains_cmd.go, escribe confirmedDomainIds/
// confirmedBy en mandate_state.json) y la señal de Temporal (que no tocaba
// disco). Esta activity es el punto de unificación: sin importar por
// cuál de las dos vías llegó la confirmación, ACÁ es donde se escribe
// mandate_state.json antes de firmar — SignMandateActivity solo sabe leer
// ese archivo, no le importa quién lo escribió.
//
// Duplica la lógica de lectura/escritura preservando campos ajenos que ya
// tiene mandate_genesis_domains_cmd.go (writeMandateStateValidate) —
// mismo criterio ya aplicado ahí: paquetes distintos (activities vs
// commands), no vale la pena una dependencia cruzada por una función de
// I/O de archivo. Si en algún momento se decide compartirla, mover ambas
// a un paquete común (p. ej. internal/mandates).
// ─────────────────────────────────────────────────────────────────────────

type PersistHumanSyncInput struct {
	MandatesRoot       string
	MandateID          string
	CandidateDomains   []DomainCandidateState
	ConfirmedDomainIds []string
	// ConfirmedBy — D-9: cuando la confirmación llega por señal de Temporal
	// (el path que ahora es el real, no el CLI), NO hay usuario de SO
	// disponible dentro de un workflow — el workflow no puede llamar
	// os/user.Current() (rompería determinismo de Temporal) ni tiene
	// contexto de sesión HTTP. Así que este campo llega vacío por ese
	// path. D-9 queda MENOS cerrado de lo que parecía en el turno donde
	// se resolvió "para CLI" — ese path ahora es secundario. Sigue siendo
	// el mismo gap ya documentado (falta mecanismo de identidad real),
	// solo que ahora es más visible porque el camino que sí lo tenía
	// (CLI) dejó de ser el que efectivamente firma mandates.
	ConfirmedBy string
}

// PersistHumanSyncActivity escribe phases.validate.humanSync en
// mandate_state.json, preservando el resto del documento.
func PersistHumanSyncActivity(input PersistHumanSyncInput) error {
	dir := filepath.Join(input.MandatesRoot, input.MandateID)
	path := filepath.Join(dir, "mandate_state.json")

	raw, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("no pude leer mandate_state.json de %s: %w", input.MandateID, err)
	}

	var rawMap map[string]interface{}
	if err := json.Unmarshal(raw, &rawMap); err != nil {
		return fmt.Errorf("mandate_state.json inválido para %s: %w", input.MandateID, err)
	}

	humanSync := HumanSyncState{
		CandidateDomains:   input.CandidateDomains,
		ConfirmedDomainIds: input.ConfirmedDomainIds,
		ConfirmedAt:        time.Now().Format(time.RFC3339),
		ConfirmedBy:        input.ConfirmedBy,
	}
	humanSyncBytes, err := json.Marshal(humanSync)
	if err != nil {
		return fmt.Errorf("no pude serializar humanSync: %w", err)
	}
	var humanSyncMap map[string]interface{}
	if err := json.Unmarshal(humanSyncBytes, &humanSyncMap); err != nil {
		return err
	}

	phases, ok := rawMap["phases"].(map[string]interface{})
	if !ok {
		phases = map[string]interface{}{}
	}
	validate, ok := phases["validate"].(map[string]interface{})
	if !ok {
		validate = map[string]interface{}{}
	}
	validate["humanSync"] = humanSyncMap
	phases["validate"] = validate
	rawMap["phases"] = phases

	data, err := json.MarshalIndent(rawMap, "", "  ")
	if err != nil {
		return fmt.Errorf("no pude serializar mandate_state.json: %w", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("no pude escribir mandate_state.json de %s: %w", input.MandateID, err)
	}
	return nil
}
