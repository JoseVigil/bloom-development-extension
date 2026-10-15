package commands

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/cobra"

	"nucleus/internal/orchestration/activities"
	"nucleus/internal/orchestration/mandatecontract"
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
	if cmd.Short == "" || cmd.Long == "" || cmd.Example == "" || cmd.Flags().Lookup("id") == nil || cmd.Flags().Lookup("domain-id") == nil || cmd.Flags().Lookup("docs") == nil {
		t.Fatal("human help or flags missing")
	}
	var sample map[string]interface{}
	if err := json.Unmarshal([]byte(cmd.Annotations["json_response"]), &sample); err != nil || sample["mandateId"] == nil {
		t.Fatalf("JSON help invalid: %#v err=%v", sample, err)
	}
}

func TestDomainsConfirmCanProvisionMissingDocsOnceAndRetryIdentically(t *testing.T) {
	root := t.TempDir()
	mandateDir := filepath.Join(root, "mandate")
	if err := os.MkdirAll(mandateDir, 0755); err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(root, "project")
	if err := os.MkdirAll(source, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "README.md"), []byte("# Fixture\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "main.py"), []byte("print('ok')\n"), 0644); err != nil {
		t.Fatal(err)
	}

	docs, err := copyDocsInto(mandateDir, []string{source})
	if err != nil {
		t.Fatal(err)
	}
	validate := validatePhaseJSON{Status: "pending"}
	validate.HumanSync.ConfirmedDomainIds = []string{"dom-1"}
	files, err := mandatecontract.FreezeFiles(mandateDir, docs)
	if err != nil {
		t.Fatal(err)
	}
	validate.HumanSync.Files = files
	statePath := filepath.Join(mandateDir, "mandate_state.json")
	raw, _ := json.Marshal(map[string]interface{}{
		"stateVersion": 1,
		"docsProvided": []string{},
		"phases":       map[string]interface{}{"validate": map[string]interface{}{"status": "pending", "humanSync": map[string]interface{}{}}},
	})
	if err := os.WriteFile(statePath, raw, 0600); err != nil {
		t.Fatal(err)
	}
	version, err := mutateMandateStateDocsAndValidate(statePath, docs, validate)
	if err != nil || version != 2 {
		t.Fatalf("version=%d err=%v", version, err)
	}
	version, err = mutateMandateStateDocsAndValidate(statePath, docs, validate)
	if err != nil || version != 2 {
		t.Fatalf("idempotent version=%d err=%v", version, err)
	}
	if err := verifyExistingDocs(mandateDir, docs, []string{source}); err != nil {
		t.Fatalf("identical retry rejected: %v", err)
	}

	if err := os.WriteFile(filepath.Join(source, "README.md"), []byte("changed\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := verifyExistingDocs(mandateDir, docs, []string{source}); err == nil {
		t.Fatal("document substitution accepted")
	}
	replacement := append([]string(nil), docs...)
	replacement[0] = "other.md"
	if _, err := mutateMandateStateDocsAndValidate(statePath, replacement, validate); err == nil {
		t.Fatal("docsProvided substitution accepted")
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

// B1 (ida y vuelta real): estado inicial de `mandate build` → candidatos
// persistidos por el workflow → escritura de `domains confirm` →
// PersistHumanSyncActivity acepta la confirmación con la misma lista.
func TestConfirmRoundTripSatisfiesPersistHumanSync(t *testing.T) {
	root := t.TempDir()
	mandateID := "m-roundtrip"
	dir := filepath.Join(root, mandateID)
	if err := os.MkdirAll(filepath.Join(dir, "docs"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "docs", "vision.md"), []byte("# Vision\n"), 0644); err != nil {
		t.Fatal(err)
	}
	initial := initialBuildMandateState(mandateID, "genesis", "Core", "project-1", "cli", "", []string{"vision.md"}, "2026-10-10T00:00:00Z")
	raw, _ := json.Marshal(initial)
	path := filepath.Join(dir, "mandate_state.json")
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}

	candidates := []activities.DomainCandidateState{{DomainID: "dom_core_a3f1", Name: "Core", CohesionScore: 1, SuggestedActionCount: 1}}
	if _, err := activities.PersistCandidateDomainsActivity(activities.PersistCandidateDomainsInput{MandatesRoot: root, MandateID: mandateID, CandidateDomains: candidates}); err != nil {
		t.Fatal(err)
	}

	// Lo que leen `domains list` y `domains confirm`.
	raw, _ = os.ReadFile(path)
	var state mandateStateDoc
	if err := json.Unmarshal(raw, &state); err != nil {
		t.Fatal(err)
	}
	if len(state.Phases.Validate.HumanSync.CandidateDomains) != 1 || state.Phases.Validate.HumanSync.CandidateDomains[0].DomainID != "dom_core_a3f1" {
		t.Fatalf("candidates not visible to CLI: %#v", state.Phases.Validate.HumanSync)
	}

	// Misma escritura que `domains confirm`.
	files, err := mandatecontract.FreezeFiles(dir, state.DocsProvided)
	if err != nil {
		t.Fatal(err)
	}
	validate := state.Phases.Validate
	validate.HumanSync.ConfirmedDomainIds = []string{"dom_core_a3f1"}
	validate.HumanSync.ConfirmedAt = "2026-10-10T00:01:00Z"
	validate.HumanSync.Files = files
	if _, err := mutateMandateStateValidate(path, validate); err != nil {
		t.Fatal(err)
	}

	result, err := activities.PersistHumanSyncActivity(activities.PersistHumanSyncInput{
		MandatesRoot: root, MandateID: mandateID, CandidateDomains: candidates,
		ConfirmedDomainIds: []string{"dom_core_a3f1"}, IntentID: "intent-1",
		ReceptionRef: "../../.intents/.ing/.fixture/.reception", DomainProposalRef: "domain_proposal.json",
	})
	if err != nil {
		t.Fatalf("human sync rejected CLI confirmation: %v", err)
	}
	if result.StateVersion == 0 {
		t.Fatalf("result=%#v", result)
	}
}
