package activities

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
)

func writeGenesisStateFixture(t *testing.T, root, mandateID string) string {
	t.Helper()
	dir := filepath.Join(root, mandateID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	state := map[string]interface{}{
		"mandateId": mandateID, "mandateType": "genesis", "project": "fixture",
		"stateVersion": 1, "updatedAt": "initial",
		"signature": map[string]interface{}{
			"status": "not_ready", "intentId": nil,
			"artifacts": map[string]interface{}{"reception": nil, "domainProposal": nil, "humanSyncPersisted": false},
			"pendingAt": nil, "signedAt": nil, "failedAt": nil, "failure": nil,
		},
		"phases": map[string]interface{}{"validate": map[string]interface{}{
			"status": "pending", "humanSync": map[string]interface{}{"candidateDomains": []interface{}{}},
		}},
	}
	raw, _ := json.Marshal(state)
	path := filepath.Join(dir, "mandate_state.json")
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func readGenesisStateFixture(t *testing.T, path string) map[string]interface{} {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var state map[string]interface{}
	if err := json.Unmarshal(raw, &state); err != nil {
		t.Fatal(err)
	}
	return state
}

func TestActionIDIsDeterministicUUIDv5(t *testing.T) {
	mandateID := "b15bcdf4-b8e8-4318-b009-3855aed4cb31"
	key := "gen/scaffold/domain/dom-core"

	first := actionIDFor(mandateID, key)
	second := actionIDFor(mandateID, key)
	if first != second {
		t.Fatalf("same mandate and logical key produced different IDs: %q != %q", first, second)
	}
	parsed, err := uuid.Parse(first)
	if err != nil {
		t.Fatalf("action ID is not a UUID: %v", err)
	}
	if parsed.Version() != 5 {
		t.Fatalf("action ID version = %d, want UUIDv5", parsed.Version())
	}
}

func TestActionIDSeparatesMandatesAndLogicalKeys(t *testing.T) {
	base := actionIDFor("mandate-a", "gen/scaffold/domain/dom-core")
	if got := actionIDFor("mandate-b", "gen/scaffold/domain/dom-core"); got == base {
		t.Fatal("different mandates produced the same action ID")
	}
	if got := actionIDFor("mandate-a", "gen/scaffold/domain/dom-api"); got == base {
		t.Fatal("different logical action keys produced the same action ID")
	}
}

func TestActionIDDependencyUsesSameDerivation(t *testing.T) {
	dependency := DomainCandidateState{DomainID: "dom-core", Name: "Core"}
	fromDependency := actionIDFor("mandate-a", logicalActionKeyFor(dependency))
	fromAction := actionIDFor("mandate-a", "gen/scaffold/domain/dom-core")
	if fromDependency != fromAction {
		t.Fatalf("dependency derivation %q differs from action derivation %q", fromDependency, fromAction)
	}
}

func TestPersistHumanSyncTransitionsSignaturePendingOnce(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-pending"
	path := writeGenesisStateFixture(t, root, mandateID)
	input := PersistHumanSyncInput{
		MandatesRoot: root, MandateID: mandateID, IntentID: "intent-1",
		ReceptionRef:       "../../../.intents/.ing/.fixture/.reception",
		DomainProposalRef:  "domain_proposal.json",
		CandidateDomains:   []DomainCandidateState{{DomainID: "dom-1", Name: "Core"}},
		ConfirmedDomainIds: []string{"dom-1"}, ConfirmedBy: "tester",
	}
	first, err := PersistHumanSyncActivity(input)
	if err != nil || first.StateVersion != 2 {
		t.Fatalf("first=%#v err=%v", first, err)
	}
	state := readGenesisStateFixture(t, path)
	signature := state["signature"].(map[string]interface{})
	if signature["status"] != "pending" || signature["intentId"] != "intent-1" {
		t.Fatalf("signature=%#v", signature)
	}
	second, err := PersistHumanSyncActivity(input)
	if err != nil || second.StateVersion != 2 {
		t.Fatalf("retry=%#v err=%v", second, err)
	}
}

func TestSignMandatePersistsSignedOnlyAfterMandateJSON(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-sign"
	path := writeGenesisStateFixture(t, root, mandateID)
	_, err := PersistHumanSyncActivity(PersistHumanSyncInput{
		MandatesRoot: root, MandateID: mandateID, IntentID: "intent-1",
		ReceptionRef: "reception", DomainProposalRef: "domain_proposal.json",
		CandidateDomains:   []DomainCandidateState{{DomainID: "dom-1", Name: "Core"}},
		ConfirmedDomainIds: []string{"dom-1"},
	})
	if err != nil {
		t.Fatal(err)
	}
	result, err := SignMandateActivity(root, mandateID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, mandateID, "mandate.json")); err != nil {
		t.Fatal(err)
	}
	state := readGenesisStateFixture(t, path)
	if state["signature"].(map[string]interface{})["status"] != "signed" || result.StateVersion != 3 {
		t.Fatalf("result=%#v state=%#v", result, state)
	}
	retry, err := SignMandateActivity(root, mandateID)
	if err != nil || retry.StateVersion != 3 || retry.SignedAt != result.SignedAt {
		t.Fatalf("retry=%#v err=%v", retry, err)
	}
}

func TestPersistSignatureFailureIsIdempotent(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-failure"
	path := writeGenesisStateFixture(t, root, mandateID)
	_, err := PersistHumanSyncActivity(PersistHumanSyncInput{
		MandatesRoot: root, MandateID: mandateID, IntentID: "intent-1",
		ReceptionRef: "reception", DomainProposalRef: "domain_proposal.json",
	})
	if err != nil {
		t.Fatal(err)
	}
	input := PersistSignatureFailureInput{MandatesRoot: root, MandateID: mandateID, Message: "boom", FailureType: "SignMandateActivity"}
	first, err := PersistSignatureFailureActivity(input)
	if err != nil || first.StateVersion != 3 {
		t.Fatalf("first=%#v err=%v", first, err)
	}
	second, err := PersistSignatureFailureActivity(input)
	if err != nil || second.StateVersion != 3 {
		t.Fatalf("retry=%#v err=%v", second, err)
	}
	state := readGenesisStateFixture(t, path)
	if state["signature"].(map[string]interface{})["status"] != "failed" {
		t.Fatalf("state=%#v", state)
	}
}
