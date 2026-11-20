// internal/orchestration/activities/mandate_execution_activities.go
//
// CAMBIO (esta sesión): Paso 1 del plan de consolidación del action graph
// (Mandate_Genesis_ActionGraph_Plan_Ejecucion_v1.md). Archivo nuevo,
// deliberadamente separado de mandate_genesis_sign_activity.go — ese
// archivo no se toca en este paso (mandate.json inmutable tras firma,
// R-1). PersistExecutionResultActivity persiste el resultado de ejecutar
// una Action (Fase 4) en mandate_state.json, nunca en mandate.json.
//
// CAMBIO (esta sesión): logging homologado con la telemetría de Nucleus.
// PersistExecutionResultActivity ahora toma context.Context y usa
// activity.GetLogger(ctx) — mismo patrón que internal/mandates/mandate_activities.go
// (logger.Info "<Activity> started"/"completed" con pares clave-valor). No
// hace falta registrar un stream de telemetría nuevo: activity.GetLogger
// enruta a través del logger que el worker de Temporal ya tiene configurado
// (core.InitTemporalLogger, wireado una sola vez en temporal_client.go),
// que ya escribe al stream "nucleus_temporal" existente — no hay ningún
// output persistente nuevo que registrar vía `nucleus telemetry register`
// (BLOOM_NUCLEUS_LOGGING_SPEC.md: eso aplica a streams/archivos NUEVOS, no
// a líneas de log dentro de un stream ya registrado). El resto de las
// activities de la familia Genesis en este mismo paquete (ScaffoldDomainActivity,
// IngestReceptionActivity, SignMandateActivity, etc.) no toman ctx ni
// loguean — eso es un gap preexistente, fuera de alcance de esta sesión.
package activities

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"

	"go.temporal.io/sdk/activity"

	"nucleus/internal/orchestration/mandatestate"
)

// PersistExecutionResultInput es el input de PersistExecutionResultActivity.
// ActionID identifica la Action (mandate.json); si viene vacío (fixtures de
// test que no lo poblaron) se usa DomainName como fallback para la clave —
// ver executionResultKey.
type PersistExecutionResultInput struct {
	MandatesRoot      string
	MandateID         string
	ActionID          string
	DomainName        string
	ResultRef         string
	ArtifactDigest    string
	ContractDigest    string
	FulfillmentStatus string
	Status            string // "completed" | "failed"
	Error             string
}

type PersistExecutionResultResult struct {
	StateVersion uint64
}

func localBinding(state map[string]any, digest string) bool {
	adopted, _ := state["adoption"].(map[string]any)
	prep, _ := state["preparation"].(map[string]any)
	act, _ := state["activation"].(map[string]any)
	return digest != "" && len(adopted) == 0 && prep["contractDigest"] == digest &&
		act["contractDigest"] == digest && act["status"] == "active"
}

func journalBinding(state map[string]any, digest string) bool {
	adopted, _ := state["adoption"].(map[string]any)
	return (digest != "" && adopted["contractDigest"] == digest) || localBinding(state, digest)
}

func boundJournal(raw []byte, digest string) bool {
	var state map[string]any
	return json.Unmarshal(raw, &state) == nil && journalBinding(state, digest)
}

func localJournal(raw []byte, digest string) bool {
	var state map[string]any
	return json.Unmarshal(raw, &state) == nil && localBinding(state, digest)
}

// PersistAdoptedINGResultActivity records the first Action without claiming
// fulfillment. A replay with different evidence is a conflict, not a rewrite.
func PersistAdoptedINGResultActivity(ctx context.Context, input MandateIntentResult, mandatesRoot string) (PersistExecutionResultResult, error) {
	if input.MandateID == "" || input.ActionID == "" || input.ContractDigest == "" || input.IntentID == "" ||
		input.EvidenceRef == "" || input.EvidenceDigest == "" || input.Status != "awaiting_human_decision" || mandatesRoot == "" {
		return PersistExecutionResultResult{}, fmt.Errorf("adopted ING evidence is incomplete")
	}
	intentBase := filepath.Join(filepath.Dir(filepath.Clean(mandatesRoot)), ".intents", ".ing")
	rel, relErr := filepath.Rel(intentBase, input.EvidenceRef)
	if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return PersistExecutionResultResult{}, fmt.Errorf("adopted ING evidence is outside Intent storage")
	}
	evidence, err := os.ReadFile(input.EvidenceRef)
	if err != nil {
		return PersistExecutionResultResult{}, err
	}
	sum := sha256.Sum256(evidence)
	if hex.EncodeToString(sum[:]) != input.EvidenceDigest {
		return PersistExecutionResultResult{}, fmt.Errorf("adopted ING evidence digest changed")
	}
	path := filepath.Join(mandatesRoot, input.MandateID, "mandate_state.json")
	record := map[string]interface{}{"intentId": input.IntentID, "status": input.Status,
		"evidenceRef": input.EvidenceRef, "evidenceSha256": input.EvidenceDigest}
	version, err := mandatestate.Mutate(path, func(state map[string]interface{}) (bool, error) {
		if !journalBinding(state, input.ContractDigest) || state["mandateId"] != input.MandateID {
			return false, fmt.Errorf("adopted journal identity or digest mismatch")
		}
		actions, ok := state["actions"].(map[string]interface{})
		if !ok && state["actions"] == nil && state["status"] == "activated" && localBinding(state, input.ContractDigest) {
			actions = make(map[string]interface{})
			state["actions"] = actions
			state["currentAction"] = input.ActionID
			ok = true
		}
		if !ok {
			return false, fmt.Errorf("adopted action journal missing")
		}
		if prior, exists := actions[input.ActionID]; exists {
			if reflect.DeepEqual(prior, record) {
				return false, nil
			}
			return false, fmt.Errorf("adopted Action evidence conflicts with prior result")
		}
		actions[input.ActionID] = record
		state["status"] = "waiting_human"
		return true, nil
	})
	if err != nil {
		return PersistExecutionResultResult{}, err
	}
	return PersistExecutionResultResult{StateVersion: version}, nil
}

// PersistAdoptedINGCompletionActivity commits logical ING closure once. The
// journal still records physical materialization as pending in Brain's ledger.
func PersistAdoptedINGCompletionActivity(ctx context.Context, input MandateINGCompletionResult, mandatesRoot string) (PersistExecutionResultResult, error) {
	if ctx.Err() != nil {
		return PersistExecutionResultResult{}, ctx.Err()
	}
	if input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID || input.ActionID == "" || input.NextActionID == "" || input.NextActionID == input.ActionID || input.ContractDigest == "" || input.IntentID == "" || input.DecisionDigest == "" || mandatesRoot == "" {
		return PersistExecutionResultResult{}, fmt.Errorf("ING completion identity missing")
	}
	intentBase := filepath.Join(filepath.Dir(filepath.Clean(mandatesRoot)), ".intents", ".ing")
	for _, evidence := range []struct{ ref, digest string }{{input.ResultRef, input.ResultDigest}, {input.LedgerRef, input.LedgerDigest}} {
		rel, err := filepath.Rel(intentBase, evidence.ref)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return PersistExecutionResultResult{}, fmt.Errorf("ING evidence outside Intent storage")
		}
		content, err := os.ReadFile(evidence.ref)
		if err != nil {
			return PersistExecutionResultResult{}, err
		}
		sum := sha256.Sum256(content)
		if hex.EncodeToString(sum[:]) != evidence.digest {
			return PersistExecutionResultResult{}, fmt.Errorf("ING evidence changed")
		}
	}
	path := filepath.Join(mandatesRoot, input.MandateID, "mandate_state.json")
	version, err := mandatestate.Mutate(path, func(state map[string]interface{}) (bool, error) {
		actions, _ := state["actions"].(map[string]interface{})
		decision, _ := state["ingDecision"].(map[string]interface{})
		if !journalBinding(state, input.ContractDigest) || state["mandateId"] != input.MandateID || actions == nil || decision == nil || decision["decisionDigest"] != input.DecisionDigest || decision["actionId"] != input.ActionID {
			return false, fmt.Errorf("ING completion does not match adopted decision")
		}
		prior, _ := actions[input.ActionID].(map[string]interface{})
		if prior == nil || prior["intentId"] != input.IntentID {
			return false, fmt.Errorf("ING Action identity changed")
		}
		if prior["status"] == "completed" {
			next, _ := actions[input.NextActionID].(map[string]interface{})
			if prior["resultRef"] == input.ResultRef && prior["resultSha256"] == input.ResultDigest && prior["ledgerRef"] == input.LedgerRef && prior["ledgerSha256"] == input.LedgerDigest && prior["decisionDigest"] == input.DecisionDigest && prior["classificationRef"] != "" && prior["classificationSha256"] != "" && next != nil && next["status"] == "pending" {
				return false, nil
			}
			return false, fmt.Errorf("ING completion conflicts with prior result")
		}
		if prior["status"] != "awaiting_human_decision" {
			return false, fmt.Errorf("ING is not awaiting decision")
		}
		record := map[string]interface{}{"intentId": input.IntentID, "status": "completed", "classificationRef": prior["evidenceRef"], "classificationSha256": prior["evidenceSha256"], "resultRef": input.ResultRef, "resultSha256": input.ResultDigest, "ledgerRef": input.LedgerRef, "ledgerSha256": input.LedgerDigest, "decisionDigest": input.DecisionDigest}
		actions[input.ActionID] = record
		if _, exists := actions[input.NextActionID]; exists {
			return false, fmt.Errorf("DIS Action already recorded")
		}
		actions[input.NextActionID] = map[string]interface{}{"status": "pending", "dependsOn": input.ActionID}
		state["status"] = "in_progress"
		state["currentAction"] = input.NextActionID
		return true, nil
	})
	if err != nil {
		return PersistExecutionResultResult{}, err
	}
	return PersistExecutionResultResult{StateVersion: version}, nil
}

// PersistAdoptedDISProposalActivity records the mapping proposal while keeping
// DIS open for human ratification. A replay cannot replace its evidence.
func PersistAdoptedDISProposalActivity(ctx context.Context, input MandateDISResult, mandatesRoot string) (PersistExecutionResultResult, error) {
	if ctx == nil || ctx.Err() != nil || mandatesRoot == "" || input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID ||
		input.ActionID == "" || input.ContractDigest == "" || input.IntentID == "" || input.INGIntentID == "" ||
		input.INGResultRef == "" || input.INGResultDigest == "" || input.ProposalRef == "" || input.ProposalDigest == "" ||
		input.Status != "awaiting_human_decision" {
		return PersistExecutionResultResult{}, fmt.Errorf("DIS proposal evidence incomplete")
	}
	nucleusRoot := filepath.Dir(filepath.Clean(mandatesRoot))
	if !pathWithin(filepath.Join(nucleusRoot, ".intents", ".dis"), input.ProposalRef) ||
		!pathWithin(filepath.Join(nucleusRoot, ".intents", ".ing"), input.INGResultRef) {
		return PersistExecutionResultResult{}, fmt.Errorf("DIS or ING evidence outside Intent storage")
	}
	for _, evidence := range []struct{ ref, digest string }{{input.ProposalRef, input.ProposalDigest}, {input.INGResultRef, input.INGResultDigest}} {
		content, err := os.ReadFile(evidence.ref)
		if err != nil {
			return PersistExecutionResultResult{}, err
		}
		sum := sha256.Sum256(content)
		if hex.EncodeToString(sum[:]) != evidence.digest {
			return PersistExecutionResultResult{}, fmt.Errorf("DIS evidence changed")
		}
	}
	path := filepath.Join(mandatesRoot, input.MandateID, "mandate_state.json")
	version, err := mandatestate.Mutate(path, func(state map[string]interface{}) (bool, error) {
		actions, _ := state["actions"].(map[string]interface{})
		if state["mandateId"] != input.MandateID || !journalBinding(state, input.ContractDigest) ||
			actions == nil || state["currentAction"] != input.ActionID {
			return false, fmt.Errorf("DIS journal identity or action mismatch")
		}
		var ing map[string]interface{}
		for _, value := range actions {
			candidate, _ := value.(map[string]interface{})
			if candidate != nil && candidate["intentId"] == input.INGIntentID && candidate["status"] == "completed" {
				ing = candidate
			}
		}
		if ing == nil || ing["resultRef"] != input.INGResultRef || ing["resultSha256"] != input.INGResultDigest {
			return false, fmt.Errorf("DIS predecessor ING mismatch")
		}
		prior, _ := actions[input.ActionID].(map[string]interface{})
		if prior == nil {
			return false, fmt.Errorf("DIS Action missing")
		}
		record := map[string]interface{}{"intentId": input.IntentID, "status": input.Status,
			"proposalRef": input.ProposalRef, "proposalSha256": input.ProposalDigest,
			"ingIntentId": input.INGIntentID, "ingResultRef": input.INGResultRef, "ingResultSha256": input.INGResultDigest}
		if prior["status"] == input.Status {
			if reflect.DeepEqual(prior, record) {
				return false, nil
			}
			return false, fmt.Errorf("DIS proposal conflicts with prior evidence")
		}
		if prior["status"] != "pending" {
			return false, fmt.Errorf("DIS is not pending")
		}
		actions[input.ActionID] = record
		state["status"] = "waiting_human"
		return true, nil
	})
	if err != nil {
		return PersistExecutionResultResult{}, err
	}
	return PersistExecutionResultResult{StateVersion: version}, nil
}

// PersistAdoptedDISCompletionActivity closes only the DIS gate. It deliberately
// does not advance to the signed 1.2.0 DOC Action; independent DOC dispatch is
// connected in a later cut.
func PersistAdoptedDISCompletionActivity(ctx context.Context, input MandateDISCompletionResult, mandatesRoot string) (PersistExecutionResultResult, error) {
	if ctx == nil || ctx.Err() != nil || !input.Ready || input.Status != "completed" || mandatesRoot == "" || input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID ||
		input.ActionID == "" || input.ContractDigest == "" || input.IntentID == "" || input.ProposalRef == "" || input.ProposalDigest == "" || input.TurnID == "" || input.RatificationRef == "" || input.RatificationDigest == "" || input.LedgerRef == "" || input.LedgerDigest == "" || input.EffectsDigest == "" {
		return PersistExecutionResultResult{}, fmt.Errorf("DIS terminal evidence incomplete")
	}
	intentBase := filepath.Join(filepath.Dir(filepath.Clean(mandatesRoot)), ".intents", ".dis")
	for _, evidence := range []struct{ ref, digest string }{{input.ProposalRef, input.ProposalDigest}, {input.RatificationRef, input.RatificationDigest}, {input.LedgerRef, input.LedgerDigest}} {
		rel, relErr := filepath.Rel(intentBase, evidence.ref)
		if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return PersistExecutionResultResult{}, fmt.Errorf("DIS terminal evidence outside Intent storage")
		}
		raw, err := os.ReadFile(evidence.ref)
		if err != nil {
			return PersistExecutionResultResult{}, err
		}
		sum := sha256.Sum256(raw)
		if hex.EncodeToString(sum[:]) != evidence.digest {
			return PersistExecutionResultResult{}, fmt.Errorf("DIS terminal evidence changed")
		}
	}
	path := filepath.Join(mandatesRoot, input.MandateID, "mandate_state.json")
	version, err := mandatestate.Mutate(path, func(state map[string]interface{}) (bool, error) {
		actions, _ := state["actions"].(map[string]interface{})
		prior, _ := actions[input.ActionID].(map[string]interface{})
		if state["mandateId"] != input.MandateID || !journalBinding(state, input.ContractDigest) || actions == nil || prior == nil || state["currentAction"] != input.ActionID {
			return false, fmt.Errorf("DIS terminal journal identity mismatch")
		}
		if prior["ingIntentId"] == nil || prior["ingResultRef"] == nil || prior["ingResultSha256"] == nil {
			return false, fmt.Errorf("DIS antecedent evidence missing")
		}
		terminal := map[string]interface{}{
			"intentId": input.IntentID, "status": "completed", "proposalRef": input.ProposalRef, "proposalSha256": input.ProposalDigest,
			"ingIntentId": prior["ingIntentId"], "ingResultRef": prior["ingResultRef"], "ingResultSha256": prior["ingResultSha256"],
			"ratificationTurn": input.TurnID, "ratificationRef": input.RatificationRef, "ratificationSha256": input.RatificationDigest,
			"ledgerRef": input.LedgerRef, "ledgerSha256": input.LedgerDigest, "effectsDigest": input.EffectsDigest,
		}
		if prior["status"] == "completed" {
			if reflect.DeepEqual(prior, terminal) {
				return false, nil
			}
			return false, fmt.Errorf("DIS terminal evidence conflicts with journal")
		}
		if prior["status"] != "awaiting_human_decision" || prior["intentId"] != input.IntentID || prior["proposalRef"] != input.ProposalRef || prior["proposalSha256"] != input.ProposalDigest {
			return false, fmt.Errorf("DIS proposal changed before terminal persistence")
		}
		actions[input.ActionID] = terminal
		state["status"] = "in_progress"
		return true, nil
	})
	if err != nil {
		return PersistExecutionResultResult{}, err
	}
	return PersistExecutionResultResult{StateVersion: version}, nil
}

// PersistAdoptedEXPResultActivity records Brain's verified EXP result and
// applies only the signed result branch. A ready evaluation closes the
// Mandate and marks the signed remediation branch and its dependents skipped;
// remediation_required leaves DEV pending for a human/product implementation.
func PersistAdoptedEXPResultActivity(ctx context.Context, input MandateEXPResult, mandatesRoot string) (PersistExecutionResultResult, error) {
	if ctx == nil || ctx.Err() != nil || mandatesRoot == "" || input.MandateID == "" || filepath.Base(input.MandateID) != input.MandateID ||
		input.ActionID != "exp-4" || input.ContractDigest == "" || input.DOCActionID != "doc-after-dis-2" || input.DOCContractSHA256 == "" ||
		input.ResultRef == "" || input.ResultSHA256 == "" || (input.EvaluationStatus != "ready" && input.EvaluationStatus != "remediation_required") {
		return PersistExecutionResultResult{}, fmt.Errorf("adopted EXP result evidence is incomplete")
	}
	nucleusRoot := filepath.Dir(filepath.Clean(mandatesRoot))
	verifiedPath, _, err := verifyEXPArtifact(nucleusRoot, input.ResultRef, input.ResultSHA256, input.MandateID, input.ActionID, input.EvaluationStatus)
	if err != nil || !sameEvidencePath(verifiedPath, input.ResultRef) {
		return PersistExecutionResultResult{}, fmt.Errorf("adopted EXP result evidence changed")
	}

	var skipRecords []map[string]interface{}
	if input.EvaluationStatus == "ready" {
		if input.ConditionalActionID != "" || len(input.ConditionalSkipActions) != 3 {
			return PersistExecutionResultResult{}, fmt.Errorf("ready EXP conditional branch evidence invalid")
		}
		wantIDs := []string{"dev-5", "doc-after-dev-5", "exp-6"}
		wantTypes := []string{"dev", "doc", "exp"}
		wantDeps := []string{"exp-4", "dev-5", "doc-after-dev-5"}
		for i, action := range input.ConditionalSkipActions {
			if action.ActionID != wantIDs[i] || action.IntentType != wantTypes[i] || action.DependsOn != wantDeps[i] {
				return PersistExecutionResultResult{}, fmt.Errorf("ready EXP conditional dependency chain changed")
			}
			if i == 0 && action.WhenResult != "remediation_required" || i > 0 && action.WhenResult != "" {
				return PersistExecutionResultResult{}, fmt.Errorf("ready EXP conditional result binding invalid")
			}
			record := map[string]interface{}{"status": "skipped", "skipReason": "whenResult_not_matched", "dependsOn": action.DependsOn}
			if action.WhenResult != "" {
				record["whenResult"] = action.WhenResult
			}
			skipRecords = append(skipRecords, record)
		}
	} else if input.ConditionalActionID != "dev-5" || len(input.ConditionalSkipActions) != 0 {
		return PersistExecutionResultResult{}, fmt.Errorf("remediation EXP result does not bind signed DEV Action")
	}

	path := filepath.Join(mandatesRoot, input.MandateID, "mandate_state.json")
	version, err := mandatestate.Mutate(path, func(state map[string]interface{}) (bool, error) {
		actions, _ := state["actions"].(map[string]interface{})
		docAfterDIS, _ := state["docAfterDIS"].(map[string]interface{})
		docAction, _ := actions[input.DOCActionID].(map[string]interface{})
		prior, _ := actions[input.ActionID].(map[string]interface{})
		currentActionOK := state["currentAction"] == input.DOCActionID ||
			(state["currentAction"] == input.ActionID && prior != nil && prior["status"] == "completed")
		if state["mandateId"] != input.MandateID || !journalBinding(state, input.ContractDigest) || actions == nil ||
			!currentActionOK || docAction == nil || docAction["status"] != "completed" ||
			docAction["contractSha256"] != input.DOCContractSHA256 || docAfterDIS == nil || docAfterDIS["completed"] != true ||
			docAfterDIS["status"] != "completed" || docAfterDIS["actionId"] != input.DOCActionID || docAfterDIS["contractSha256"] != input.DOCContractSHA256 {
			return false, fmt.Errorf("EXP journal does not match completed DOC-after-DIS")
		}
		record := map[string]interface{}{"status": "completed", "evaluationStatus": input.EvaluationStatus,
			"resultRef": input.ResultRef, "resultSha256": input.ResultSHA256}
		if prior != nil && prior["status"] == "completed" {
			if !reflect.DeepEqual(prior, record) {
				return false, fmt.Errorf("EXP result conflicts with prior evidence")
			}
			if input.EvaluationStatus == "ready" {
				for i, skip := range input.ConditionalSkipActions {
					existing, _ := actions[skip.ActionID].(map[string]interface{})
					if existing == nil || !reflect.DeepEqual(existing, skipRecords[i]) {
						return false, fmt.Errorf("EXP skipped branch conflicts with prior state")
					}
				}
				if state["status"] != "completed" || state["fulfilled"] != true {
					return false, fmt.Errorf("EXP ready terminal state changed")
				}
			} else if state["currentAction"] != input.ConditionalActionID || state["status"] == "completed" {
				return false, fmt.Errorf("EXP remediation state changed")
			}
			return false, nil
		}
		if prior != nil && prior["status"] != "pending" {
			return false, fmt.Errorf("EXP Action is not pending")
		}
		actions[input.ActionID] = record
		if input.EvaluationStatus == "ready" {
			for i, action := range input.ConditionalSkipActions {
				existing, _ := actions[action.ActionID].(map[string]interface{})
				if existing != nil && existing["status"] != "pending" && !reflect.DeepEqual(existing, skipRecords[i]) {
					return false, fmt.Errorf("EXP conditional Action %s cannot be skipped from its current state", action.ActionID)
				}
				actions[action.ActionID] = skipRecords[i]
			}
			state["status"] = "completed"
			state["fulfilled"] = true
			state["currentAction"] = input.ActionID
		} else {
			if state["status"] == "completed" || state["fulfilled"] == true {
				return false, fmt.Errorf("remediation-required EXP cannot fulfill the Mandate")
			}
			state["currentAction"] = input.ConditionalActionID
		}
		return true, nil
	})
	if err != nil {
		return PersistExecutionResultResult{}, err
	}
	return PersistExecutionResultResult{StateVersion: version}, nil
}

func executionResultKey(input PersistExecutionResultInput) string {
	if input.ActionID != "" {
		return input.ActionID
	}
	return input.DomainName
}

// PersistExecutionResultActivity deja durable, en
// {mandatesRoot}/{mandateID}/mandate_state.json, el resultado de ejecutar
// una Action de Fase 4 — bajo phases.execute.actions[actionId]. Reusa
// mandatestate.Mutate (mismo mecanismo que PersistHumanSyncActivity /
// PersistSignatureFailureActivity), así que queda serializado contra
// escrituras concurrentes y versionado igual que el resto de
// mandate_state.json. Idempotente: un retry de Temporal que ya encuentra
// el mismo resultado escrito no vuelve a incrementar stateVersion.
func PersistExecutionResultActivity(ctx context.Context, input PersistExecutionResultInput) (PersistExecutionResultResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("PersistExecutionResultActivity started",
		"mandate_id", input.MandateID,
		"action_id", input.ActionID,
		"domain_name", input.DomainName,
		"status", input.Status,
	)

	if input.MandatesRoot == "" || input.MandateID == "" {
		return PersistExecutionResultResult{}, fmt.Errorf("PersistExecutionResultActivity: MandatesRoot/MandateID vacíos")
	}
	if input.ArtifactDigest != "" {
		if input.ActionID == "" || input.Status != "completed" || input.FulfillmentStatus != "fulfilled" || input.ContractDigest == "" || input.ResultRef != "domain_definition.json" {
			return PersistExecutionResultResult{}, fmt.Errorf("Mandate gen evidence is incomplete")
		}
		artifact, err := os.ReadFile(filepath.Join(input.MandatesRoot, input.MandateID, input.ResultRef))
		if err != nil {
			return PersistExecutionResultResult{}, err
		}
		sum := sha256.Sum256(artifact)
		if hex.EncodeToString(sum[:]) != input.ArtifactDigest {
			return PersistExecutionResultResult{}, fmt.Errorf("artifact digest changed before reconciliation")
		}
	}
	key := executionResultKey(input)
	if key == "" {
		return PersistExecutionResultResult{}, fmt.Errorf("PersistExecutionResultActivity: ActionID y DomainName vacíos, no hay clave para persistir")
	}

	path := filepath.Join(input.MandatesRoot, input.MandateID, "mandate_state.json")
	version, err := mandatestate.Mutate(path, func(state map[string]interface{}) (bool, error) {
		phases, _ := state["phases"].(map[string]interface{})
		if phases == nil {
			phases = map[string]interface{}{}
			state["phases"] = phases
		}
		execute, _ := phases["execute"].(map[string]interface{})
		if execute == nil {
			execute = map[string]interface{}{}
			phases["execute"] = execute
		}
		actionsRecord, _ := execute["actions"].(map[string]interface{})
		if actionsRecord == nil {
			actionsRecord = map[string]interface{}{}
			execute["actions"] = actionsRecord
		}

		record := map[string]interface{}{
			"domainName": input.DomainName,
			"status":     input.Status,
		}
		if input.ResultRef != "" {
			record["resultRef"] = input.ResultRef
		}
		if input.ArtifactDigest != "" {
			record["artifactSha256"] = input.ArtifactDigest
			record["contractDigest"] = input.ContractDigest
			record["fulfillmentStatus"] = input.FulfillmentStatus
		}
		if input.Error != "" {
			record["error"] = input.Error
		}

		if existing, ok := actionsRecord[key]; ok && reflect.DeepEqual(existing, record) {
			return false, nil
		}
		actionsRecord[key] = record
		return true, nil
	})
	if err != nil {
		logger.Error("PersistExecutionResultActivity failed",
			"mandate_id", input.MandateID,
			"key", key,
			"error", err,
		)
		return PersistExecutionResultResult{}, fmt.Errorf("PersistExecutionResultActivity: %w", err)
	}
	logger.Info("PersistExecutionResultActivity completed",
		"mandate_id", input.MandateID,
		"key", key,
		"state_version", version,
	)
	return PersistExecutionResultResult{StateVersion: version}, nil
}
