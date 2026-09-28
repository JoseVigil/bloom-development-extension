package commands

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/cobra"
)

func TestBuildDomainsConfirmHasExactPublicPathAndDualHelpMetadata(t *testing.T) {
	root := &cobra.Command{Use: "nucleus"}
	mandate := &cobra.Command{Use: "mandate"}
	root.AddCommand(mandate)
	mandate.AddCommand(createBuildMandateSubcommand(nil))
	cmd, _, err := root.Find([]string{"mandate", "build", "domains", "confirm"})
	if err != nil || cmd == nil || cmd.CommandPath() != "nucleus mandate build domains confirm" {
		t.Fatalf("public path: cmd=%v err=%v", cmd, err)
	}
	if cmd.Short == "" || cmd.Long == "" || cmd.Example == "" || cmd.Flags().Lookup("id") == nil || cmd.Flags().Lookup("domain-id") == nil {
		t.Fatal("human help or flags missing")
	}
	var sample map[string]interface{}
	if err := json.Unmarshal([]byte(cmd.Annotations["json_response"]), &sample); err != nil || sample["mandateId"] == nil {
		t.Fatalf("JSON help invalid: %#v err=%v", sample, err)
	}
}

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
