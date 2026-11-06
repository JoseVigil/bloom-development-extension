package governance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/orchestration/mandatecontract"
)

func TestIntentSupplyBridgeRejectsFreeOrMismatchedActor(t *testing.T) {
	now := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	if _, err := verifyIntentSupplyActor([]byte(`{"principal_id":"caller-choice"}`), nil, nil, "challenge", now); !errors.Is(err, errIntentSupplyBridgeDenied) {
		t.Fatalf("free principal input was accepted: %v", err)
	}

	actor := verifiedIntentSupplyActor{principalID: "actor", organizationID: "other-org", installationID: "installation", expiresAt: now.Add(time.Minute)}
	if _, err := evaluateIntentSupplyContext(&authority.Store{}, &authority.CheckpointStore{}, &authority.ProjectBindingStore{}, actor, validIntentSupplyContext(now)); !errors.Is(err, errIntentSupplyBridgeDenied) {
		t.Fatalf("mismatched actor context was accepted: %v", err)
	}
	actor.organizationID = "org"
	actor.expiresAt = now
	if _, err := evaluateIntentSupplyContext(&authority.Store{}, &authority.CheckpointStore{}, &authority.ProjectBindingStore{}, actor, validIntentSupplyContext(now)); !errors.Is(err, errIntentSupplyBridgeDenied) {
		t.Fatalf("expired actor context was accepted: %v", err)
	}
}

func TestIntentSupplyAuthorityEvidenceCannotCarrySecretsOrIdentity(t *testing.T) {
	evidence := intentSupplyAuthorityEvidence{
		OrganizationID: "org", ProjectID: "project", MandateID: "mandate", PreparedContractDigest: "digest",
		AllowedCapabilities: []string{"text.generate"}, AllowedPrivacy: []string{"approved_cloud"},
		AllowedDestinations: []authority.IntelligenceSupplyDestination{{BackendID: "backend", Provider: "provider", Models: []string{"model"}}},
		Limits:              authority.IntelligenceSupplyLimits{MaxInferences: 1}, ValidUntil: time.Date(2026, 10, 29, 12, 5, 0, 0, time.UTC),
		AuthorityVersion: "42", AuthorityStateDigest: "state-digest",
	}
	raw, err := json.Marshal(evidence)
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"grant_id", "principal_id", "membership_id", "issued_by", "key_id", "credential", "signature", "secret", "nonce"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("sanitized evidence contains %q: %s", forbidden, raw)
		}
	}
}

func TestIntentSupplyBridgeRejectsMissingProjectBindingWithoutMutation(t *testing.T) {
	now := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	dir := t.TempDir()
	bindingPath := filepath.Join(dir, "project-bindings.json")
	actor := verifiedIntentSupplyActor{principalID: "actor", organizationID: "org", installationID: "installation", expiresAt: now.Add(time.Minute)}
	_, err := evaluateIntentSupplyContext(&authority.Store{Path: filepath.Join(dir, "state.json")}, &authority.CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}, &authority.ProjectBindingStore{Path: bindingPath}, actor, validIntentSupplyContext(now))
	if !errors.Is(err, errIntentSupplyBridgeDenied) {
		t.Fatalf("missing binding was accepted: %v", err)
	}
	if _, statErr := filepath.Glob(filepath.Join(dir, "*.json")); statErr != nil {
		t.Fatal(statErr)
	} else if matches, _ := filepath.Glob(filepath.Join(dir, "*.json")); len(matches) != 0 {
		t.Fatalf("read-only evaluation persisted state: %v", matches)
	}
}

func validIntentSupplyContext(now time.Time) intentSupplyContext {
	return intentSupplyContext{OrganizationID: "org", InstallationID: "installation", ProjectID: "project", MandateID: "mandate", PreparedContractDigest: "digest", EvaluatedAt: now}
}

func TestIntentSupplyBridgeRejectsCallerControlledMandatePath(t *testing.T) {
	bridge := IntentSupplyBridge{MandatesRoot: t.TempDir(), IdentityPath: filepath.Join(t.TempDir(), "identity.json")}
	_, err := bridge.Assignments(context.Background(), IntentSupplyRequest{Mode: "list", RequestID: "request", MandateID: "../other", ExpectedDigest: strings.Repeat("a", 64)})
	if !errors.Is(err, errIntentSupplyBridgeDenied) {
		t.Fatalf("caller-controlled Mandate path accepted: %v", err)
	}
}

func TestBuildIntentSupplyOperationUsesOnlySignedActionsAndBoundFiles(t *testing.T) {
	dir := t.TempDir()
	policy := []byte(`{"policy_version":"policy-v1"}`)
	registry := []byte(`{"snapshot_id":"registry-v1","intelligence_backends":[{"backend_id":"local","credential_ref":null}]}`)
	policyPath, registryPath := filepath.Join(dir, "policy.json"), filepath.Join(dir, "registry.json")
	if err := os.WriteFile(policyPath, policy, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(registryPath, registry, 0600); err != nil {
		t.Fatal(err)
	}
	policySum, registrySum := sha256.Sum256(policy), sha256.Sum256(registry)
	requires, doesNotRequire := true, false
	envelope := mandatecontract.Envelope{ContractDigest: strings.Repeat("a", 64), Contract: mandatecontract.Contract{
		Actions: []mandatecontract.Action{
			{ActionID: "ing-1", RequiresIntelligence: &requires, RequiredCapabilities: []string{"text.generate"}},
			{ActionID: "doc-1", RequiresIntelligence: &doesNotRequire},
		},
		Intelligence: &mandatecontract.Intelligence{PolicyRef: policyPath, PolicyVersion: "policy-v1", PolicySHA256: hex.EncodeToString(policySum[:]), RegistryRef: registryPath, RegistrySHA256: hex.EncodeToString(registrySum[:]), RegistrySnapshotID: "registry-v1"},
	}}
	evidence := intentSupplyAuthorityEvidence{PreparedContractDigest: "sha256:" + envelope.ContractDigest, ValidUntil: time.Date(2026, 10, 29, 13, 0, 0, 0, time.UTC)}
	request := IntentSupplyRequest{Mode: "list", RequestID: "request-1", MandateID: "mandate-1"}
	operation, gotPolicy, gotRegistry, err := buildIntentSupplyOperation(request, envelope, evidence, filepath.Join(dir, "vault.json"), time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if gotPolicy != policyPath || gotRegistry != registryPath || len(operation.Actions) != 1 || operation.Actions[0].ActionID != "ing-1" || len(operation.Credentials) != 0 {
		t.Fatalf("unexpected operation: %+v paths=%q,%q", operation, gotPolicy, gotRegistry)
	}
	if err := os.WriteFile(policyPath, []byte(`{"tampered":true}`), 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := buildIntentSupplyOperation(request, envelope, evidence, filepath.Join(dir, "vault.json"), time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)); !errors.Is(err, errIntentSupplyBridgeDenied) {
		t.Fatalf("tampered policy accepted: %v", err)
	}
}
