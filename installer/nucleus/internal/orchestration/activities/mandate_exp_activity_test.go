package activities

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"nucleus/internal/gene"
	"nucleus/internal/orchestration/mandatecontract"
)

func TestMandateEXPActivityVerifiesSignedEvidenceAndResult(t *testing.T) {
	docActivity, input, statePath, _ := prepareINGDOCFixture(t)
	mandateDir := filepath.Join(input.MandatesRoot, input.MandateID)
	envelope, err := mandatecontract.LoadVerified(mandateDir, docActivity.IdentityPath)
	if err != nil {
		t.Fatal(err)
	}
	nucleusRoot := filepath.Dir(input.MandatesRoot)
	projectPath := filepath.Join(nucleusRoot, "project-ing")

	decisionItems := []map[string]string{{"cluster_id": "core-logic-and-testing", "human_decision": "approved"}}
	decisionDigest, err := canonicalDecisionDigest(decisionItems)
	if err != nil {
		t.Fatal(err)
	}
	ledger := map[string]any{"state": "state_advanced", "state_advanced": true, "closure_semantics": "logical_contributions",
		"identity": map[string]any{"intent_id": "ing-intent", "intent_type": "ing", "stage": "consolidation"},
		"effects":  []any{map[string]any{"status": "applied"}, map[string]any{"status": "applied"}, map[string]any{"status": "applied"}}}
	ledgerRaw, _ := json.Marshal(ledger)
	ledgerCanonical, err := pythonCanonicalJSON(ledger)
	if err != nil {
		t.Fatal(err)
	}
	ledgerCanonicalSum := sha256.Sum256(ledgerCanonical)
	ledgerSum := sha256.Sum256(ledgerRaw)
	result := acceptedINGResult{SchemaVersion: "bloom.ing-result/v1", Status: "done", MandateID: input.MandateID, IntentID: "ing-intent",
		AcceptedContributions: []acceptedINGContribution{{ClusterID: "core-logic-and-testing", ContributionID: "44444444-4444-4444-8444-444444444444",
			DecisionID: "decision-1", GeneID: "33333333-3333-4333-8333-333333333333", HumanDecision: "approved", ProjectID: envelope.Contract.ProjectID,
			Contribution: gene.Contribution{SchemaVersion: gene.SchemaVersion, ContributionID: "44444444-4444-4444-8444-444444444444", GeneID: "33333333-3333-4333-8333-333333333333",
				ProjectID: envelope.Contract.ProjectID, MandateID: input.MandateID, IntentID: "ing-intent", Ratification: gene.RatificationEvidence{DecisionID: "decision-1"}},
			Identity: gene.Identity{SchemaVersion: gene.SchemaVersion, ProjectID: envelope.Contract.ProjectID, GeneID: "33333333-3333-4333-8333-333333333333"}}},
		RejectedClusters: []json.RawMessage{}}
	resultRaw, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	var resultEnvelope map[string]any
	if err = json.Unmarshal(resultRaw, &resultEnvelope); err != nil {
		t.Fatal(err)
	}
	resultEnvelope["effect_ledger_digest"] = "sha256:" + hex.EncodeToString(ledgerCanonicalSum[:])
	resultRaw, err = json.Marshal(resultEnvelope)
	if err != nil {
		t.Fatal(err)
	}
	resultSum := sha256.Sum256(resultRaw)
	ingResultPath := filepath.Join(nucleusRoot, ".intents", ".ing", "fixture-ing", "ing_result.json")
	ledgerPath := filepath.Join(nucleusRoot, ".intents", ".ing", "fixture-ing", ".consolidation", ".turn_1", ".effect_ledger.json")
	if err = os.MkdirAll(filepath.Dir(ingResultPath), 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.MkdirAll(filepath.Dir(ledgerPath), 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(ingResultPath, resultRaw, 0600); err != nil {
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
		t.Fatal("invalid mandate state fixture")
	}
	actions := state["actions"].(map[string]any)
	ingAction := actions["ing-1"].(map[string]any)
	ingAction["resultRef"], ingAction["resultSha256"] = ingResultPath, hex.EncodeToString(resultSum[:])
	ingAction["ledgerRef"], ingAction["ledgerSha256"] = ledgerPath, hex.EncodeToString(ledgerSum[:])
	ingAction["decisionDigest"] = decisionDigest
	state["ingDecision"] = map[string]any{"actionId": "ing-1", "contractDigest": envelope.ContractDigest, "intentId": "ing-intent",
		"decisionDigest": decisionDigest, "decisions": decisionItems}
	stateRaw, err = json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(statePath, stateRaw, 0600); err != nil {
		t.Fatal(err)
	}

	stateAction := struct {
		IntentID              string `json:"intentId"`
		Status                string `json:"status"`
		ResultRef             string `json:"resultRef"`
		ResultSHA             string `json:"resultSha256"`
		LedgerRef             string `json:"ledgerRef"`
		LedgerSHA             string `json:"ledgerSha256"`
		DecisionDigest        string `json:"decisionDigest"`
		MaterializationRef    string `json:"geneMaterializationReceiptRef"`
		MaterializationDigest string `json:"geneMaterializationReceiptDigest"`
	}{IntentID: "ing-intent", Status: "completed", ResultRef: ingResultPath, ResultSHA: hex.EncodeToString(resultSum[:]),
		LedgerRef: ledgerPath, LedgerSHA: hex.EncodeToString(ledgerSum[:]), DecisionDigest: decisionDigest}
	expected, err := expectedINGMaterializationBatchBinding(mandateDir, envelope.Contract, envelope.ContractDigest, "ing-1", "ing-intent", decisionDigest,
		stateAction.ResultSHA, stateAction.LedgerSHA, ingResultPath, stateAction)
	if err != nil {
		t.Fatal(err)
	}
	receipt := gene.INGMaterializationBatchReceipt{SchemaVersion: gene.INGMaterializationBatchReceiptSchema, Binding: expected,
		ReceiptDigest: "sha256:" + strings.Repeat("a", 64)}
	receiptPath := filepath.Join(mandateDir, "evidence", "gene-materialization.json")
	receiptRaw, _ := json.Marshal(receipt)
	if err = os.WriteFile(receiptPath, receiptRaw, 0600); err != nil {
		t.Fatal(err)
	}
	ingAction["geneMaterializationReceiptRef"], ingAction["geneMaterializationReceiptDigest"] = receiptPath, receipt.ReceiptDigest

	docFolder := ".fixture-doc-after-dis"
	docContractPath := filepath.Join(projectPath, ".bloom", ".intents", ".doc", docFolder,
		".pipeline", ".context", ".response", ".staging", ".doc_contract.json")
	if err = os.MkdirAll(filepath.Dir(docContractPath), 0700); err != nil {
		t.Fatal(err)
	}
	docContractRaw := []byte(`{"schema":"bloom.doc-contract/v1","documents":[]}`)
	if err = os.WriteFile(docContractPath, docContractRaw, 0600); err != nil {
		t.Fatal(err)
	}
	docContractSHA := "sha256:" + func() string { sum := sha256.Sum256(docContractRaw); return hex.EncodeToString(sum[:]) }()
	docAction := map[string]any{"status": "completed", "dependsOn": "dis-2", "intentId": "doc-after-dis-intent",
		"folderName": docFolder, "contractSha256": docContractSHA, "runSha256": "sha256:" + strings.Repeat("b", 64)}
	actions["doc-after-dis-2"] = docAction
	state["docAfterDIS"] = map[string]any{"actionId": "doc-after-dis-2", "status": "completed", "completed": true,
		"nextAction": "none", "intentId": "doc-after-dis-intent", "folderName": docFolder, "contractSha256": docContractSHA}
	state["currentAction"] = "doc-after-dis-2"
	stateRaw, _ = json.Marshal(state)
	if err = os.WriteFile(statePath, stateRaw, 0600); err != nil {
		t.Fatal(err)
	}

	artifact := map[string]any{"schema_version": expResultSchema, "mandate_id": input.MandateID, "action_id": "exp-4", "status": "ready",
		"findings": []any{}, "evidence": map[string]expEvidenceItem{}, "checks": []any{map[string]any{"name": "unit_tests", "outcome": "passed"}}, "result_digest": ""}
	artifactEvidence := map[string]expEvidenceItem{"ing": {Ref: ingResultPath, SHA256: "sha256:" + hex.EncodeToString(resultSum[:])},
		"dis": {Ref: filepath.Join(nucleusRoot, ".intents", ".dis", "fixture-dis", ".ratification", ".turn_1", ".ratification.json"), SHA256: ""},
		"doc": {Ref: docContractPath, SHA256: docContractSHA}}
	disPath := artifactEvidence["dis"].Ref
	if err = os.MkdirAll(filepath.Dir(disPath), 0700); err != nil {
		t.Fatal(err)
	}
	disRaw := []byte(`{"turn":"1","committed":true}`)
	if err = os.WriteFile(disPath, disRaw, 0600); err != nil {
		t.Fatal(err)
	}
	disSum := sha256.Sum256(disRaw)
	disSHA := hex.EncodeToString(disSum[:])
	artifactEvidence["dis"] = expEvidenceItem{Ref: disPath, SHA256: "sha256:" + disSHA}
	disAction, _ := actions["dis-2"].(map[string]any)
	if disAction == nil {
		disAction = map[string]any{}
		actions["dis-2"] = disAction
	}
	disAction["status"], disAction["intentId"], disAction["ratificationRef"], disAction["ratificationSha256"] = "completed", "dis-intent", disPath, disSHA
	stateRaw, err = json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(statePath, stateRaw, 0600); err != nil {
		t.Fatal(err)
	}
	artifact["evidence"] = artifactEvidence
	artifactNoDigest, _ := json.Marshal(artifact)
	artifact["result_digest"] = digestEXPArtifact(artifactNoDigest)
	artifactRaw, _ := json.MarshalIndent(artifact, "", "  ")
	artifactRaw = append(artifactRaw, '\n')
	resultPath := filepath.Join(nucleusRoot, ".intents", ".exp", ".exp-4-mandate-1", "exp_result.json")
	if err = os.MkdirAll(filepath.Dir(resultPath), 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(resultPath, artifactRaw, 0600); err != nil {
		t.Fatal(err)
	}
	resultFileSum := sha256.Sum256(artifactRaw)
	resultFileSHA := "sha256:" + hex.EncodeToString(resultFileSum[:])

	verifiedBatch := false
	expActivity := &MandateEXPActivity{IdentityPath: docActivity.IdentityPath, BrainPath: "brain",
		VerifyINGMaterializationBatch: func(_ string, path string, binding gene.INGMaterializationBatchBinding) (gene.INGMaterializationBatchReceipt, error) {
			verifiedBatch = true
			if path != receiptPath || !equalDOCINGBatchBinding(binding, expected) {
				t.Fatalf("EXP verified unexpected G2 batch evidence: path=%s binding=%#v", path, binding)
			}
			return receipt, nil
		},
		RunBrain: func(_ string, args []string) ([]byte, []byte, int, error) {
			if len(args) < 5 || args[0] != "--json" || args[1] != "intent" || args[2] != "evaluate-exp" {
				t.Fatalf("unexpected EXP command: %#v", args)
			}
			out, _ := json.Marshal(map[string]any{"status": "success", "operation": "intent_evaluate_exp", "data": map[string]any{
				"status": "ready", "result_ref": filepath.ToSlash(filepath.Join(".intents", ".exp", ".exp-4-mandate-1", "exp_result.json")),
				"result_sha256": resultFileSHA, "findings": []any{}}})
			return out, nil, 0, nil
		}}
	got, err := expActivity.Run(context.Background(), MandateEXPInput{MandatesRoot: input.MandatesRoot, MandateID: input.MandateID})
	if err != nil {
		t.Fatalf("EXP activity failed: %v", err)
	}
	if !verifiedBatch || got.MandateID != input.MandateID || got.ActionID != "exp-4" || got.EvaluationStatus != "ready" ||
		got.ResultSHA256 != resultFileSHA || len(got.ConditionalSkipActions) != 3 {
		t.Fatalf("EXP activity returned incomplete result: batch=%v result=%#v", verifiedBatch, got)
	}
}

func TestPersistAdoptedEXPResultReadyClosesAndSkipsSignedBranch(t *testing.T) {
	result, root, statePath := expPersistenceFixture(t, "ready")
	out, err := PersistAdoptedEXPResultActivity(context.Background(), result, root)
	if err != nil {
		t.Fatal(err)
	}
	if out.StateVersion == 0 {
		t.Fatalf("EXP persistence did not advance state: %#v", out)
	}
	raw, _ := os.ReadFile(statePath)
	var state map[string]any
	_ = json.Unmarshal(raw, &state)
	actions := state["actions"].(map[string]any)
	if state["status"] != "completed" || state["fulfilled"] != true || state["currentAction"] != "exp-4" ||
		actions["exp-4"].(map[string]any)["evaluationStatus"] != "ready" {
		t.Fatalf("ready EXP did not fulfill Mandate: %s", raw)
	}
	for _, id := range []string{"dev-5", "doc-after-dev-5", "exp-6"} {
		skipped, ok := actions[id].(map[string]any)
		if !ok || skipped["status"] != "skipped" || skipped["skipReason"] != "whenResult_not_matched" {
			t.Fatalf("conditional Action %s was not skipped: %#v", id, actions[id])
		}
	}
	second, err := PersistAdoptedEXPResultActivity(context.Background(), result, root)
	if err != nil || second.StateVersion != out.StateVersion {
		t.Fatalf("EXP persistence is not idempotent: first=%#v second=%#v err=%v", out, second, err)
	}
}

func TestPersistAdoptedEXPRemediationLeavesDEVPendingAndUnfulfilled(t *testing.T) {
	result, root, statePath := expPersistenceFixture(t, "remediation_required")
	result.ConditionalActionID = "dev-5"
	if _, err := PersistAdoptedEXPResultActivity(context.Background(), result, root); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(statePath)
	var state map[string]any
	_ = json.Unmarshal(raw, &state)
	if state["status"] != "in_progress" || state["fulfilled"] == true || state["currentAction"] != "dev-5" {
		t.Fatalf("remediation-required EXP advanced or fulfilled the Mandate: %s", raw)
	}
	actions := state["actions"].(map[string]any)
	if _, exists := actions["dev-5"]; exists {
		t.Fatalf("persistence invented a DEV result: %#v", actions["dev-5"])
	}
}

func expPersistenceFixture(t *testing.T, status string) (MandateEXPResult, string, string) {
	t.Helper()
	base := t.TempDir()
	root := filepath.Join(base, ".nucleus-test")
	mandatesRoot := filepath.Join(root, ".mandates")
	mandateID := "mandate-exp-test"
	mandateDir := filepath.Join(mandatesRoot, mandateID)
	if err := os.MkdirAll(mandateDir, 0700); err != nil {
		t.Fatal(err)
	}
	contractDigest := strings.Repeat("a", 64)
	docSHA := "sha256:" + strings.Repeat("b", 64)
	skips := []MandateEXPConditionalAction{{ActionID: "dev-5", IntentType: "dev", DependsOn: "exp-4", WhenResult: "remediation_required"},
		{ActionID: "doc-after-dev-5", IntentType: "doc", DependsOn: "dev-5"}, {ActionID: "exp-6", IntentType: "exp", DependsOn: "doc-after-dev-5"}}
	conditionalID := ""
	if status == "remediation_required" {
		skips = nil
		conditionalID = "dev-5"
	}
	artifact := map[string]any{"schema_version": expResultSchema, "mandate_id": mandateID, "action_id": "exp-4", "status": status,
		"findings": []any{}, "evidence": map[string]any{}, "checks": []any{}, "result_digest": ""}
	artifact["result_digest"] = digestEXPArtifact(mustMarshalTest(t, artifact))
	artifactRaw := mustMarshalTest(t, artifact)
	resultRef := filepath.Join(root, ".intents", ".exp", "exp-4.json")
	if err := os.MkdirAll(filepath.Dir(resultRef), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(resultRef, artifactRaw, 0600); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(artifactRaw)
	resultSHA := "sha256:" + hex.EncodeToString(sum[:])
	state := map[string]any{"mandateId": mandateID, "projectId": "project-1", "status": "in_progress", "currentAction": "doc-after-dis-2",
		"adoption":    map[string]any{"contractDigest": contractDigest},
		"actions":     map[string]any{"doc-after-dis-2": map[string]any{"status": "completed", "contractSha256": docSHA}},
		"docAfterDIS": map[string]any{"actionId": "doc-after-dis-2", "status": "completed", "completed": true, "contractSha256": docSHA}}
	stateRaw := mustMarshalTest(t, state)
	statePath := filepath.Join(mandateDir, "mandate_state.json")
	if err := os.WriteFile(statePath, stateRaw, 0600); err != nil {
		t.Fatal(err)
	}
	return MandateEXPResult{MandateID: mandateID, ActionID: "exp-4", ContractDigest: contractDigest,
		DOCActionID: "doc-after-dis-2", DOCContractSHA256: docSHA, EvaluationStatus: status,
		ResultRef: resultRef, ResultSHA256: resultSHA, ConditionalActionID: conditionalID, ConditionalSkipActions: skips}, mandatesRoot, statePath
}

func mustMarshalTest(t *testing.T, value any) []byte {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}
