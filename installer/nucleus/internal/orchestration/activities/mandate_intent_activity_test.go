package activities

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/gene"
	"nucleus/internal/orchestration/mandatecontract"
)

func TestAdoptedINGCompletionIsIdempotentAndLeavesDISPending(t *testing.T) {
	base := t.TempDir()
	mandates := filepath.Join(base, ".mandates")
	dir := filepath.Join(mandates, "mandate-1")
	intent := filepath.Join(base, ".intents", ".ing", "intent-1")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(intent, 0700); err != nil {
		t.Fatal(err)
	}
	resultRef := filepath.Join(intent, "ing_result.json")
	ledgerRef := filepath.Join(intent, "ledger.json")
	resultBytes, ledgerBytes := []byte(`{"status":"done"}`), []byte(`{"state":"applied"}`)
	if err := os.WriteFile(resultRef, resultBytes, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(ledgerRef, ledgerBytes, 0600); err != nil {
		t.Fatal(err)
	}
	rsum, lsum := sha256.Sum256(resultBytes), sha256.Sum256(ledgerBytes)
	state := []byte(`{"mandateId":"mandate-1","stateVersion":1,"adoption":{"contractDigest":"contract-1"},"ingDecision":{"actionId":"ing-1","decisionDigest":"decision-1"},"actions":{"ing-1":{"intentId":"intent-1","status":"awaiting_human_decision","evidenceRef":"classification.json","evidenceSha256":"classification-1"}}}`)
	path := filepath.Join(dir, "mandate_state.json")
	if err := os.WriteFile(path, state, 0600); err != nil {
		t.Fatal(err)
	}
	input := MandateINGCompletionResult{MandateID: "mandate-1", ActionID: "ing-1", NextActionID: "dis-1", ContractDigest: "contract-1", IntentID: "intent-1", DecisionDigest: "decision-1", ResultRef: resultRef, ResultDigest: hex.EncodeToString(rsum[:]), LedgerRef: ledgerRef, LedgerDigest: hex.EncodeToString(lsum[:])}
	for i := 0; i < 2; i++ {
		if _, err := PersistAdoptedINGCompletionActivity(context.Background(), input, mandates); err != nil {
			t.Fatalf("attempt %d: %v", i, err)
		}
	}
	final, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var journal map[string]any
	if json.Unmarshal(final, &journal) != nil || journal["currentAction"] != "dis-1" || journal["status"] != "in_progress" || journal["stateVersion"] != float64(2) {
		t.Fatalf("ING transition invalid: %s", final)
	}
	actions := journal["actions"].(map[string]any)
	if actions["dis-1"].(map[string]any)["status"] != "pending" {
		t.Fatalf("DIS was not left pending: %s", final)
	}
}

func TestAdoptedDISProposalIsDurableAndDoesNotCompleteDIS(t *testing.T) {
	base := t.TempDir()
	mandates := filepath.Join(base, ".mandates")
	mandateDir := filepath.Join(mandates, "mandate-1")
	ingDir := filepath.Join(base, ".intents", ".ing", "ing-1")
	disDir := filepath.Join(base, ".intents", ".dis", "dis-1")
	for _, dir := range []string{mandateDir, ingDir, disDir} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	ingRef := filepath.Join(ingDir, "ing_result.json")
	proposalRef := filepath.Join(disDir, "mapping_proposal.json")
	ingBytes := []byte(`{"status":"done"}`)
	proposalBytes := []byte(`{"schema_version":"bloom.dis-mapping/v1"}`)
	if err := os.WriteFile(ingRef, ingBytes, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(proposalRef, proposalBytes, 0600); err != nil {
		t.Fatal(err)
	}
	ingHash, proposalHash := sha256.Sum256(ingBytes), sha256.Sum256(proposalBytes)
	ingDigest, proposalDigest := hex.EncodeToString(ingHash[:]), hex.EncodeToString(proposalHash[:])
	state := map[string]any{"mandateId": "mandate-1", "stateVersion": 1, "currentAction": "dis-2",
		"adoption": map[string]any{"contractDigest": "contract-1"},
		"actions": map[string]any{"ing-1": map[string]any{"intentId": "ing-intent", "status": "completed", "resultRef": ingRef, "resultSha256": ingDigest},
			"dis-2": map[string]any{"status": "pending", "dependsOn": "ing-1"}}}
	raw, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(mandateDir, "mandate_state.json")
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	input := MandateDISResult{MandateID: "mandate-1", ActionID: "dis-2", ContractDigest: "contract-1", IntentID: "dis-intent",
		INGIntentID: "ing-intent", INGResultRef: ingRef, INGResultDigest: ingDigest,
		ProposalRef: proposalRef, ProposalDigest: proposalDigest, Status: "awaiting_human_decision"}
	for range 2 {
		if _, err := PersistAdoptedDISProposalActivity(context.Background(), input, mandates); err != nil {
			t.Fatal(err)
		}
	}
	finalRaw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var final map[string]any
	if json.Unmarshal(finalRaw, &final) != nil {
		t.Fatal("invalid journal")
	}
	if final["stateVersion"] != float64(2) || final["status"] != "waiting_human" || final["currentAction"] != "dis-2" {
		t.Fatalf("DIS journal advanced incorrectly: %s", finalRaw)
	}
	actions := final["actions"].(map[string]any)
	if actions["dis-2"].(map[string]any)["status"] != "awaiting_human_decision" {
		t.Fatalf("DIS proposal was marked completed: %s", finalRaw)
	}
}

func TestObserveDISTerminalRequiresCommittedAppliedLedger(t *testing.T) {
	activity, input, intentRoot, writeTerminal := prepareDISTerminalFixture(t)

	pending, err := activity.ObserveDISTerminal(context.Background(), input)
	if err != nil || pending.Ready || pending.Status != "pending" {
		t.Fatalf("proposal was not kept pending: result=%#v err=%v", pending, err)
	}

	writeTerminal(false)
	if _, err := activity.ObserveDISTerminal(context.Background(), input); err == nil {
		t.Fatal("done DIS with uncommitted ratification was accepted")
	}

	writeTerminal(true)
	completed, err := activity.ObserveDISTerminal(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	if !completed.Ready || completed.Status != "completed" || completed.IntentID != "dis-intent" || completed.EffectsDigest == "" {
		t.Fatalf("terminal DIS was not observed: %#v", completed)
	}
	if completed.RatificationRef != filepath.Join(intentRoot, ".ratification", ".turn_1", ".ratification.json") {
		t.Fatalf("unexpected ratification evidence: %#v", completed)
	}
}

func TestPersistAdoptedDISCompletionIsIdempotentAndDoesNotAdvanceDOC(t *testing.T) {
	base := t.TempDir()
	mandates := filepath.Join(base, ".mandates")
	mandateDir := filepath.Join(mandates, "mandate-1")
	intentDir := filepath.Join(base, ".intents", ".dis", "dis-intent")
	if err := os.MkdirAll(mandateDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(intentDir, 0700); err != nil {
		t.Fatal(err)
	}
	refs := []string{filepath.Join(intentDir, "proposal.json"), filepath.Join(intentDir, "ratification.json"), filepath.Join(intentDir, "ledger.json")}
	digests := make([]string, len(refs))
	for i, ref := range refs {
		content := []byte(`{"evidence":true}`)
		if err := os.WriteFile(ref, content, 0600); err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(content)
		digests[i] = hex.EncodeToString(sum[:])
	}
	journal := map[string]interface{}{
		"mandateId": "mandate-1", "stateVersion": 1, "status": "waiting_human", "currentAction": "dis-2",
		"adoption": map[string]interface{}{"contractDigest": "contract-1"},
		"actions": map[string]interface{}{"dis-2": map[string]interface{}{
			"intentId": "dis-intent", "status": "awaiting_human_decision", "proposalRef": refs[0], "proposalSha256": digests[0],
			"ingIntentId": "ing-intent", "ingResultRef": "ing.json", "ingResultSha256": "ing-digest",
		}},
	}
	raw, _ := json.Marshal(journal)
	statePath := filepath.Join(mandateDir, "mandate_state.json")
	if err := os.WriteFile(statePath, raw, 0600); err != nil {
		t.Fatal(err)
	}
	completion := MandateDISCompletionResult{
		Ready: true, MandateID: "mandate-1", ActionID: "dis-2", ContractDigest: "contract-1", IntentID: "dis-intent",
		ProposalRef: refs[0], ProposalDigest: digests[0], TurnID: "1", RatificationRef: refs[1], RatificationDigest: digests[1],
		LedgerRef: refs[2], LedgerDigest: digests[2], EffectsDigest: "effects-digest", Status: "completed",
	}
	for range 2 {
		if _, err := PersistAdoptedDISCompletionActivity(context.Background(), completion, mandates); err != nil {
			t.Fatal(err)
		}
	}
	finalRaw, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	var final map[string]interface{}
	if err := json.Unmarshal(finalRaw, &final); err != nil {
		t.Fatal(err)
	}
	if final["currentAction"] != "dis-2" || final["status"] != "in_progress" || final["stateVersion"] != float64(2) {
		t.Fatalf("completion advanced the signed graph or was not idempotent: %s", finalRaw)
	}
	action := final["actions"].(map[string]interface{})["dis-2"].(map[string]interface{})
	if action["status"] != "completed" || action["ratificationSha256"] != digests[1] || action["ledgerSha256"] != digests[2] {
		t.Fatalf("terminal evidence was not persisted: %s", finalRaw)
	}
}

func TestIndependentDOCAfterDISUsesPreparedSourcesAndCompletes(t *testing.T) {
	activity, input, _, writeTerminal := prepareDISTerminalFixture(t)
	nucleusRoot := filepath.Dir(input.MandatesRoot)
	projectRoot := filepath.Join(nucleusRoot, "project")
	if err := os.MkdirAll(filepath.Join(nucleusRoot, ".core"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(projectRoot, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(projectRoot, "input.md"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	catalog, _ := json.Marshal(map[string]interface{}{"projects": []map[string]interface{}{{"id": "project", "absolutePath": projectRoot}}})
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".core", ".nucleus-config.json"), catalog, 0600); err != nil {
		t.Fatal(err)
	}
	writeTerminal(true)
	terminal, err := activity.ObserveDISTerminal(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	statePath := filepath.Join(input.MandatesRoot, input.MandateID, "mandate_state.json")
	var state map[string]interface{}
	raw, _ := os.ReadFile(statePath)
	if err := json.Unmarshal(raw, &state); err != nil {
		t.Fatal(err)
	}
	state["projectId"] = "project"
	state["currentAction"] = terminal.ActionID
	state["preparation"] = map[string]interface{}{"contractDigest": terminal.ContractDigest, "sourceFiles": []string{"input.md"}}
	disRecord := state["actions"].(map[string]interface{})[terminal.ActionID].(map[string]interface{})
	disRecord["ingIntentId"], disRecord["ingResultRef"], disRecord["ingResultSha256"] = "ing-intent", "ing-result.json", "ing-digest"
	raw, _ = json.Marshal(state)
	if err := os.WriteFile(statePath, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := PersistAdoptedDISCompletionActivity(context.Background(), terminal, input.MandatesRoot); err != nil {
		t.Fatal(err)
	}

	var calls [][]string
	fake := func(_ string, args []string) ([]byte, []byte, int, error) {
		calls = append(calls, append([]string(nil), args...))
		if len(calls) == 1 {
			boundRaw, readErr := os.ReadFile(statePath)
			var bound map[string]interface{}
			if readErr != nil || json.Unmarshal(boundRaw, &bound) != nil {
				t.Fatalf("DOC Action binding was not durable before Brain dispatch: %v", readErr)
			}
			doc := bound["docAfterDIS"].(map[string]interface{})
			action := bound["actions"].(map[string]interface{})["c"].(map[string]interface{})
			if doc["actionId"] != "c" || doc["dependsOnActionId"] != "b" || action["status"] != "in_progress" || action["dependsOn"] != "b" {
				t.Fatalf("signed DOC Action was not bound before dispatch: %s", boundRaw)
			}
		}
		operation := args[2]
		data := map[string]interface{}{"intent_id": "doc-id", "folder_name": ".doc-after-dis", "doc": map[string]interface{}{"doc_status": "created", "next_action": "hydrate"}}
		if operation == "hydrate" {
			data = map[string]interface{}{"doc": map[string]interface{}{"doc_status": "empty", "next_action": "finalize", "run_sha256": "sha256:run"}}
		}
		if operation == "finalize" {
			data = map[string]interface{}{"doc": map[string]interface{}{"doc_status": "completed", "next_action": "none", "run_sha256": "sha256:run"}}
		}
		out, _ := json.Marshal(map[string]interface{}{"status": "success", "operation": "intent_" + operation, "data": data})
		return out, nil, 0, nil
	}
	docActivity := &MandateDOCActivity{IdentityPath: activity.IdentityPath, BrainPath: "brain", RunBrain: fake}
	result, err := docActivity.RunAfterDIS(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Ready || result.ActionID != "c" || result.DocStatus != "completed" || len(calls) != 3 {
		t.Fatalf("unexpected DOC result=%#v calls=%#v", result, calls)
	}
	create := strings.Join(calls[0], " ")
	for _, required := range []string{"--trigger-intent dis-intent", "--trigger-nucleus " + nucleusRoot, "-f input.md", "--doc-document input.md"} {
		if !strings.Contains(create, required) {
			t.Fatalf("create omitted %q: %s", required, create)
		}
	}
	finalRaw, _ := os.ReadFile(statePath)
	var final map[string]interface{}
	if json.Unmarshal(finalRaw, &final) != nil {
		t.Fatal("invalid final state")
	}
	doc := final["docAfterDIS"].(map[string]interface{})
	docAction := final["actions"].(map[string]interface{})["c"].(map[string]interface{})
	if doc["completed"] != true || doc["actionId"] != "c" || doc["intentId"] != "doc-id" || doc["triggerIntentId"] != "dis-intent" ||
		docAction["status"] != "completed" || final["currentAction"] != "c" {
		t.Fatalf("DOC evidence missing: %s", finalRaw)
	}
	second, err := docActivity.RunAfterDIS(context.Background(), MandateIntentInput{MandatesRoot: input.MandatesRoot, MandateID: input.MandateID, ActionID: "c"})
	if err != nil || !second.Ready || second.ActionID != "c" || second.IntentID != "doc-id" {
		t.Fatalf("idempotent DOC resume failed: result=%#v err=%v", second, err)
	}
	if len(calls) != 3 {
		t.Fatalf("completed DOC invoked Brain again: calls=%#v", calls)
	}
}

func TestSignedDOCAfterDISUsesActionIdentityWhenEarlierDOCMovesDIS(t *testing.T) {
	actions := []mandatecontract.Action{
		{ActionID: "ing-1", IntentType: "ing"},
		{ActionID: "doc-after-ing", IntentType: "doc", DependsOn: []string{"ing-1"}},
		{ActionID: "dis-1", IntentType: "dis", DependsOn: []string{"doc-after-ing"}},
		{ActionID: "doc-after-dis", IntentType: "doc", DependsOn: []string{"dis-1"}},
	}
	dis, doc, err := signedDOCFollowingDIS(actions, "dis-1", "")
	if err != nil {
		t.Fatal(err)
	}
	if dis.ActionID != "dis-1" || doc.ActionID != "doc-after-dis" {
		t.Fatalf("wrong signed DOC identity: dis=%#v doc=%#v", dis, doc)
	}
	if _, _, err := signedDOCFollowingDIS(actions, "dis-1", "doc-after-ing"); err == nil {
		t.Fatal("a DOC Action bound to another antecedent was accepted")
	}
}

func TestIndependentDOCAfterINGRequiresCanonicalGeneReceiptAndIsIdempotent(t *testing.T) {
	docActivity, input, statePath, receipt := prepareINGDOCFixture(t)
	var calls [][]string
	docActivity.VerifyINGMaterialization = func(_ string, _ string, expected gene.INGMaterializationBinding) (gene.INGMaterializationReceipt, error) {
		if expected != receipt.Binding {
			t.Fatalf("unexpected G2 binding: %#v", expected)
		}
		return receipt, nil
	}
	docActivity.RunBrain = func(_ string, args []string) ([]byte, []byte, int, error) {
		calls = append(calls, append([]string(nil), args...))
		operation := args[2]
		data := map[string]interface{}{"intent_id": "doc-ing-id", "folder_name": ".doc-after-ing", "doc": map[string]interface{}{"doc_status": "created", "next_action": "hydrate"}}
		if operation == "hydrate" {
			data = map[string]interface{}{"doc": map[string]interface{}{"doc_status": "empty", "next_action": "finalize", "run_sha256": "sha256:run-ing"}}
		}
		if operation == "finalize" {
			data = map[string]interface{}{"doc": map[string]interface{}{"doc_status": "completed", "next_action": "none", "run_sha256": "sha256:run-ing"}}
		}
		out, _ := json.Marshal(map[string]interface{}{"status": "success", "operation": "intent_" + operation, "data": data})
		return out, nil, 0, nil
	}
	result, err := docActivity.RunAfterING(context.Background(), input)
	if err != nil || !result.Ready || result.ActionID != "doc-after-ing-1" || result.INGActionID != "ing-1" || result.FollowingActionID != "dis-2" || len(calls) != 3 {
		t.Fatalf("ING DOC failed: result=%#v calls=%#v err=%v", result, calls, err)
	}
	raw, _ := os.ReadFile(statePath)
	var state map[string]interface{}
	_ = json.Unmarshal(raw, &state)
	actions := state["actions"].(map[string]interface{})
	if state["currentAction"] != "dis-2" || actions["doc-after-ing-1"].(map[string]interface{})["status"] != "completed" || actions["dis-2"].(map[string]interface{})["status"] != "pending" {
		t.Fatalf("ING DOC transition not durable: %s", raw)
	}
	second, err := docActivity.RunAfterING(context.Background(), MandateIntentInput{MandatesRoot: input.MandatesRoot, MandateID: input.MandateID, ActionID: result.ActionID, INGActionID: result.INGActionID})
	if err != nil || !second.Ready || second.IntentID != result.IntentID || len(calls) != 3 {
		t.Fatalf("completed ING DOC reopened: result=%#v calls=%d err=%v", second, len(calls), err)
	}
}

func TestIndependentDOCAfterINGVerifiesBatchGeneReceipt(t *testing.T) {
	docActivity, input, statePath, _ := prepareINGDOCFixture(t)
	mandateDir := filepath.Join(input.MandatesRoot, input.MandateID)
	envelope, err := mandatecontract.LoadVerified(mandateDir, docActivity.IdentityPath)
	if err != nil {
		t.Fatal(err)
	}
	resultPath := filepath.Join(mandateDir, "ing_result.json")
	ledgerPath := filepath.Join(mandateDir, "ing-ledger.json")
	decisionItems := []map[string]string{{"cluster_id": "core-logic-and-testing", "human_decision": "approved"}}
	decisionRaw, _ := json.Marshal(decisionItems)
	decisionSum := sha256.Sum256(decisionRaw)
	decisionDigest := hex.EncodeToString(decisionSum[:])
	ledger := map[string]any{"state": "state_advanced", "state_advanced": true, "closure_semantics": "logical_contributions",
		"identity": map[string]any{"intent_id": "ing-intent", "intent_type": "ing", "stage": "consolidation"},
		"effects":  []any{map[string]any{"status": "applied"}, map[string]any{"status": "applied"}, map[string]any{"status": "applied"}}}
	ledgerRaw, _ := json.Marshal(ledger)
	ledgerCanonical, err := pythonCanonicalJSON(ledger)
	if err != nil {
		t.Fatal(err)
	}
	ledgerSum := sha256.Sum256(ledgerCanonical)
	result := map[string]any{"schema_version": "bloom.ing-result/v1", "status": "done", "mandate_id": input.MandateID, "intent_id": "ing-intent",
		"effect_ledger_digest": "sha256:" + hex.EncodeToString(ledgerSum[:]),
		"accepted_contributions": []any{map[string]any{"cluster_id": "core-logic-and-testing", "contribution_id": "44444444-4444-4444-8444-444444444444",
			"decision_id": "decision-1", "gene_id": "33333333-3333-4333-8333-333333333333", "human_decision": "approved", "project_id": "11111111-1111-4111-8111-111111111111",
			"contribution": map[string]any{"schema_version": gene.SchemaVersion, "contribution_id": "44444444-4444-4444-8444-444444444444", "gene_id": "33333333-3333-4333-8333-333333333333",
				"project_id": "11111111-1111-4111-8111-111111111111", "mandate_id": input.MandateID, "intent_id": "ing-intent", "ratification": map[string]any{"decision_id": "decision-1"}}}}}
	resultRaw, _ := json.Marshal(result)
	resultSum := sha256.Sum256(resultRaw)
	if err = os.WriteFile(resultPath, resultRaw, 0600); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(ledgerPath, ledgerRaw, 0600); err != nil {
		t.Fatal(err)
	}
	stateRaw, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	var state map[string]any
	if json.Unmarshal(stateRaw, &state) != nil {
		t.Fatal("invalid fixture mandate state")
	}
	ingAction := state["actions"].(map[string]any)["ing-1"].(map[string]any)
	ingAction["resultRef"], ingAction["resultSha256"] = resultPath, hex.EncodeToString(resultSum[:])
	ingAction["ledgerRef"], ingAction["ledgerSha256"] = ledgerPath, hex.EncodeToString(ledgerSum[:])
	ingAction["decisionDigest"] = decisionDigest
	state["ingDecision"] = map[string]any{"actionId": "ing-1", "contractDigest": envelope.ContractDigest, "intentId": "ing-intent", "decisionDigest": decisionDigest,
		"decisions": decisionItems}
	updated, _ := json.Marshal(state)
	if err = os.WriteFile(statePath, updated, 0600); err != nil {
		t.Fatal(err)
	}
	var stateAction struct {
		IntentID              string `json:"intentId"`
		Status                string `json:"status"`
		ResultRef             string `json:"resultRef"`
		ResultSHA             string `json:"resultSha256"`
		LedgerRef             string `json:"ledgerRef"`
		LedgerSHA             string `json:"ledgerSha256"`
		DecisionDigest        string `json:"decisionDigest"`
		MaterializationRef    string `json:"geneMaterializationReceiptRef"`
		MaterializationDigest string `json:"geneMaterializationReceiptDigest"`
	}
	stateAction.IntentID, stateAction.Status, stateAction.ResultRef, stateAction.ResultSHA = "ing-intent", "completed", resultPath, hex.EncodeToString(resultSum[:])
	stateAction.LedgerRef, stateAction.LedgerSHA, stateAction.DecisionDigest = ledgerPath, hex.EncodeToString(ledgerSum[:]), decisionDigest
	expected, err := expectedINGMaterializationBatchBinding(mandateDir, envelope.Contract, envelope.ContractDigest, "ing-1", "ing-intent", decisionDigest,
		hex.EncodeToString(resultSum[:]), hex.EncodeToString(ledgerSum[:]), resultPath, stateAction)
	if err != nil {
		t.Fatal(err)
	}
	receipt := gene.INGMaterializationBatchReceipt{SchemaVersion: gene.INGMaterializationBatchReceiptSchema, Binding: expected,
		ReceiptDigest: "sha256:" + strings.Repeat("a", 64)}
	receiptRaw, _ := json.Marshal(receipt)
	receiptPath := filepath.Join(mandateDir, "evidence", "gene-materialization.json")
	if err = os.WriteFile(receiptPath, receiptRaw, 0600); err != nil {
		t.Fatal(err)
	}
	ingAction["geneMaterializationReceiptRef"], ingAction["geneMaterializationReceiptDigest"] = receiptPath, receipt.ReceiptDigest
	updated, _ = json.Marshal(state)
	if err = os.WriteFile(statePath, updated, 0600); err != nil {
		t.Fatal(err)
	}
	verified := false
	docActivity.VerifyINGMaterializationBatch = func(_ string, _ string, binding gene.INGMaterializationBatchBinding) (gene.INGMaterializationBatchReceipt, error) {
		verified = true
		if !equalDOCINGBatchBinding(binding, expected) {
			t.Fatalf("unexpected batch binding: %#v", binding)
		}
		return receipt, nil
	}
	docActivity.RunBrain = func(_ string, args []string) ([]byte, []byte, int, error) {
		operation := args[2]
		data := map[string]any{"intent_id": "doc-ing-id", "folder_name": ".doc-after-ing", "doc": map[string]any{"doc_status": "created", "next_action": "hydrate"}}
		if operation == "hydrate" {
			data = map[string]any{"doc": map[string]any{"doc_status": "empty", "next_action": "finalize", "run_sha256": "sha256:run-ing"}}
		}
		if operation == "finalize" {
			data = map[string]any{"doc": map[string]any{"doc_status": "completed", "next_action": "none", "run_sha256": "sha256:run-ing"}}
		}
		out, _ := json.Marshal(map[string]any{"status": "success", "operation": "intent_" + operation, "data": data})
		return out, nil, 0, nil
	}
	resultDOC, err := docActivity.RunAfterING(context.Background(), input)
	if err != nil || !verified || !resultDOC.Ready || resultDOC.ActionID != "doc-after-ing-1" {
		t.Fatalf("DOC rejected valid batch receipt: result=%#v verified=%v err=%v", resultDOC, verified, err)
	}
}

func TestINGGeneRatificationDeduplicatesRepositoryAcrossContributionAssets(t *testing.T) {
	repositoryID := "e65c7f4f-1891-44ee-bcc5-d57aa4ab6385"
	contribution := gene.Contribution{Assets: []gene.AssetRef{
		{RepositoryID: repositoryID, RepositoryRelativePath: "tasks.py"},
		{RepositoryID: repositoryID, RepositoryRelativePath: "test_tasks.py"},
	}}

	repositoryIDs := sortedUniqueAssetRepositoryIDs(contribution.Assets)
	if len(repositoryIDs) != 1 || repositoryIDs[0] != repositoryID {
		t.Fatalf("expected the shared repository exactly once, got %#v", repositoryIDs)
	}
}

func TestMandateINGGeneMaterializationReceiptVerifiesFromResolvedNucleusRoot(t *testing.T) {
	base := t.TempDir()
	appDataRoot := filepath.Join(base, "appdata")
	nucleusRoot := filepath.Join(base, "workspace", ".bloom", ".nucleus-fixture")
	mandatesRoot := filepath.Join(nucleusRoot, ".mandates")
	mandateID, organizationID, projectID := "00000000-0000-4000-8000-000000000301", "org-fixture", "00000000-0000-4000-8000-000000000302"
	intentID, repositoryID, contributionID, geneID, decisionID := "00000000-0000-4000-8000-000000000303", "00000000-0000-4000-8000-000000000304", "00000000-0000-4000-8000-000000000305", "00000000-0000-4000-8000-000000000306", "00000000-0000-4000-8000-000000000307"
	t.Setenv("BLOOM_APPDATA_DIR", appDataRoot)
	now := time.Now().UTC().Truncate(time.Second)
	mandateDir := filepath.Join(mandatesRoot, mandateID)
	projectRoot := filepath.Join(base, "workspace", "project")
	intentRoot := filepath.Join(nucleusRoot, ".intents", ".ing", "fixture-ing")
	for _, dir := range []string{filepath.Join(mandateDir, "inputs"), filepath.Join(mandateDir, "evidence"), filepath.Join(nucleusRoot, ".core"), projectRoot, filepath.Join(intentRoot, ".consolidation", ".turn_1"), filepath.Join(appDataRoot, "authority")} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
	}
	identityPath := filepath.Join(appDataRoot, "authority", "installation-identity.json")
	identity, err := authority.LoadOrCreateLocalIdentity(identityPath)
	if err != nil {
		t.Fatal(err)
	}
	content := []byte("fixture project input\n")
	inputRef := filepath.Join(mandateDir, "inputs", "README.md")
	if err = os.WriteFile(inputRef, content, 0600); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(projectRoot, "README.md"), content, 0600); err != nil {
		t.Fatal(err)
	}
	inputSum := sha256.Sum256(content)
	resource := []byte(`{}`)
	policyPath, registryPath := filepath.Join(base, "policy.json"), filepath.Join(base, "registry.json")
	for _, path := range []string{policyPath, registryPath} {
		if err = os.WriteFile(path, resource, 0600); err != nil {
			t.Fatal(err)
		}
	}
	resourceSum := sha256.Sum256(resource)
	no := false
	actions := make([]mandatecontract.Action, 8)
	ids := []string{"ing-1", "doc-after-ing-1", "dis-2", "doc-after-dis-2", "exp-4", "dev-5", "doc-after-dev-5", "exp-6"}
	types := []string{"ing", "doc", "dis", "doc", "exp", "dev", "doc", "exp"}
	for i := range actions {
		actions[i] = mandatecontract.Action{ActionID: ids[i], Type: "run_intent", IntentType: types[i], RequiresIntelligence: &no, DomainID: "domain-fixture", ArtifactRef: "domain_definition.json", IdempotencyKey: "fixture-" + ids[i]}
		if i > 0 {
			actions[i].DependsOn = []string{ids[i-1]}
		}
	}
	actions[5].WhenResult = "remediation_required"
	contract := mandatecontract.Contract{MandateID: mandateID, ContractVersion: 4, OrganizationID: organizationID, ProjectID: projectID,
		ProjectBinding: "fixture-binding", Objective: "Verify G2 receipt root", Domain: mandatecontract.Domain{ID: "domain-fixture", Name: "Fixture"}, Actions: actions,
		Intelligence: &mandatecontract.Intelligence{PolicyRef: policyPath, PolicyVersion: "fixture-v1", PolicySHA256: hex.EncodeToString(resourceSum[:]),
			RegistryRef: registryPath, RegistrySHA256: hex.EncodeToString(resourceSum[:]), MaxTotalTokens: 1, MaxOutputTokens: 1},
		Inputs:      []mandatecontract.Input{{Ref: "inputs/README.md", SHA256: hex.EncodeToString(inputSum[:]), Size: int64(len(content))}},
		Fulfillment: mandatecontract.Fulfillment{Evaluator: "exp-ready", EvaluatorVersion: "1", RequiredFields: []string{"ing", "dis", "doc", "exp"}}}
	envelope, err := mandatecontract.Sign(contract, identity)
	if err != nil {
		t.Fatal(err)
	}
	envelopeRaw, _ := json.Marshal(envelope)
	if err = os.WriteFile(filepath.Join(mandateDir, "mandate.json"), envelopeRaw, 0600); err != nil {
		t.Fatal(err)
	}
	writeINGMaterializationTestActReceipts(t, mandateDir, contract, envelope.ContractDigest, organizationID, identity, now)
	for _, operation := range []string{"approve", "activate"} {
		if _, err = mandatecontract.LoadActReceipt(mandateDir, operation); err != nil {
			t.Fatal(err)
		}
	}

	principalID, membershipID, roleID := "00000000-0000-4000-8000-000000000308", "00000000-0000-4000-8000-000000000309", "fixture-gene-ratifier"
	projection := authority.FullContent{
		Principals:      []authority.Principal{{PrincipalID: principalID, PrincipalType: "human", Status: "active", ExternalIdentities: []authority.ExternalIdentity{{Provider: "fixture", Subject: "human", DisplayHandle: "human", Status: "verified", VerifiedAt: now.Add(-time.Minute)}}}},
		Memberships:     []authority.Membership{{MembershipID: membershipID, PrincipalID: principalID, OrganizationID: organizationID, Status: "active", ValidFrom: now.Add(-time.Hour), AcceptedAt: now.Add(-time.Hour)}},
		RoleDefinitions: []authority.RoleDefinition{{RoleID: roleID, RoleVersion: "1", RoleOrigin: "organization", DisplayName: "Fixture Gene Ratifier", Status: "active", Permissions: []string{authority.PermissionGeneContributionRatify}}},
		RoleAssignments: []authority.RoleAssignment{{AssignmentID: "fixture-assignment", MembershipID: membershipID, RoleID: roleID, RoleVersion: "1", Scope: authority.Scope{Type: "project", ID: projectID}, Status: "active", ValidFrom: now.Add(-time.Hour), AcceptedAt: now.Add(-time.Hour)}},
		Revocations:     []authority.Revocation{},
	}
	stateDigest, err := authority.StateDigest(projection, organizationID)
	if err != nil {
		t.Fatal(err)
	}
	payloadDigest := base64.RawURLEncoding.EncodeToString(make([]byte, sha256.Size))
	state := &authority.DurableState{Binding: authority.Binding{OrganizationID: organizationID, Issuer: "fixture-issuer", InstallationID: identity.InstallationID},
		Projection: projection, Monotonic: authority.MonotonicState{HighWaterMark: "1", Digest: payloadDigest, StateDigest: stateDigest},
		Emission: &authority.EmissionMetadata{Schema: "bloom.authority.snapshot", SchemaVersion: "1.0", SnapshotID: "fixture-snapshot", Issuer: "fixture-issuer", OrganizationID: organizationID, AuthorityVersion: "1", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour), Audience: authority.Audience{OrganizationID: organizationID, InstallationIDs: []string{identity.InstallationID}}}}
	authorityStore := &authority.Store{Path: filepath.Join(appDataRoot, "authority", "state.json")}
	if err = authorityStore.Save(state); err != nil {
		t.Fatal(err)
	}
	stateRaw, err := os.ReadFile(authorityStore.Path)
	if err != nil {
		t.Fatal(err)
	}
	stateSum := sha256.Sum256(stateRaw)
	checkpoint := authority.Checkpoint{Schema: "bloom.authority.checkpoint/v1", Binding: state.Binding, HighWaterMark: "1", PayloadDigest: payloadDigest, StateDigest: stateDigest, StoreDigest: base64.RawURLEncoding.EncodeToString(stateSum[:])}
	checkpointRaw, _ := json.Marshal(checkpoint)
	if err = os.WriteFile(filepath.Join(appDataRoot, "authority", "checkpoint.json"), checkpointRaw, 0600); err != nil {
		t.Fatal(err)
	}

	catalog, _ := json.Marshal(map[string]any{"projects": []any{map[string]any{"id": projectID, "absolutePath": projectRoot}}})
	if err = os.WriteFile(filepath.Join(nucleusRoot, ".core", ".nucleus-config.json"), catalog, 0600); err != nil {
		t.Fatal(err)
	}
	repositoryBinding := &authority.RepositoryBindingStore{Path: filepath.Join(appDataRoot, "authority", "repository-bindings.json")}
	if err = repositoryBinding.Save(authority.RepositoryBinding{SchemaVersion: "bloom.repository-binding/v1", ProjectID: projectID, RepositoryID: repositoryID,
		Root: projectRoot, InstallationID: identity.InstallationID, AuthorityVersion: "1", AuthorizedBy: principalID, Status: "active", Revision: 1, AuthorizedAt: now}); err != nil {
		t.Fatal(err)
	}
	intentState, _ := json.Marshal(map[string]string{"mandate_id": mandateID, "intent_id": intentID})
	if err = os.WriteFile(filepath.Join(intentRoot, ".ing_state.json"), intentState, 0600); err != nil {
		t.Fatal(err)
	}
	ledger := map[string]any{"state": "state_advanced", "state_advanced": true, "closure_semantics": "logical_contributions",
		"identity": map[string]any{"intent_id": intentID, "intent_type": "ing", "stage": "consolidation"},
		"effects":  []any{map[string]any{"status": "applied"}, map[string]any{"status": "applied"}, map[string]any{"status": "applied"}}}
	ledgerRaw, _ := json.Marshal(ledger)
	ledgerCanonical, err := pythonCanonicalJSON(ledger)
	if err != nil {
		t.Fatal(err)
	}
	ledgerCanonicalSum := sha256.Sum256(ledgerCanonical)
	clusterID := "core-logic-and-testing"
	asset := gene.AssetRef{ProjectID: projectID, RepositoryID: repositoryID, Kind: "document", RepositoryRelativePath: inputRef}
	contribution := gene.Contribution{SchemaVersion: gene.SchemaVersion, ContributionID: contributionID, ProjectID: projectID, GeneID: geneID, MandateID: mandateID,
		IntentID: intentID, DeclaredFunction: "Fixture accepted contribution", Assets: []gene.AssetRef{asset}, Ratification: gene.RatificationEvidence{DecisionID: decisionID}}
	geneIdentity := gene.Identity{SchemaVersion: gene.SchemaVersion, ProjectID: projectID, GeneID: geneID, Function: "Fixture accepted contribution",
		Origin: gene.Origin{MandateID: mandateID, IntentID: intentID, DecisionID: decisionID}}
	decisions := []map[string]string{{"cluster_id": clusterID, "human_decision": "approved"}}
	decisionRaw, _ := json.Marshal(decisions)
	decisionCanonical, err := authority.Canonicalize(decisionRaw)
	if err != nil {
		t.Fatal(err)
	}
	decisionSum := sha256.Sum256(decisionCanonical)
	decisionDigest := hex.EncodeToString(decisionSum[:])
	result := map[string]any{"schema_version": "bloom.ing-result/v1", "status": "done", "mandate_id": mandateID, "intent_id": intentID,
		"effect_ledger_digest":   "sha256:" + hex.EncodeToString(ledgerCanonicalSum[:]),
		"accepted_contributions": []acceptedINGContribution{{ClusterID: clusterID, ContributionID: contributionID, DecisionID: decisionID, GeneID: geneID, HumanDecision: "approved", ProjectID: projectID, Contribution: contribution, Identity: geneIdentity}},
		"rejected_clusters":      []any{}}
	resultRaw, _ := json.Marshal(result)
	resultSum, ledgerSum := sha256.Sum256(resultRaw), sha256.Sum256(ledgerRaw)
	resultPath, ledgerPath := filepath.Join(intentRoot, "ing_result.json"), filepath.Join(intentRoot, ".consolidation", ".turn_1", ".effect_ledger.json")
	if err = os.WriteFile(resultPath, resultRaw, 0600); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(ledgerPath, ledgerRaw, 0600); err != nil {
		t.Fatal(err)
	}
	stateJournal := map[string]any{"mandateId": mandateID, "projectId": projectID, "stateVersion": 1, "status": "in_progress", "currentAction": "doc-after-ing-1",
		"adoption":    map[string]any{"contractDigest": envelope.ContractDigest},
		"preparation": map[string]any{"contractDigest": envelope.ContractDigest, "sourceFiles": []string{"README.md"}},
		"activation":  map[string]any{"status": "active", "contractDigest": envelope.ContractDigest},
		"actions": map[string]any{"ing-1": map[string]any{"intentId": intentID, "status": "completed", "resultRef": resultPath, "resultSha256": hex.EncodeToString(resultSum[:]),
			"ledgerRef": ledgerPath, "ledgerSha256": hex.EncodeToString(ledgerSum[:]), "decisionDigest": decisionDigest}},
		"ingDecision": map[string]any{"actionId": "ing-1", "contractDigest": envelope.ContractDigest, "intentId": intentID, "decisionDigest": decisionDigest, "decisions": decisions}}
	statePath := filepath.Join(mandateDir, "mandate_state.json")
	stateJournalRaw, _ := json.Marshal(stateJournal)
	if err = os.WriteFile(statePath, stateJournalRaw, 0600); err != nil {
		t.Fatal(err)
	}

	activity := &MandateINGGeneMaterializationActivity{IdentityPath: identityPath, AppDataDir: appDataRoot, Now: func() time.Time { return now }}
	resultActivity, err := activity.Run(context.Background(), MandateIntentInput{MandatesRoot: mandatesRoot, MandateID: mandateID, ActionID: "doc-after-ing-1", INGActionID: "ing-1"})
	if err != nil {
		t.Fatalf("materialization activity: %v", err)
	}
	if resultActivity.ReceiptRef != filepath.Join(mandateDir, "evidence", geneMaterializationReceiptName) {
		t.Fatalf("unexpected receipt ref: %s", resultActivity.ReceiptRef)
	}
	var receipt gene.INGMaterializationBatchReceipt
	receiptRaw, err := os.ReadFile(resultActivity.ReceiptRef)
	if err != nil || json.Unmarshal(receiptRaw, &receipt) != nil {
		t.Fatalf("read generated batch receipt: %v", err)
	}
	if receipt.SchemaVersion != gene.INGMaterializationBatchReceiptSchema || len(receipt.Materializations) != 1 {
		t.Fatalf("generated receipt incomplete: %#v", receipt)
	}
	if _, err = (&gene.Store{Root: nucleusRoot}).VerifyINGMaterializationBatchReceipt(resultActivity.ReceiptRef, receipt.Binding); err != nil {
		t.Fatalf("receipt did not verify from resolved Nucleus root %q: %v", nucleusRoot, err)
	}
	if _, err = (&gene.Store{Root: appDataRoot}).VerifyINGMaterializationBatchReceipt(resultActivity.ReceiptRef, receipt.Binding); err == nil {
		t.Fatal("receipt unexpectedly verified from the unrelated AppData root")
	}
}

func writeINGMaterializationTestActReceipts(t *testing.T, mandateDir string, contract mandatecontract.Contract, contractDigest, organizationID string, identity *authority.LocalIdentity, now time.Time) []byte {
	t.Helper()
	seed, _ := hex.DecodeString("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60")
	rootPrivate := ed25519.NewKeyFromSeed(seed)
	actorPublic, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	actorPublicText := base64.RawURLEncoding.EncodeToString(actorPublic)
	manifest := authority.TrustManifestPayload{Schema: "bloom.authority.trust-manifest", SchemaVersion: "1.0", ManifestID: "fixture-manifest", Issuer: "fixture-issuer",
		OrganizationID: organizationID, ManifestVersion: "1", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour), RootKeyID: "development-rfc8032-root",
		Keys: []authority.TrustKey{{KeyID: identity.InstallationID, PublicKey: base64.RawURLEncoding.EncodeToString(identity.PublicKey), Status: "active", ValidFrom: now.Add(-time.Hour)}}}
	manifestRaw := signINGMaterializationTestEnvelope(t, manifest, "development-rfc8032-root", rootPrivate, "BLOOM-AUTHORITY-TRUST-MANIFEST-v1")
	for _, operation := range []string{"approve", "activate"} {
		challenge := "fixture-challenge-" + operation
		challengeSum := sha256.Sum256([]byte(challenge))
		attestation := authority.ActorAttestation{Schema: "bloom.authority.actor-attestation", SchemaVersion: "1.2", AttestationID: "fixture-attestation-" + operation, Issuer: "fixture-issuer",
			OrganizationID: organizationID, InstallationID: identity.InstallationID, PrincipalID: "00000000-0000-4000-8000-000000000308", ActorPublicKey: actorPublicText,
			Audience: "bloom.authority.mandate-consent", ChallengeDigest: base64.RawURLEncoding.EncodeToString(challengeSum[:]), IssuedAt: now.Add(-time.Second), ExpiresAt: now.Add(time.Hour),
			Operation: operation, MandateID: contract.MandateID, ContractDigest: contractDigest}
		attestationRaw := signINGMaterializationTestEnvelope(t, attestation, identity.InstallationID, identity.PrivateKey, "BLOOM-AUTHORITY-ACTOR-ATTESTATION-v1")
		permission := "mandate.sign"
		if operation == "activate" {
			permission = "mandate.install"
		}
		decision := authority.AuthorityDecision{Outcome: authority.DecisionAllow, Reason: "permission_granted", Operation: permission, PrincipalID: attestation.PrincipalID,
			Scope: authority.Scope{Type: "project", ID: contract.ProjectID}, AuthorityVersion: "1", EvaluatedAt: now, ControlRevisions: []string{}}
		receipt, signErr := mandatecontract.SignActReceipt(mandatecontract.ActReceipt{Operation: operation, MandateID: contract.MandateID, ContractDigest: contractDigest, Contract: contract,
			OrganizationID: organizationID, Attestation: attestationRaw, Manifest: manifestRaw, ActorChallenge: challenge, ActorPublicKey: actorPublicText, Decision: decision, RecordedAt: now}, identity)
		if signErr != nil {
			t.Fatal(signErr)
		}
		if saveErr := mandatecontract.SaveActReceipt(mandateDir, receipt); saveErr != nil {
			t.Fatal(saveErr)
		}
	}
	return manifestRaw
}

func signINGMaterializationTestEnvelope(t *testing.T, payload any, keyID string, privateKey ed25519.PrivateKey, domain string) []byte {
	t.Helper()
	payloadRaw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	canonical, err := authority.Canonicalize(payloadRaw)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(canonical)
	signature := ed25519.Sign(privateKey, append(append([]byte(domain), 0), canonical...))
	envelope := authority.Envelope{Payload: payloadRaw, Integrity: authority.Integrity{Canonicalization: "JCS-RFC8785", DigestAlgorithm: "SHA-256",
		Digest: base64.RawURLEncoding.EncodeToString(digest[:]), SignatureAlgorithm: "Ed25519", KeyID: keyID, Signature: base64.RawURLEncoding.EncodeToString(signature)}}
	raw, err := json.Marshal(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func TestIndependentDOCAfterINGFailsClosedWithoutOrWithAlteredReceipt(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(string)
	}{
		{name: "missing", mutate: func(path string) { _ = os.Remove(path) }},
		{name: "altered", mutate: func(path string) { _ = os.WriteFile(path, []byte(`{"altered":true}`), 0600) }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			docActivity, input, _, receipt := prepareINGDOCFixture(t)
			tc.mutate(filepath.Join(input.MandatesRoot, input.MandateID, "evidence", "gene-materialization.json"))
			calls := 0
			docActivity.VerifyINGMaterialization = func(_ string, _ string, _ gene.INGMaterializationBinding) (gene.INGMaterializationReceipt, error) {
				return receipt, nil
			}
			docActivity.RunBrain = func(string, []string) ([]byte, []byte, int, error) { calls++; return nil, nil, 0, nil }
			if _, err := docActivity.RunAfterING(context.Background(), input); err == nil {
				t.Fatal("invalid or missing G2 receipt opened ING DOC gate")
			}
			if calls != 0 {
				t.Fatalf("Brain called %d times with invalid G2 receipt", calls)
			}
		})
	}
}

func TestUniqueSignedActionFindsDISWithoutPositionDependency(t *testing.T) {
	actions := []mandatecontract.Action{{ActionID: "ing", IntentType: "ing"}, {ActionID: "doc-ing", IntentType: "doc"}, {ActionID: "dis", IntentType: "dis"}}
	action, index, err := uniqueSignedAction(actions, "dis")
	if err != nil || action.ActionID != "dis" || index != 2 {
		t.Fatalf("moved DIS was not resolved: action=%#v index=%d err=%v", action, index, err)
	}
}

func TestIndependentDOCDoesNotCallBrainBeforePersistedDISGate(t *testing.T) {
	activity, input, _, _ := prepareDISTerminalFixture(t)
	calls := 0
	docActivity := &MandateDOCActivity{IdentityPath: activity.IdentityPath, BrainPath: "brain", RunBrain: func(_ string, _ []string) ([]byte, []byte, int, error) {
		calls++
		return nil, nil, 0, nil
	}}
	if _, err := docActivity.RunAfterDIS(context.Background(), input); err == nil {
		t.Fatal("DOC dispatch accepted before DIS gate")
	}
	if calls != 0 {
		t.Fatalf("Brain was called %d times before DIS gate", calls)
	}
}

func TestPreparedDOCSourceMustStillMatchSignedInput(t *testing.T) {
	activity, input, _, writeTerminal := prepareDISTerminalFixture(t)
	nucleusRoot := filepath.Dir(input.MandatesRoot)
	projectRoot := filepath.Join(nucleusRoot, "project")
	if err := os.MkdirAll(filepath.Join(nucleusRoot, ".core"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(projectRoot, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(projectRoot, "input.md"), []byte("changed"), 0600); err != nil {
		t.Fatal(err)
	}
	catalog, _ := json.Marshal(map[string]interface{}{"projects": []map[string]interface{}{{"id": "project", "absolutePath": projectRoot}}})
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".core", ".nucleus-config.json"), catalog, 0600); err != nil {
		t.Fatal(err)
	}
	writeTerminal(true)
	terminal, err := activity.ObserveDISTerminal(context.Background(), input)
	if err != nil {
		t.Fatal(err)
	}
	statePath := filepath.Join(input.MandatesRoot, input.MandateID, "mandate_state.json")
	var state map[string]interface{}
	raw, _ := os.ReadFile(statePath)
	_ = json.Unmarshal(raw, &state)
	state["projectId"], state["currentAction"] = "project", terminal.ActionID
	state["preparation"] = map[string]interface{}{"contractDigest": terminal.ContractDigest, "sourceFiles": []string{"input.md"}}
	disRecord := state["actions"].(map[string]interface{})[terminal.ActionID].(map[string]interface{})
	disRecord["ingIntentId"], disRecord["ingResultRef"], disRecord["ingResultSha256"] = "ing-intent", "ing-result.json", "ing-digest"
	raw, _ = json.Marshal(state)
	_ = os.WriteFile(statePath, raw, 0600)
	if _, err := PersistAdoptedDISCompletionActivity(context.Background(), terminal, input.MandatesRoot); err != nil {
		t.Fatal(err)
	}
	calls := 0
	docActivity := &MandateDOCActivity{IdentityPath: activity.IdentityPath, BrainPath: "brain", RunBrain: func(_ string, _ []string) ([]byte, []byte, int, error) {
		calls++
		return nil, nil, 0, nil
	}}
	if _, err := docActivity.RunAfterDIS(context.Background(), input); err == nil || !strings.Contains(err.Error(), "changed since the signed preparation") {
		t.Fatalf("changed prepared source was accepted: %v", err)
	}
	if calls != 0 {
		t.Fatalf("Brain was called %d times with changed prepared source", calls)
	}
}

func prepareINGDOCFixture(t *testing.T) (*MandateDOCActivity, MandateIntentInput, string, gene.INGMaterializationReceipt) {
	t.Helper()
	activity, input, _, _ := prepareDISTerminalFixture(t)
	mandateDir := filepath.Join(input.MandatesRoot, input.MandateID)
	envelope, err := mandatecontract.LoadVerified(mandateDir, activity.IdentityPath)
	if err != nil {
		t.Fatal(err)
	}
	no := false
	actions := make([]mandatecontract.Action, 8)
	for i, intentType := range []string{"ing", "doc", "dis", "doc", "exp", "dev", "doc", "exp"} {
		ids := []string{"ing-1", "doc-after-ing-1", "dis-2", "doc-after-dis-2", "exp-4", "dev-5", "doc-after-dev-5", "exp-6"}
		actions[i] = mandatecontract.Action{ActionID: ids[i], Type: "run_intent", IntentType: intentType, IdempotencyKey: "key-" + ids[i], RequiresIntelligence: &no}
		if i > 0 {
			actions[i].DependsOn = []string{actions[i-1].ActionID}
		}
	}
	actions[5].WhenResult = "remediation_required"
	projectID := "11111111-1111-4111-8111-111111111111"
	envelope.Contract.ProjectID, envelope.Contract.Actions = projectID, actions
	identityRaw, err := os.ReadFile(activity.IdentityPath)
	if err != nil {
		t.Fatal(err)
	}
	var encodedIdentity map[string]string
	if json.Unmarshal(identityRaw, &encodedIdentity) != nil {
		t.Fatal("invalid fixture identity")
	}
	publicKey, _ := base64.StdEncoding.DecodeString(encodedIdentity["public_key"])
	privateKey, _ := base64.StdEncoding.DecodeString(encodedIdentity["private_key"])
	identity := &authority.LocalIdentity{InstallationID: encodedIdentity["installation_id"], PublicKey: ed25519.PublicKey(publicKey), PrivateKey: ed25519.PrivateKey(privateKey)}
	signed, err := mandatecontract.Sign(envelope.Contract, identity)
	if err != nil {
		t.Fatal(err)
	}
	signedRaw, _ := json.Marshal(signed)
	if err = os.WriteFile(filepath.Join(mandateDir, "mandate.json"), signedRaw, 0600); err != nil {
		t.Fatal(err)
	}
	nucleusRoot := filepath.Dir(input.MandatesRoot)
	projectRoot := filepath.Join(nucleusRoot, "project-ing")
	if err = os.MkdirAll(filepath.Join(nucleusRoot, ".core"), 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.MkdirAll(projectRoot, 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(projectRoot, "input.md"), nil, 0600); err != nil {
		t.Fatal(err)
	}
	catalog, _ := json.Marshal(map[string]interface{}{"projects": []map[string]interface{}{{"id": projectID, "absolutePath": projectRoot}}})
	if err = os.WriteFile(filepath.Join(nucleusRoot, ".core", ".nucleus-config.json"), catalog, 0600); err != nil {
		t.Fatal(err)
	}
	digest := strings.Repeat("a", 64)
	binding := gene.INGMaterializationBinding{ProjectID: projectID, GeneID: "33333333-3333-4333-8333-333333333333", ContributionID: "44444444-4444-4444-8444-444444444444",
		MandateID: input.MandateID, ContractDigest: signed.ContractDigest, INGActionID: "ing-1", IntentID: "ing-intent", DecisionID: "decision-1",
		DecisionDigest: strings.Repeat("b", 64), HumanDecision: "approved", INGResultDigest: strings.Repeat("c", 64), INGLedgerDigest: strings.Repeat("d", 64)}
	receipt := gene.INGMaterializationReceipt{SchemaVersion: gene.INGMaterializationReceiptSchema, Binding: binding, ReceiptDigest: "sha256:" + digest}
	evidenceDir := filepath.Join(mandateDir, "evidence")
	if err = os.MkdirAll(evidenceDir, 0700); err != nil {
		t.Fatal(err)
	}
	receiptPath := filepath.Join(evidenceDir, "gene-materialization.json")
	receiptRaw, _ := json.Marshal(receipt)
	if err = os.WriteFile(receiptPath, receiptRaw, 0600); err != nil {
		t.Fatal(err)
	}
	state := map[string]interface{}{"mandateId": input.MandateID, "projectId": projectID, "stateVersion": 1, "status": "in_progress", "currentAction": "doc-after-ing-1",
		"adoption":    map[string]interface{}{"contractDigest": signed.ContractDigest},
		"preparation": map[string]interface{}{"contractDigest": signed.ContractDigest, "sourceFiles": []string{"input.md"}},
		"actions": map[string]interface{}{"ing-1": map[string]interface{}{"intentId": "ing-intent", "status": "completed", "resultRef": "ing-result.json", "resultSha256": binding.INGResultDigest,
			"ledgerRef": "ledger.json", "ledgerSha256": binding.INGLedgerDigest, "decisionDigest": binding.DecisionDigest,
			"geneMaterializationReceiptRef": receiptPath, "geneMaterializationReceiptDigest": receipt.ReceiptDigest},
			"doc-after-ing-1": map[string]interface{}{"status": "pending", "dependsOn": "ing-1"}}}
	stateRaw, _ := json.Marshal(state)
	statePath := filepath.Join(mandateDir, "mandate_state.json")
	if err = os.WriteFile(statePath, stateRaw, 0600); err != nil {
		t.Fatal(err)
	}
	return &MandateDOCActivity{IdentityPath: activity.IdentityPath, BrainPath: "brain"}, input, statePath, receipt
}

func prepareDISTerminalFixture(t *testing.T) (*MandateIntentActivity, MandateIntentInput, string, func(bool)) {
	t.Helper()
	base := t.TempDir()
	mandates := filepath.Join(base, ".mandates")
	mandateID := "mandate-1"
	mandateDir := filepath.Join(mandates, mandateID)
	intentRoot := filepath.Join(base, ".intents", ".dis", "dis-intent")
	if err := os.MkdirAll(mandateDir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(intentRoot, 0700); err != nil {
		t.Fatal(err)
	}
	policyRef, registryRef := filepath.Join(base, "policy.json"), filepath.Join(base, "registry.json")
	for _, ref := range []string{policyRef, registryRef} {
		if err := os.WriteFile(ref, []byte(`{}`), 0600); err != nil {
			t.Fatal(err)
		}
	}
	emptySum := sha256.Sum256([]byte(`{}`))
	emptyFileSum := sha256.Sum256(nil)
	digest := hex.EncodeToString(emptySum[:])
	no := false
	actions := make([]mandatecontract.Action, 6)
	for i, intentType := range []string{"ing", "dis", "doc", "exp", "dev", "exp"} {
		actions[i] = mandatecontract.Action{ActionID: string(rune('a' + i)), Type: "run_intent", IntentType: intentType, IdempotencyKey: string(rune('a' + i)), RequiresIntelligence: &no}
		if i > 0 {
			actions[i].DependsOn = []string{actions[i-1].ActionID}
		}
	}
	actions[4].WhenResult = "remediation_required"
	contract := mandatecontract.Contract{
		MandateID: mandateID, ContractVersion: 4, OrganizationID: "org", ProjectID: "project", ProjectBinding: "binding", Objective: "objective",
		Domain: mandatecontract.Domain{ID: "domain", Name: "Domain"}, Actions: actions,
		Intelligence: &mandatecontract.Intelligence{PolicyRef: policyRef, PolicyVersion: "v1", PolicySHA256: digest, RegistryRef: registryRef, RegistrySHA256: digest, MaxTotalTokens: 1, MaxOutputTokens: 1},
		Inputs:       []mandatecontract.Input{{Ref: "inputs/input.md", SHA256: hex.EncodeToString(emptyFileSum[:]), Size: 0}},
		Fulfillment:  mandatecontract.Fulfillment{Evaluator: "exp-ready", EvaluatorVersion: "1", RequiredFields: []string{"ing", "dis", "doc", "exp"}},
	}
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	identityPath := filepath.Join(base, "identity.json")
	identityRaw, _ := json.Marshal(map[string]string{"installation_id": "installation", "public_key": base64.StdEncoding.EncodeToString(public), "private_key": base64.StdEncoding.EncodeToString(private)})
	if err := os.WriteFile(identityPath, identityRaw, 0600); err != nil {
		t.Fatal(err)
	}
	envelope, err := mandatecontract.Sign(contract, &authority.LocalIdentity{InstallationID: "installation", PublicKey: public, PrivateKey: private})
	if err != nil {
		t.Fatal(err)
	}
	envelopeRaw, _ := json.Marshal(envelope)
	if err := os.WriteFile(filepath.Join(mandateDir, "mandate.json"), envelopeRaw, 0600); err != nil {
		t.Fatal(err)
	}
	proposalRef := filepath.Join(intentRoot, "mapping_proposal.json")
	proposal := []byte(`{"proposal":true}`)
	if err := os.WriteFile(proposalRef, proposal, 0600); err != nil {
		t.Fatal(err)
	}
	proposalSum := sha256.Sum256(proposal)
	journal, _ := json.Marshal(map[string]interface{}{
		"mandateId": mandateID, "adoption": map[string]interface{}{"contractDigest": envelope.ContractDigest},
		"actions": map[string]interface{}{"b": map[string]interface{}{"intentId": "dis-intent", "status": "awaiting_human_decision", "proposalRef": proposalRef, "proposalSha256": hex.EncodeToString(proposalSum[:])}},
	})
	if err := os.WriteFile(filepath.Join(mandateDir, "mandate_state.json"), journal, 0600); err != nil {
		t.Fatal(err)
	}
	writeState := func(phase string) {
		state, _ := json.Marshal(map[string]string{"intent_id": "dis-intent", "mandate_id": mandateID, "intent_type": "dis", "phase_active": phase})
		if err := os.WriteFile(filepath.Join(intentRoot, ".dis_state.json"), state, 0600); err != nil {
			t.Fatal(err)
		}
	}
	writeState("ratification")
	writeTerminal := func(committed bool) {
		writeState("done")
		turnDir := filepath.Join(intentRoot, ".ratification", ".turn_1")
		if err := os.MkdirAll(turnDir, 0700); err != nil {
			t.Fatal(err)
		}
		identity := map[string]interface{}{"intent_id": "dis-intent", "intent_type": "dis", "stage": "ratification", "turn_id": "1"}
		identityDigest, _ := pythonJSONDigest(identity)
		effectsPayload := []interface{}{map[string]interface{}{"operation": "replace", "path": "domain"}}
		payloadDigest, _ := pythonJSONDigest(effectsPayload)
		evidence := map[string]interface{}{"verified_ref": "graph.json", "verified_digest": digest}
		canonicalEvidence, _ := pythonCanonicalJSON(evidence)
		evidenceSum := sha256.Sum256(canonicalEvidence)
		firstIdentity := map[string]interface{}{"intent_id": "dis-intent", "intent_type": "dis", "stage": "ratification", "turn_id": "1", "obligation": "domain_graph_operation_applied"}
		secondIdentity := map[string]interface{}{"intent_id": "dis-intent", "intent_type": "dis", "stage": "ratification", "turn_id": "1", "obligation": "domain_graph_delta_materialized"}
		firstDigest, _ := pythonJSONDigest(firstIdentity)
		secondDigest, _ := pythonJSONDigest(secondIdentity)
		effects := []map[string]interface{}{
			{"effect_id": firstDigest[:24], "obligation": "domain_graph_operation_applied", "status": "applied", "payload_digest": payloadDigest, "applied_at": "2026-11-11T00:00:00Z", "verification": map[string]interface{}{"verified": true, "checked_at": "2026-11-11T00:00:00Z", "evidence": evidence, "evidence_digest": hex.EncodeToString(evidenceSum[:])}},
			{"effect_id": secondDigest[:24], "obligation": "domain_graph_delta_materialized", "status": "applied", "payload_digest": payloadDigest, "applied_at": "2026-11-11T00:00:00Z", "verification": map[string]interface{}{"verified": true, "checked_at": "2026-11-11T00:00:00Z", "evidence": evidence, "evidence_digest": hex.EncodeToString(evidenceSum[:])}},
		}
		canonicalEffects, _ := pythonCanonicalJSON(effects)
		effectsSum := sha256.Sum256(canonicalEffects)
		effectsDigest := hex.EncodeToString(effectsSum[:])
		ledger, _ := json.Marshal(map[string]interface{}{"schema_version": "1.0", "ledger_id": identityDigest[:32], "identity": identity, "state": "state_advanced", "state_advanced": true, "effects_payload": effectsPayload, "effects_digest": effectsDigest, "effects": effects})
		if err := os.WriteFile(filepath.Join(turnDir, ".effect_ledger.json"), ledger, 0600); err != nil {
			t.Fatal(err)
		}
		control, _ := json.Marshal(map[string]interface{}{"turn": "1", "committed": committed, "ledger_ref": ".effect_ledger.json", "effects_digest": effectsDigest})
		if err := os.WriteFile(filepath.Join(turnDir, ".ratification.json"), control, 0600); err != nil {
			t.Fatal(err)
		}
	}
	return &MandateIntentActivity{IdentityPath: identityPath}, MandateIntentInput{MandatesRoot: mandates, MandateID: mandateID}, intentRoot, writeTerminal
}

func TestAdoptedINGRejectsInvalidEvidenceWithoutUpdatingJournal(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "mandate-1")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	journal := []byte(`{"mandateId":"mandate-1","stateVersion":1,"adoption":{"contractDigest":"contract-1"},"actions":{}}`)
	path := filepath.Join(dir, "mandate_state.json")
	if err := os.WriteFile(path, journal, 0600); err != nil {
		t.Fatal(err)
	}
	evidence := filepath.Join(dir, "classification.json")
	if err := os.WriteFile(evidence, []byte(`{"valid":true}`), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := PersistAdoptedINGResultActivity(context.Background(), MandateIntentResult{
		MandateID: "mandate-1", ActionID: "action-1", ContractDigest: "contract-1", IntentID: "intent-1",
		EvidenceRef: evidence, EvidenceDigest: "wrong", Status: "awaiting_human_decision",
	}, root)
	if err == nil {
		t.Fatal("invalid evidence accepted")
	}
	after, err := os.ReadFile(path)
	if err != nil || string(after) != string(journal) {
		t.Fatalf("journal changed on invalid evidence: %v", err)
	}
}

func TestAdoptedINGReconcilesExistingIntentWithoutCreatingAnother(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, ".intents", ".ing", ".project-existing")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	state, _ := json.Marshal(map[string]string{"mandate_id": "mandate-1", "intent_id": "intent-1"})
	if err := os.WriteFile(filepath.Join(dir, ".ing_state.json"), state, 0600); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		foundDir, foundID, err := findAdoptedING(root, "mandate-1")
		if err != nil || foundDir != dir || foundID != "intent-1" {
			t.Fatalf("retry %d: dir=%s id=%s err=%v", i, foundDir, foundID, err)
		}
	}
	other := filepath.Join(root, ".intents", ".ing", ".project-duplicate")
	if err := os.MkdirAll(other, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(other, ".ing_state.json"), state, 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := findAdoptedING(root, "mandate-1"); err == nil {
		t.Fatal("duplicate Intent accepted")
	}
}

func TestAdoptedDISReconcilesOneIntentAndRejectsDuplicates(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, ".intents", ".dis", ".project-existing")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	state := []byte(`{"mandate_id":"mandate-1","intent_id":"dis-intent"}`)
	if err := os.WriteFile(filepath.Join(dir, ".dis_state.json"), state, 0600); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		foundRoot, foundID, err := findAdoptedDIS(root, "mandate-1")
		if err != nil || foundRoot != dir || foundID != "dis-intent" {
			t.Fatalf("DIS retry: %s %s %v", foundRoot, foundID, err)
		}
	}
	other := filepath.Join(root, ".intents", ".dis", ".project-duplicate")
	if err := os.MkdirAll(other, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(other, ".dis_state.json"), state, 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := findAdoptedDIS(root, "mandate-1"); err == nil {
		t.Fatal("duplicate DIS Intent accepted")
	}
}

func TestVerifyINGEffectLedgerRequiresFinalAdvancedState(t *testing.T) {
	ledger := map[string]any{
		"state":             "state_advanced",
		"state_advanced":    true,
		"closure_semantics": "logical_contributions",
		"identity": map[string]any{
			"intent_id": "intent-1", "intent_type": "ing", "stage": "consolidation",
		},
		"effects": []any{
			map[string]any{"status": "applied"},
			map[string]any{"status": "applied"},
			map[string]any{"status": "applied"},
		},
	}
	encode := func() ([]byte, map[string]any) {
		t.Helper()
		content, err := json.Marshal(ledger)
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(content)
		return content, map[string]any{"effect_ledger_digest": "sha256:" + hex.EncodeToString(sum[:])}
	}
	content, result := encode()
	if err := verifyINGEffectLedger(content, result, "intent-1"); err != nil {
		t.Fatalf("final Brain ledger rejected: %v", err)
	}
	ledger["state"] = "applied"
	content, result = encode()
	if err := verifyINGEffectLedger(content, result, "intent-1"); err == nil {
		t.Fatal("ledger before final state was accepted")
	}
	ledger["state"] = "state_advanced"
	ledger["state_advanced"] = false
	content, result = encode()
	if err := verifyINGEffectLedger(content, result, "intent-1"); err == nil {
		t.Fatal("ledger without state advancement was accepted")
	}
}
