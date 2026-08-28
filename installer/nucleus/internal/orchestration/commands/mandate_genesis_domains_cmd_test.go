package commands

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestMutateMandateStateValidateIsMonotonicAndIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "mandate_state.json")
	initial := map[string]interface{}{
		"stateVersion": 1,
		"signature":    map[string]interface{}{"status": "not_ready"},
		"phases":       map[string]interface{}{"validate": map[string]interface{}{"status": "pending"}},
	}
	raw, _ := json.Marshal(initial)
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	validate := validatePhaseJSON{Status: "pending"}
	validate.HumanSync.ConfirmedDomainIds = []string{"dom-1"}
	validate.HumanSync.ConfirmedAt = "2026-08-27T10:00:00Z"
	validate.HumanSync.ConfirmedBy = "tester"
	version, err := mutateMandateStateValidate(path, validate)
	if err != nil || version != 2 {
		t.Fatalf("first version=%d err=%v", version, err)
	}
	version, err = mutateMandateStateValidate(path, validate)
	if err != nil || version != 2 {
		t.Fatalf("retry version=%d err=%v", version, err)
	}
	var state map[string]interface{}
	raw, _ = os.ReadFile(path)
	_ = json.Unmarshal(raw, &state)
	if state["signature"].(map[string]interface{})["status"] != "not_ready" {
		t.Fatalf("foreign fields lost: %#v", state)
	}
}
