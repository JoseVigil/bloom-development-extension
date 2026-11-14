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

	"nucleus/internal/authority"
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
