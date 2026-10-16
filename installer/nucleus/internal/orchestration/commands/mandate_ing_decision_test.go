package commands

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestMandateINGDecisionRequiresNucleusAuthority(t *testing.T) {
	if _, err := runMandateINGDecision(context.Background(), nil, "mandate-1", "decisions.json"); err == nil {
		t.Fatal("decision accepted without Nucleus context")
	}
}

func TestMandateINGDecisionJournalBindingReplayAndConflict(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mandate_state.json")
	fixture := []byte(`{"mandateId":"mandate-1","stateVersion":1,"adoption":{"contractDigest":"contract-1","digest":"delivery-1","version":"v1","organizationId":"org-1","installationId":"install-1"},"actions":{"ing-1":{"status":"awaiting_human_decision","intentId":"intent-1","evidenceSha256":"classification-1"}}}`)
	if err := os.WriteFile(path, fixture, 0600); err != nil {
		t.Fatal(err)
	}
	binding := ingDecisionBinding{MandateID: "mandate-1", ActionID: "ing-1", ContractDigest: "contract-1", DeliveryDigest: "delivery-1", OrganizationID: "org-1", InstallationID: "install-1", IntentID: "intent-1", ClassificationDigest: "classification-1"}
	record := map[string]any{"actionId": "ing-1", "decisionDigest": "decision-1", "decisions": []any{map[string]any{"cluster_id": "cluster-1", "human_decision": "approved"}}}
	for i := 0; i < 2; i++ {
		if err := persistINGDecision(path, binding, record); err != nil {
			t.Fatalf("replay %d: %v", i, err)
		}
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var journal map[string]any
	if json.Unmarshal(data, &journal) != nil || journal["stateVersion"] != float64(2) {
		t.Fatalf("idempotency lost: %s", data)
	}
	changed := map[string]any{"actionId": "ing-1", "decisionDigest": "different"}
	if err := persistINGDecision(path, binding, changed); err == nil {
		t.Fatal("conflicting decision accepted")
	}
	binding.ContractDigest = "other-contract"
	if err := persistINGDecision(path, binding, record); err == nil {
		t.Fatal("foreign contract accepted")
	}
}

func TestMandateINGDecisionCommandHelpAndJSONMetadata(t *testing.T) {
	cmd := createMandateCommand(nil)
	child, _, err := cmd.Find([]string{"ing-decision"})
	if err != nil || child == nil || child.Name() != "ing-decision" {
		t.Fatalf("ING decision command not registered: %v", err)
	}
	if child.Annotations["category"] != "MANDATES" || child.Long == "" || child.Example == "" {
		t.Fatal("ING decision help incomplete")
	}
	var sample map[string]any
	if json.Unmarshal([]byte(child.Annotations["json_response"]), &sample) != nil || sample["success"] != true {
		t.Fatal("ING decision JSON help invalid")
	}
	if child.Flags().Lookup("id") == nil || child.Flags().Lookup("decisions") == nil {
		t.Fatal("ING decision flags missing")
	}
}
