// internal/governance/decision/shadow_activation.go
//
// DefaultShadowConfiguration arma la única instalación productiva de
// InstallShadow — activación puramente observacional del modo shadow_remote
// para create_project, nunca gatea nada (garantía ya dada por
// AuthorizeGravityNodeCreation: siempre devuelve local/localErr, ver
// decision.go:105-130).
//
// Vive en este paquete (no en internal/governance) a propósito:
// internal/governance/org_switch_guard.go ya importa
// nucleus/internal/orchestration/temporal, así que si este código viviera en
// internal/governance, worker.go (paquete temporal, el único caller real) no
// podría importarlo sin cerrar un ciclo (temporal → governance → temporal).
// Este paquete no importa orchestration/temporal en ningún lado — igual
// patrón que ya usa
// orchestration/activities/mandate_gravity_session_activities.go.
//
// Ver Propuesta_Diseno_Activacion_InstallShadow_v0_1.md — decisión Q1 de
// José: el PrincipalID de la evaluación remota reusa el mismo fundamento de
// autoridad que ya usa authorizeGravityNodeCreationLocal (.ownership.json,
// owner Subject) — no un concepto de identidad nuevo.
package decision

import (
	"os"
	"path/filepath"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/governance/ownershipcontract"
)

// DefaultShadowConfiguration construye el ShadowConfiguration canónico para
// instalar una sola vez al arrancar el worker de Temporal (ver
// orchestration/temporal/worker.go, workerStartCmd, antes de
// mandateWorker.Start()). Reusa los mismos paths de estado/checkpoint/
// observación que ya usa `nucleus authority decision`/`observation`
// (internal/governance/authority_command.go, defaultAuthorityServices) —
// ningún archivo ni esquema nuevo.
func DefaultShadowConfiguration(appDataDir string) *ShadowConfiguration {
	dir := filepath.Join(appDataDir, "authority")
	statePath := filepath.Join(dir, "state.json")
	checkpointPath := filepath.Join(dir, "checkpoint.json")
	observationsPath := filepath.Join(dir, "observation.json")

	_, stateErr := os.Stat(statePath)
	_, checkpointErr := os.Stat(checkpointPath)

	return &ShadowConfiguration{
		Evaluator: &authority.DecisionEvaluator{
			Store:      &authority.Store{Path: statePath},
			Checkpoint: &authority.CheckpointStore{Path: checkpointPath},
		},
		Request:   shadowDecisionRequest,
		Sink:      &authority.ObservationStore{Path: observationsPath},
		Connected: stateErr == nil && checkpointErr == nil,
		// Now y CommittedAt se dejan sin asignar a propósito: AuthorizeGravityNodeCreation
		// ya defaultea ambos a time.Now().UTC() (líneas 111-124) y no hay una
		// noción de "commit" fuera del ciclo de sync/notice, que este call
		// site no atraviesa (Propuesta v0.1 §4 Q2 — sin objeción de José).
	}
}

// shadowDecisionRequest arma el DecisionRequest de la evaluación remota
// observacional. Hoy el único caller real pasa siempre create_project (ver
// orchestration/activities/mandate_gravity_session_activities.go:217).
// Resuelve el mismo fundamento de autoridad local-legacy que
// authorizeGravityNodeCreationLocal usa para la decisión real, porque no
// existe ningún otro concepto de principal en este flujo. Si algo falla en
// la resolución (ownership ilegible, nucleusRoot no resoluble), devuelve un
// DecisionRequest con PrincipalID vacío — DecisionEvaluator.Evaluate lo
// deniega con una razón visible en la observación, nunca revienta ni
// fabrica un principal falso.
func shadowDecisionRequest(operation GovernedOperation, nodeID string, parentID *string, parentObservedVersion *uint64) authority.DecisionRequest {
	now := time.Now().UTC()
	request := authority.DecisionRequest{Operation: string(operation), At: now}

	nucleusRoot, err := core.ResolveNucleusRoot("")
	if err != nil {
		return request
	}
	ownershipRaw, err := os.ReadFile(filepath.Join(nucleusRoot, ".ownership.json"))
	if err != nil {
		return request
	}
	analysis, err := ownershipcontract.Analyze(ownershipRaw)
	if err != nil {
		return request
	}
	view, err := ownershipcontract.EffectiveLegacyView(analysis)
	if err != nil || view.Owner.Subject == "" {
		return request
	}
	request.PrincipalID = view.Owner.Subject
	// Scope.ID viene del Organization.CanonicalID reconciliado (Sovereign Tenant Fase 5,
	// ReconcileCanonicalOrganization en internal/governance/ownership_reconciliation.go) —
	// el mismo id que DecisionEvaluator.Evaluate compara contra state.Binding.OrganizationID
	// (internal/authority/decision.go). El valor de Scope.ID ya no sale de parentID (org_<timestamp>
	// local, que nunca coincide con state.Binding.OrganizationID — ver
	// Propuesta_Diseno_Correccion_ScopeID_CreateProject_InstallShadow_v0_1.md, decisión de José
	// 2026-09-17), pero el chequeo `parentID != nil` se mantiene a propósito: sigue siendo la señal
	// de si esta operación tiene noción de padre/scope en absoluto. create_organization pasa
	// parentID=nil siempre, por diseño (authorizeGravityNodeCreationLocal rechaza cualquier padre
	// para esa operación — ver Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md
	// §1), y debe seguir sin Scope aunque CanonicalID ya esté reconciliado: mapearla implicaría un
	// scope_outside_binding evaluable para una operación que authorizeGravityNodeCreationLocal nunca
	// deja pasar con padre, lo cual sería señal falsa, no real. Sin CanonicalID reconciliado (create_project
	// en una instalación que nunca corrió "nucleus authority sync"), Scope también queda vacío:
	// Evaluate() lo reporta como scope_invalid, honesto, en vez de un scope_outside_binding falso.
	if parentID != nil && analysis.Canonical != nil && analysis.Canonical.Organization.CanonicalID != nil &&
		*analysis.Canonical.Organization.CanonicalID != "" {
		request.Scope = authority.Scope{Type: "organization", ID: *analysis.Canonical.Organization.CanonicalID}
	}
	return request
}
