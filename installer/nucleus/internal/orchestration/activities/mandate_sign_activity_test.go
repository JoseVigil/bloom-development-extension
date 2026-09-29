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
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/orchestration/mandatecontract"
	"nucleus/internal/orchestration/mandateintelligence"

	"github.com/google/uuid"
)

func stringPtr(value string) *string { return &value }

func TestMandateGenLocalObservationFailsClosedBeforeEffect(t *testing.T) {
	manifest, access := strings.Repeat("a", 64), strings.Repeat("b", 64)
	activity := &MandateGenActivity{RunAITAP: mandateintelligence.Runner(func(_ context.Context, args ...string) ([]byte, error) {
		if args[0] == "route" {
			return json.Marshal(map[string]any{"status": "success", "operation": "route.policy", "data": map[string]any{"policy_version": "local-access-default/v1", "file_sha256": access, "enforced": true, "policy": map[string]any{"default_decision": "deny"}}})
		}
		return json.Marshal(map[string]any{"status": "success", "operation": "local.preflight", "data": map[string]any{"readiness": map[string]any{"observed_at": time.Now().UTC().Format(time.RFC3339), "ttl_seconds": 60, "models": map[string]any{"test-id": map[string]any{"model": "test:tag", "installed": true, "available": true, "manifest_sha256": manifest}}}}})
	})}
	selection := mandatecontract.Intelligence{ModelID: "test-id", Model: "test:tag", AccessPolicyVersion: "local-access-default/v1", AccessPolicySHA256: access, ModelManifestSHA256: manifest}
	if err := activity.verifyLocalObservation(context.Background(), selection); err != nil {
		t.Fatal(err)
	}
	selection.ModelManifestSHA256 = strings.Repeat("c", 64)
	if err := activity.verifyLocalObservation(context.Background(), selection); err == nil {
		t.Fatal("changed local model accepted")
	}
}

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
			"status": "pending", "humanSync": map[string]interface{}{
				"candidateDomains":   []interface{}{map[string]interface{}{"domainId": "dom-1", "name": "Core", "cohesionScore": float64(0), "suggestedActionCount": 0}},
				"confirmedDomainIds": []string{"dom-1"}, "confirmedAt": "2026-01-01T00:00:00Z",
				"files": []interface{}{map[string]interface{}{"ref": "inputs/source.md", "sha256": strings.Repeat("a", 64), "size": float64(4)}},
			},
		}},
	}
	raw, _ := json.Marshal(state)
	path := filepath.Join(dir, "mandate_state.json")
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestMandateGenDenialUsesExistingNucleusMandateStream(t *testing.T) {
	logsDir := t.TempDir()
	logger, err := core.InitLogger(&core.Paths{LogsDir: logsDir}, "MANDATE", true)
	if err != nil {
		t.Fatal(err)
	}
	activity := &MandateGenActivity{Logger: logger}
	if _, err := activity.Run(context.Background(), MandateGenInput{MandateID: "m-closed"}); err == nil {
		t.Fatal("activation unexpectedly enabled")
	}
	if err := logger.Close(); err != nil {
		t.Fatal(err)
	}
	paths, err := filepath.Glob(filepath.Join(logsDir, "nucleus", "nucleus_mandate_*.log"))
	if err != nil || len(paths) != 1 {
		t.Fatalf("nucleus_mandate stream missing: %v %v", paths, err)
	}
	raw, err := os.ReadFile(paths[0])
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), "mandate.execution.denied") || !strings.Contains(string(raw), "m-closed") {
		t.Fatalf("Mandate correlation missing from stream: %s", raw)
	}
}

func writeVerifiedActReceipts(t *testing.T, dir string, contract mandatecontract.Contract, installation *authority.LocalIdentity) map[string]ed25519.PublicKey {
	t.Helper()
	rootPublic, rootPrivate, _ := ed25519.GenerateKey(rand.Reader)
	issuerPublic, issuerPrivate, _ := ed25519.GenerateKey(rand.Reader)
	actorPublic, _, _ := ed25519.GenerateKey(rand.Reader)
	now := time.Now().UTC().Truncate(time.Second)
	digest, err := mandatecontract.Digest(contract)
	if err != nil {
		t.Fatal(err)
	}
	sign := func(payload any, domain, keyID string, key ed25519.PrivateKey) json.RawMessage {
		raw, _ := json.Marshal(payload)
		canonical, err := authority.Canonicalize(raw)
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(canonical)
		sig := ed25519.Sign(key, append(append([]byte(domain), 0), canonical...))
		out, _ := json.Marshal(authority.Envelope{Payload: raw, Integrity: authority.Integrity{Canonicalization: "JCS-RFC8785", DigestAlgorithm: "SHA-256", Digest: base64.RawURLEncoding.EncodeToString(sum[:]), SignatureAlgorithm: "Ed25519", KeyID: keyID, Signature: base64.RawURLEncoding.EncodeToString(sig)}})
		return out
	}
	manifest := sign(authority.TrustManifestPayload{Schema: "bloom.authority.trust-manifest", SchemaVersion: "1.0", ManifestID: "manifest-1", Issuer: "issuer", OrganizationID: contract.OrganizationID, ManifestVersion: "1", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour), RootKeyID: "root", Keys: []authority.TrustKey{{KeyID: "issuer-key", PublicKey: base64.RawURLEncoding.EncodeToString(issuerPublic), Status: "active", ValidFrom: now.Add(-time.Minute)}}}, "BLOOM-AUTHORITY-TRUST-MANIFEST-v1", "root", rootPrivate)
	for _, operation := range []string{"approve", "activate"} {
		challenge := "challenge-" + operation
		sum := sha256.Sum256([]byte(challenge))
		att := sign(authority.ActorAttestation{Schema: "bloom.authority.actor-attestation", SchemaVersion: "1.2", AttestationID: "att-" + operation, Issuer: "issuer", OrganizationID: contract.OrganizationID, InstallationID: installation.InstallationID, PrincipalID: "human", ActorPublicKey: base64.RawURLEncoding.EncodeToString(actorPublic), Audience: "bloom.authority.mandate-consent", ChallengeDigest: base64.RawURLEncoding.EncodeToString(sum[:]), IssuedAt: now, ExpiresAt: now.Add(time.Minute), Operation: operation, MandateID: contract.MandateID, ContractDigest: digest}, "BLOOM-AUTHORITY-ACTOR-ATTESTATION-v1", "issuer-key", issuerPrivate)
		permission := "mandate.sign"
		if operation == "activate" {
			permission = "mandate.install"
		}
		receipt, err := mandatecontract.SignActReceipt(mandatecontract.ActReceipt{Operation: operation, MandateID: contract.MandateID, ContractDigest: digest, Contract: contract, OrganizationID: contract.OrganizationID, Attestation: att, Manifest: manifest, ActorChallenge: challenge, ActorPublicKey: base64.RawURLEncoding.EncodeToString(actorPublic), Decision: authority.AuthorityDecision{Outcome: authority.DecisionAllow, Operation: permission, PrincipalID: "human", Scope: authority.Scope{Type: "project", ID: contract.ProjectID}, EvaluatedAt: now}, RecordedAt: now.Add(time.Second)}, installation)
		if err != nil {
			t.Fatal(err)
		}
		if err := mandatecontract.SaveActReceipt(dir, receipt); err != nil {
			t.Fatal(err)
		}
	}
	return map[string]ed25519.PublicKey{"root": rootPublic}
}

func TestMandateGenReconstructsSignedInputsAndReconcilesArtifact(t *testing.T) {
	root := t.TempDir()
	accounting := filepath.Join(root, "aitap-accounting")
	if err := os.Mkdir(accounting, 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("AITAP_STATE_DIR", accounting)
	installationID := "39be42b3-534d-4b73-8a2e-3a2abfa4e203"
	mandateID := "mandate-1"
	dir := filepath.Join(root, mandateID)
	if err := os.MkdirAll(filepath.Join(dir, "inputs"), 0700); err != nil {
		t.Fatal(err)
	}
	source := []byte("# Billing\n")
	if err := os.WriteFile(filepath.Join(dir, "inputs", "source.md"), source, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "inputs", "late.md"), []byte("unsigned"), 0600); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(source)
	policyRef := filepath.Join(root, "policy.json")
	registryRef := filepath.Join(root, "registry.json")
	policyBytes := []byte(`{"policy_version":"mandate-gen/v1"}`)
	registryBytes := []byte(`{"intelligence_backends":[]}`)
	if err := os.WriteFile(policyRef, policyBytes, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(registryRef, registryBytes, 0600); err != nil {
		t.Fatal(err)
	}
	policySum, registrySum := sha256.Sum256(policyBytes), sha256.Sum256(registryBytes)
	contract := mandatecontract.Contract{
		MandateID: mandateID, ContractVersion: 2, OrganizationID: "org", ProjectID: "project", ProjectBinding: "binding",
		Objective: "Define Billing", Domain: mandatecontract.Domain{ID: "d1", Name: "Billing"},
		Action:       mandatecontract.Action{ActionID: "a1", Type: "run_intent", IntentType: "gen", DomainID: "d1", ArtifactRef: "domain_definition.json", IdempotencyKey: "key1"},
		Intelligence: &mandatecontract.Intelligence{Provider: "anthropic", BackendID: "anthropic_api", Model: "test-model", CredentialRef: stringPtr("credential-ref://anthropic/default"), PolicyRef: policyRef, PolicyVersion: "mandate-gen/v1", PolicySHA256: hex.EncodeToString(policySum[:]), RegistryRef: registryRef, RegistrySHA256: hex.EncodeToString(registrySum[:]), MaxUSD: "0.01", MaxTotalTokens: 1000, MaxOutputTokens: 100},
		Inputs:       []mandatecontract.Input{{Ref: "inputs/source.md", SHA256: hex.EncodeToString(sum[:]), Size: int64(len(source))}},
		Fulfillment:  mandatecontract.Fulfillment{Evaluator: "domain-definition-structure", EvaluatorVersion: "1", RequiredFields: []string{"domainId", "purpose", "boundaries", "concepts", "decisions", "sources"}},
	}
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	identityPath := filepath.Join(root, "identity.json")
	identityRaw, _ := json.Marshal(map[string]string{"installation_id": installationID, "public_key": base64.StdEncoding.EncodeToString(public), "private_key": base64.StdEncoding.EncodeToString(private)})
	if err := os.WriteFile(identityPath, identityRaw, 0600); err != nil {
		t.Fatal(err)
	}
	envelope, err := mandatecontract.Sign(contract, &authority.LocalIdentity{InstallationID: installationID, PublicKey: public, PrivateKey: private})
	if err != nil {
		t.Fatal(err)
	}
	envelopeRaw, _ := json.Marshal(envelope)
	if err := os.WriteFile(filepath.Join(dir, "mandate.json"), envelopeRaw, 0600); err != nil {
		t.Fatal(err)
	}
	stateRaw, _ := json.Marshal(map[string]interface{}{"activation": map[string]string{"status": "active", "contractDigest": envelope.ContractDigest}})
	if err := os.WriteFile(filepath.Join(dir, "mandate_state.json"), stateRaw, 0600); err != nil {
		t.Fatal(err)
	}
	var lastResponse []byte
	inferenceWrites := 0
	activity := &MandateGenActivity{IdentityPath: identityPath, RunBrain: func(_ context.Context, request []byte) ([]byte, error) {
		if lastResponse != nil {
			return lastResponse, nil
		}
		var payload struct {
			Contract       mandatecontract.Contract `json:"contract"`
			ContractDigest string                   `json:"contractDigest"`
			Sources        []map[string]string      `json:"sources"`
			Supply         struct {
				Directory string `json:"directory"`
			} `json:"supply"`
		}
		if err := json.Unmarshal(request, &payload); err != nil {
			return nil, err
		}
		if len(payload.Sources) != 1 || payload.Sources[0]["content"] != string(source) {
			t.Fatal("Brain received unsigned or altered source set")
		}
		data := map[string]interface{}{
			"schemaVersion": "1.0", "mandateId": mandateID, "contractDigest": payload.ContractDigest,
			"domainId": "d1", "name": "Billing", "purpose": "Define Billing",
			"boundaries": map[string]interface{}{"scope": "one domain"}, "concepts": []interface{}{"Billing"}, "decisions": []interface{}{},
			"sources": []interface{}{map[string]interface{}{"ref": "inputs/source.md", "sha256": hex.EncodeToString(sum[:])}},
		}
		proposal, _ := json.Marshal(map[string]interface{}{"purpose": "Define Billing", "boundaries": map[string]interface{}{"scope": "one domain"}, "concepts": []string{"Billing"}, "decisions": []string{}})
		proposalSum := sha256.Sum256(proposal)
		logicalID := "sha256:" + strings.Repeat("a", 64)
		accountingRef := "accounting://inference/" + strings.Repeat("a", 64)
		if err := os.MkdirAll(payload.Supply.Directory, 0700); err != nil {
			return nil, err
		}
		requestRaw, _ := json.Marshal(map[string]interface{}{"logical_inference_id": logicalID, "intent": map[string]string{"mandate_id": mandateID, "intent_type": "gen", "phase": "generation"}, "payload": map[string]string{"contractDigest": payload.ContractDigest}, "routing": map[string]string{"policy_version": "mandate-gen/v1"}})
		resultRaw, _ := json.Marshal(map[string]interface{}{"logical_inference_id": logicalID, "outcome": "completed", "raw_response": string(proposal), "raw_response_digest": "sha256:" + hex.EncodeToString(proposalSum[:]), "accounting_ref": accountingRef, "model": "test-model", "routing_decision": map[string]interface{}{"effective_intelligence": map[string]string{"backend_id": "anthropic_api", "credential_ref": "credential-ref://anthropic/default"}}})
		if err := os.WriteFile(filepath.Join(payload.Supply.Directory, ".request.json"), requestRaw, 0600); err != nil {
			return nil, err
		}
		if err := os.WriteFile(filepath.Join(payload.Supply.Directory, ".supply_result.json"), resultRaw, 0600); err != nil {
			return nil, err
		}
		journal := map[string]interface{}{"state": "completed", "attempts": []interface{}{map[string]string{"outcome": "completed"}}, "result": map[string]string{"logical_inference_id": logicalID, "raw_response_digest": "sha256:" + hex.EncodeToString(proposalSum[:])}}
		journalCanonical, _ := json.Marshal(journal)
		journalSum := sha256.Sum256(journalCanonical)
		journalRaw, _ := json.Marshal(map[string]interface{}{"journal": journal, "journal_digest": "sha256:" + hex.EncodeToString(journalSum[:])})
		if err := os.WriteFile(filepath.Join(accounting, strings.Repeat("a", 64)+".json"), journalRaw, 0600); err != nil {
			return nil, err
		}
		inferenceWrites++
		lastResponse, err = json.Marshal(map[string]interface{}{"status": "success", "data": data, "inference": map[string]string{"logicalInferenceId": logicalID, "rawResponseDigest": "sha256:" + hex.EncodeToString(proposalSum[:]), "accountingRef": accountingRef, "model": "test-model"}})
		return lastResponse, err
	}}
	input := MandateGenInput{MandatesRoot: root, MandateID: mandateID}
	if _, err := mandatecontract.LoadVerified(dir, identityPath); err != nil {
		t.Fatalf("load: %v", err)
	}
	if err := requireActiveMandate(dir, envelope.ContractDigest); err != nil {
		t.Fatalf("activation: %v", err)
	}
	if _, err := frozenSources(dir, contract.Inputs); err != nil {
		t.Fatalf("sources: %v", err)
	}
	if _, err := activity.Run(context.Background(), input); err == nil {
		t.Fatal("production gen accepted unverified activation")
	}
	activity.TrustRoots = writeVerifiedActReceipts(t, dir, contract, &authority.LocalIdentity{InstallationID: installationID, PublicKey: public, PrivateKey: private})
	first, err := activity.Run(context.Background(), input)
	if err != nil || first.FulfillmentStatus != "fulfilled" || first.AlreadyApplied {
		t.Fatalf("first=%#v err=%v", first, err)
	}
	journalPath := filepath.Join(accounting, strings.Repeat("a", 64)+".json")
	completedJournal, err := os.ReadFile(journalPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(journalPath, []byte(`{"journal":{"state":"in_flight"},"journal_digest":"invalid"}`), 0600); err != nil {
		t.Fatal(err)
	}
	activity.RunBrain = func(_ context.Context, _ []byte) ([]byte, error) { return lastResponse, nil }
	if _, err := activity.Run(context.Background(), input); err == nil {
		t.Fatal("in_flight journal accepted as fulfilled")
	}
	if err := os.WriteFile(journalPath, completedJournal, 0600); err != nil {
		t.Fatal(err)
	}
	restarted := *activity // simulate a fresh worker reading only durable files
	second, err := restarted.Run(context.Background(), input)
	if err != nil || !second.AlreadyApplied || second.ArtifactSHA256 != first.ArtifactSHA256 {
		t.Fatalf("retry=%#v err=%v", second, err)
	}
	if inferenceWrites != 1 {
		t.Fatalf("expected one durable inference, got %d", inferenceWrites)
	}
	if err := os.WriteFile(filepath.Join(dir, "inputs", "source.md"), []byte("altered"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := activity.Run(context.Background(), input); err == nil {
		t.Fatal("tampered Files accepted")
	}
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

func TestLegacySignMandateFailsClosedWithoutHumanProof(t *testing.T) {
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
	_, err = SignMandateActivity(root, mandateID)
	if err == nil {
		t.Fatal("legacy signature accepted without actor proof")
	}
	if _, err := os.Stat(filepath.Join(root, mandateID, "mandate.json")); !os.IsNotExist(err) {
		t.Fatalf("mandate.json unexpectedly written: %v", err)
	}
	state := readGenesisStateFixture(t, path)
	if state["signature"].(map[string]interface{})["status"] != "pending" {
		t.Fatalf("signature advanced without proof: %#v", state)
	}
}

func TestPersistSignatureFailureIsIdempotent(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-failure"
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
