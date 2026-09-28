// Mandate confirmation state and the closed legacy signing entry point.
package activities

import (
	"crypto/ed25519"
	"encoding/json"
	"fmt"
	"path/filepath"
	"reflect"
	"time"

	"github.com/google/uuid"

	"nucleus/internal/authority"
	"nucleus/internal/orchestration/mandatecontract"
	"nucleus/internal/orchestration/mandatestate"
)

type MandateActVerificationActivity struct {
	IdentityPath string
	TrustRoots   map[string]ed25519.PublicKey
}
type MandateActVerificationInput struct {
	MandatesRoot   string
	MandateID      string
	Operation      string
	ExpectedDigest string
}
type MandateActVerificationResult struct {
	ContractDigest string
	ProjectID      string
}

func (a *MandateActVerificationActivity) Run(input MandateActVerificationInput) (MandateActVerificationResult, error) {
	if a == nil || a.IdentityPath == "" || input.MandatesRoot == "" || input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID || (input.Operation != "approve" && input.Operation != "activate") {
		return MandateActVerificationResult{}, fmt.Errorf("Mandate act verification prerequisites invalid")
	}
	dir := filepath.Join(input.MandatesRoot, input.MandateID)
	identity, err := authority.LoadExistingLocalIdentity(a.IdentityPath)
	if err != nil {
		return MandateActVerificationResult{}, err
	}
	roots := a.TrustRoots
	if roots == nil {
		roots = authority.DevelopmentPinnedRoots()
	}
	envelope, err := mandatecontract.LoadVerified(dir, a.IdentityPath)
	if err != nil {
		return MandateActVerificationResult{}, err
	}
	if input.ExpectedDigest != "" && input.ExpectedDigest != envelope.ContractDigest {
		return MandateActVerificationResult{}, fmt.Errorf("signal digest differs from signed Mandate")
	}
	receipt, err := mandatecontract.LoadActReceipt(dir, input.Operation)
	if err != nil {
		return MandateActVerificationResult{}, err
	}
	if err := mandatecontract.VerifyActReceipt(receipt, identity, roots, input.Operation, input.MandateID, envelope.ContractDigest, envelope.Contract.ProjectID); err != nil {
		return MandateActVerificationResult{}, err
	}
	if input.Operation == "activate" {
		approval, loadErr := mandatecontract.LoadActReceipt(dir, "approve")
		if loadErr != nil {
			return MandateActVerificationResult{}, loadErr
		}
		if err := mandatecontract.VerifyActReceipt(approval, identity, roots, "approve", input.MandateID, envelope.ContractDigest, envelope.Contract.ProjectID); err != nil {
			return MandateActVerificationResult{}, err
		}
	}
	return MandateActVerificationResult{ContractDigest: envelope.ContractDigest, ProjectID: envelope.Contract.ProjectID}, nil
}

// Legacy build-state types remain for confirmation persistence. The old
// signer is deliberately closed until actor proof and the immutable contract
// are connected; none of these mutable records grants execution authority.

// DomainCandidateState espeja DomainCandidate (gen-state.types.ts) del lado
// Go. No existía ningún struct Go equivalente en los archivos recibidos —
// mandate_watcher.go define su propio MandateState mínimo, pero solo cubre
// ingest/cluster, no validate/humanSync (ver comentario de PhaseRecord ahí).
// Este es el primer código Go que necesita leer Fase 3 completa.
type DomainCandidateState struct {
	DomainID             string  `json:"domainId"`
	Name                 string  `json:"name"`
	CohesionScore        float64 `json:"cohesionScore"`
	SuggestedActionCount int     `json:"suggestedActionCount"`
	OverlapsWithExisting string  `json:"overlapsWithExisting,omitempty"`
	// D-3
	DependsOn []string `json:"dependsOn,omitempty"`
}

// HumanSyncState espeja HumanSyncRecord (gen-state.types.ts).
type HumanSyncState struct {
	CandidateDomains   []DomainCandidateState `json:"candidateDomains"`
	ConfirmedDomainIds []string               `json:"confirmedDomainIds,omitempty"`
	ConfirmedAt        string                 `json:"confirmedAt,omitempty"`
	// D-9 — ver mandate_genesis_domains_cmd.go para quién escribe esto.
	ConfirmedBy string                  `json:"confirmedBy,omitempty"`
	Files       []mandatecontract.Input `json:"files,omitempty"`
}

type validatePhaseState struct {
	Status    string         `json:"status"`
	HumanSync HumanSyncState `json:"humanSync"`
}

// mandateBuildState es la porción de mandate_state.json que
// signMandateActivity necesita leer. No redeclara todo GenState — solo los
// campos que este código toca, mismo criterio de mínima superficie que ya
// usa MandateState en mandate_watcher.go.
type mandateBuildState struct {
	MandateID string `json:"mandateId"`
	// MandateType — CAMPO NUEVO esta sesión. mandate_state.json SÍ lo trae
	// (createBuildMandate lo escribe, commands/mandate.go:376:
	// "mandateType": mandateType, "genesis" | "domain_expansion") pero este
	// struct no lo leía — fix del hardcode MandateType: "genesis" más abajo,
	// que firmaba mandate.json como genesis sin importar el tipo real.
	MandateType  string `json:"mandateType"`
	Project      string `json:"project"`
	CurrentPhase string `json:"currentPhase"`
	Phases       struct {
		Validate validatePhaseState `json:"validate"`
	} `json:"phases"`
	Signature struct {
		Status   string `json:"status"`
		SignedAt string `json:"signedAt"`
	} `json:"signature"`
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
	MandateID      string `json:"mandateId"`
	ActionsCreated int    `json:"actionsCreated"`
	WorkflowType   string `json:"workflowType"`
	SignedAt       string `json:"signedAt"`
	// Actions — CAMPO NUEVO esta sesión: se devuelve la lista completa (no
	// solo el conteo) para que el workflow pueda construir []DomainAction
	// sin releer mandate.json. Antes de este cambio SignMandateActivity
	// estaba huérfana (nadie la llamaba) — ahora que sí se llama desde
	// MandateBuildWorkflow, este campo es lo que cierra el loop.
	Actions      []Action `json:"actions"`
	StateVersion uint64   `json:"stateVersion"`
}

// actionIDFor deriva la identidad reproducible de una Action Genesis.
// Fórmula exacta (UUIDv5/SHA-1):
//
//	UUIDv5(namespace=uuid.NameSpaceURL,
//	       name="urn:bloom:mandate-action:" + mandateID + ":" + logicalActionKey)
//
// Brain y cualquier consumidor pueden recalcularla sin estado en memoria.
func actionIDFor(mandateID, logicalActionKey string) string {
	name := "urn:bloom:mandate-action:" + mandateID + ":" + logicalActionKey
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte(name)).String()
}

func logicalActionKeyFor(candidate DomainCandidateState) string {
	return "gen/scaffold/domain/" + candidate.DomainID
}

// SignMandateActivity remains fail-closed. A confirmed domain is not a
// verified human approval, and this legacy path cannot issue a signature.
func SignMandateActivity(mandatesRoot, mandateID string) (SignMandateResult, error) {
	return SignMandateResult{}, fmt.Errorf("firma de Mandate cerrada: falta decisión humana verificable vinculada al digest")
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
	ConfirmedBy       string
	IntentID          string
	ReceptionRef      string
	DomainProposalRef string
}

type PersistHumanSyncResult struct {
	StateVersion uint64 `json:"stateVersion"`
}

// PersistHumanSyncActivity escribe phases.validate.humanSync en
// mandate_state.json, preservando el resto del documento.
func PersistHumanSyncActivity(input PersistHumanSyncInput) (PersistHumanSyncResult, error) {
	dir := filepath.Join(input.MandatesRoot, input.MandateID)
	path := filepath.Join(dir, "mandate_state.json")

	if input.IntentID == "" || input.ReceptionRef == "" || input.DomainProposalRef == "" {
		return PersistHumanSyncResult{}, fmt.Errorf("intentId y referencias relativas de artifacts son obligatorios")
	}
	if filepath.IsAbs(input.ReceptionRef) || filepath.IsAbs(input.DomainProposalRef) {
		return PersistHumanSyncResult{}, fmt.Errorf("artifacts de signature deben ser rutas relativas al directorio del Mandate")
	}

	pendingAt := time.Now().UTC().Format(time.RFC3339Nano)
	version, err := mandatestate.Mutate(path, func(rawMap map[string]interface{}) (bool, error) {
		phases, _ := rawMap["phases"].(map[string]interface{})
		if phases == nil {
			phases = map[string]interface{}{}
		}
		validate, _ := phases["validate"].(map[string]interface{})
		if validate == nil {
			validate = map[string]interface{}{}
		}
		humanSyncMap, ok := validate["humanSync"].(map[string]interface{})
		if !ok {
			return false, fmt.Errorf("confirmación CLI persistida ausente")
		}
		humanSyncBytes, err := json.Marshal(humanSyncMap)
		if err != nil {
			return false, err
		}
		var frozen HumanSyncState
		if err := json.Unmarshal(humanSyncBytes, &frozen); err != nil {
			return false, err
		}
		if len(frozen.Files) == 0 || len(frozen.ConfirmedDomainIds) != 1 || !reflect.DeepEqual(frozen.ConfirmedDomainIds, input.ConfirmedDomainIds) || !reflect.DeepEqual(frozen.CandidateDomains, input.CandidateDomains) {
			return false, fmt.Errorf("señal de confirmación no coincide con dominio y Files congelados")
		}
		signature, _ := rawMap["signature"].(map[string]interface{})
		if signature == nil {
			signature = map[string]interface{}{}
		}
		artifacts := map[string]interface{}{
			"reception":          filepath.ToSlash(filepath.Clean(input.ReceptionRef)),
			"domainProposal":     filepath.ToSlash(filepath.Clean(input.DomainProposalRef)),
			"humanSyncPersisted": true,
		}
		if signature["status"] == "pending" && signature["intentId"] == input.IntentID &&
			reflect.DeepEqual(signature["artifacts"], artifacts) {
			return false, nil
		}
		if status, _ := signature["status"].(string); status != "" && status != "not_ready" && status != "pending" {
			return false, fmt.Errorf("transición signature %s → pending inválida", status)
		}
		signature["status"] = "pending"
		signature["intentId"] = input.IntentID
		signature["artifacts"] = artifacts
		signature["pendingAt"] = pendingAt
		signature["signedAt"] = nil
		signature["failedAt"] = nil
		signature["failure"] = nil
		rawMap["signature"] = signature
		return true, nil
	})
	if err != nil {
		return PersistHumanSyncResult{}, fmt.Errorf("no pude escribir mandate_state.json de %s: %w", input.MandateID, err)
	}
	return PersistHumanSyncResult{StateVersion: version}, nil
}

func persistSignatureSigned(path, signedAt string) (uint64, error) {
	return mandatestate.Mutate(path, func(state map[string]interface{}) (bool, error) {
		signature, _ := state["signature"].(map[string]interface{})
		if signature == nil {
			return false, fmt.Errorf("signature ausente")
		}
		if signature["status"] == "signed" {
			if signature["signedAt"] != signedAt {
				return false, fmt.Errorf("signedAt conflictivo")
			}
			return false, nil
		}
		if signature["status"] != "pending" {
			return false, fmt.Errorf("transición signature %v → signed inválida", signature["status"])
		}
		signature["status"] = "signed"
		signature["signedAt"] = signedAt
		signature["failedAt"] = nil
		signature["failure"] = nil
		state["signature"] = signature
		return true, nil
	})
}

type PersistSignatureFailureInput struct {
	MandatesRoot string
	MandateID    string
	Message      string
	FailureType  string
}

type PersistSignatureFailureResult struct {
	StateVersion uint64 `json:"stateVersion"`
}

func PersistSignatureFailureActivity(input PersistSignatureFailureInput) (PersistSignatureFailureResult, error) {
	path := filepath.Join(input.MandatesRoot, input.MandateID, "mandate_state.json")
	failedAt := time.Now().UTC().Format(time.RFC3339Nano)
	version, err := mandatestate.Mutate(path, func(state map[string]interface{}) (bool, error) {
		signature, _ := state["signature"].(map[string]interface{})
		if signature == nil {
			return false, fmt.Errorf("signature ausente")
		}
		failure := map[string]interface{}{"message": input.Message, "type": input.FailureType}
		if signature["status"] == "failed" && reflect.DeepEqual(signature["failure"], failure) {
			return false, nil
		}
		if signature["status"] != "pending" {
			return false, fmt.Errorf("transición signature %v → failed inválida", signature["status"])
		}
		signature["status"] = "failed"
		signature["failedAt"] = failedAt
		signature["failure"] = failure
		state["signature"] = signature
		return true, nil
	})
	if err != nil {
		return PersistSignatureFailureResult{}, err
	}
	return PersistSignatureFailureResult{StateVersion: version}, nil
}
