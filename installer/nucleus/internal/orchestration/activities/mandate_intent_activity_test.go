package activities

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
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
