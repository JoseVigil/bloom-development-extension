package governance

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/orchestration/mandatecontract"
)

func TestIntentSupplyReceiptSurvivesReloadAndRejectsConflictingSelection(t *testing.T) {
	dir, err := os.MkdirTemp(".", ".w4-receipt-test-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	identityPath := filepath.Join(dir, "identity.json")
	if _, err := authority.LoadOrCreateLocalIdentity(identityPath); err != nil {
		t.Fatal(err)
	}
	mandateID, digest := "mandate-test", strings.Repeat("a", 64)
	packageJSON := `{"mandate_id":"mandate-test","prepared_contract_digest":"sha256:` + digest + `","assignments":[{"action_id":"ing-1","destination":{"backend_id":"local","provider":"local","model":"test"}}],"validation":{"fingerprint":"sha256:` + digest + `","valid_until":"2026-11-07T13:00:00Z"}}`
	requested := json.RawMessage(`[{"action_id":"ing-1","destination":{"backend_id":"local","provider":"local","model":"test"}}]`)
	response := `{"status":"valid","mandate_id":"mandate-test","prepared_contract_digest":"sha256:` + digest + `","fingerprint":"sha256:` + digest + `","valid_until":"2026-11-07T13:00:00Z","assignment_package":` + packageJSON + `}`
	when := time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)
	evidence := intentSupplyAuthorityEvidence{AuthorityVersion: "7", AuthorityStateDigest: "state-7"}
	actor := verifiedIntentSupplyActor{principalID: "jose"}
	for range 2 {
		if err := saveIntentSupplyReceipt(dir, identityPath, mandateID, digest, evidence, actor, requested, json.RawMessage(response), when); err != nil {
			t.Fatal(err)
		}
	}
	refreshed := strings.Replace(response, `"fingerprint":"sha256:`+digest+`"`, `"fingerprint":"sha256:`+strings.Repeat("b", 64)+`"`, -1)
	if err := saveIntentSupplyReceipt(dir, identityPath, mandateID, digest, evidence, actor, requested, json.RawMessage(refreshed), when.Add(time.Minute)); err != nil {
		t.Fatalf("same selection duplicated after refreshed evidence: %v", err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, "intent_supply_receipt.json"))
	if err != nil {
		t.Fatal(err)
	}
	var receipt intentSupplyReceipt
	if err := json.Unmarshal(raw, &receipt); err != nil {
		t.Fatal(err)
	}
	identity, err := authority.LoadExistingLocalIdentity(identityPath)
	if err != nil || verifyIntentSupplyReceipt(receipt, identity, mandateID, digest) != nil {
		t.Fatal("receipt did not verify after reload")
	}
	destination, err := mandatecontract.LoadConfirmedDestination(dir, identityPath, mandateID, digest, "ing-1")
	if err != nil || destination.BackendID != "local" || destination.Model != "test" {
		t.Fatalf("verified W4 destination unavailable: %+v %v", destination, err)
	}
	if _, err := mandatecontract.LoadConfirmedDestination(dir, identityPath, mandateID, digest, "dis-2"); err == nil {
		t.Fatal("unconfirmed DIS destination accepted")
	}
	if _, err := mandatecontract.LoadConfirmedDestination(dir, identityPath, mandateID, strings.Repeat("b", 64), "ing-1"); err == nil {
		t.Fatal("wrong prepared digest accepted")
	}
	changed := strings.Replace(response, `"model":"test"`, `"model":"other"`, 1)
	changedRequest := json.RawMessage(`[{"action_id":"ing-1","destination":{"backend_id":"local","provider":"local","model":"other"}}]`)
	if err := saveIntentSupplyReceipt(dir, identityPath, mandateID, digest, evidence, actor, changedRequest, json.RawMessage(changed), when); err == nil {
		t.Fatal("conflicting selection was accepted")
	}
	receipt.Signature = "invalid"
	if err := verifyIntentSupplyReceipt(receipt, identity, mandateID, digest); err == nil {
		t.Fatal("invalid signature accepted")
	}
}
