package authority

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestAuthorityEndToEndBackendEvidence(t *testing.T) {
	path := os.Getenv("AUTHORITY_E2E_EVIDENCE")
	if path == "" {
		t.Skip("invoked by Backend evidence route test")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var evidence struct {
		Schema         string `json:"schema"`
		OrganizationID string `json:"organization_id"`
		InstallationID string `json:"installation_id"`
		Items          []struct {
			Kind             string `json:"kind"`
			Status           string `json:"status"`
			AuthorityVersion string `json:"authority_version"`
		} `json:"items"`
		Integrity struct {
			Algorithm string `json:"algorithm"`
			Digest    string `json:"digest"`
		} `json:"integrity"`
	}
	if json.Unmarshal(raw, &evidence) != nil {
		t.Fatal("invalid Backend evidence")
	}
	want := map[string]bool{"emission": false, "administration": false, "outbox": false, "delivery": false, "measurement": false}
	for _, item := range evidence.Items {
		want[item.Kind] = true
	}
	for kind, found := range want {
		if !found {
			t.Fatalf("Backend journey omitted %s", kind)
		}
	}
	if evidence.Schema != "bloom.authority.evidence" || evidence.OrganizationID == "" || evidence.InstallationID == "" || evidence.Integrity.Algorithm != "SHA-256" || evidence.Integrity.Digest == "" {
		t.Fatalf("incomplete evidence: %+v", evidence)
	}

	now := time.Date(2026, 9, 10, 10, 1, 0, 0, time.UTC)
	p, pub, priv := fullFixture(t, "7")
	p.IssuedAt = now.Add(-time.Minute)
	p.NotBefore = p.IssuedAt
	p.ExpiresAt = now.Add(time.Hour)
	p.Content, _ = json.Marshal(decisionState(now).Projection)
	dir := t.TempDir()
	store := &Store{Path: filepath.Join(dir, "state.json")}
	checkpoint := &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}
	v := &Verifier{Trust: TrustBundle{"issuer": {"key": pub}}, Binding: Binding{"org", "issuer", "installation"}, Store: store, Checkpoint: checkpoint, Now: func() time.Time { return now }}
	if _, err = v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "backend-admin-outbox-sync"); err != nil {
		t.Fatal(err)
	}
	// Restart reads only the durable state/checkpoint pair.
	evaluator := DecisionEvaluator{Store: &Store{Path: store.Path}, Checkpoint: &CheckpointStore{Path: checkpoint.Path}, Now: func() time.Time { return now }}
	allowed := evaluator.Evaluate(request(time.Time{}))
	if allowed.Outcome != DecisionAllow {
		t.Fatalf("accepted authority did not allow: %+v", allowed)
	}
	before, _ := os.ReadFile(store.Path)
	tampered := signedFixture(t, p, priv, "key")
	tampered[len(tampered)-2] ^= 1
	if _, err = v.VerifyAndAccept(tampered, "divergence"); err == nil {
		t.Fatal("divergence accepted")
	}
	after, _ := os.ReadFile(store.Path)
	if !bytes.Equal(before, after) {
		t.Fatal("divergence changed durable state")
	}
	missing := request(now)
	missing.Controls = map[string]ControlEvidence{}
	if d := evaluator.Evaluate(missing); d.Outcome != DecisionNotEvaluable {
		t.Fatalf("missing control=%+v", d)
	}
	state := decisionState(now)
	state.Projection.RoleAssignments[0].Status = "revoked"
	state.Projection.Revocations = []Revocation{{RevocationID: "r8", TargetType: "role_assignment", TargetID: "a", EffectiveAt: now, RecordedInAuthorityVersion: "8", ReasonCode: "administrative_revocation"}}
	p.AuthorityVersion = "8"
	p.SnapshotID = "revocation-8"
	p.Content, _ = json.Marshal(state.Projection)
	if _, err = v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "revocation-outbox-sync"); err != nil {
		t.Fatal(err)
	}
	revoked := evaluator.Evaluate(request(now))
	if revoked.Outcome != DecisionDeny {
		t.Fatalf("revocation not effective: %+v", revoked)
	}
	localErr := os.ErrPermission
	value, got, record := PreserveShadow("local-result", localErr, revoked, ShadowInput{Operation: "intent.create", Class: ClassStandard, CommittedAt: now.Add(-time.Minute), ObservedAt: now, Connected: false}, nil)
	if value != "local-result" || got != localErr || !record.WouldBlock {
		t.Fatalf("shadow changed local result: %q %v %+v", value, got, record)
	}
}
