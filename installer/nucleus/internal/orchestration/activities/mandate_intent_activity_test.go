package activities

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

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
