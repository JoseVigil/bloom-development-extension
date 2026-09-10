package authority

import (
	"encoding/json"
	"path/filepath"
	"testing"
	"time"
)

func decisionState(now time.Time) *DurableState {
	return &DurableState{Binding: Binding{"org", "issuer", "installation"}, Emission: &EmissionMetadata{Schema: "bloom.authority.snapshot", SchemaVersion: "1.0", SnapshotID: "s", Issuer: "issuer", OrganizationID: "org", AuthorityVersion: "7", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute), ExpiresAt: now.Add(time.Minute), Audience: Audience{"org", []string{"installation"}}}, Monotonic: MonotonicState{HighWaterMark: "7", StateDigest: "digest"}, Projection: FullContent{Principals: []Principal{{PrincipalID: "p", PrincipalType: "human", Status: "active", ExternalIdentities: []ExternalIdentity{{Provider: "github", Subject: "p", DisplayHandle: "p", Status: "verified", VerifiedAt: now.Add(-time.Hour)}}}}, Memberships: []Membership{{MembershipID: "m", PrincipalID: "p", OrganizationID: "org", Status: "active", ValidFrom: now.Add(-time.Hour), AcceptedAt: now.Add(-time.Hour)}}, RoleDefinitions: []RoleDefinition{{RoleID: "specialist", RoleVersion: "1", RoleOrigin: "builtin", DisplayName: "Specialist", Status: "active", Permissions: []string{"intent.create"}}}, RoleAssignments: []RoleAssignment{{AssignmentID: "a", MembershipID: "m", RoleID: "specialist", RoleVersion: "1", Scope: Scope{"project", "project-a"}, Status: "active", ValidFrom: now.Add(-time.Hour), AcceptedAt: now.Add(-time.Hour)}}, Revocations: []Revocation{}}}
}
func request(now time.Time) DecisionRequest {
	return DecisionRequest{Operation: "intent.create", PrincipalID: "p", Scope: Scope{"project", "project-a"}, RequiredControls: []string{"gravity"}, Controls: map[string]ControlEvidence{"gravity": {true, true, "g7"}}, At: now}
}
func TestDecisionRequiresExactIdentityRolePermissionScopeAndControls(t *testing.T) {
	now := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	e := DecisionEvaluator{state: decisionState(now)}
	if d := e.Evaluate(request(now)); d.Outcome != DecisionAllow || d.AuthorityVersion != "7" || d.Reason != "permission_granted" {
		t.Fatalf("unexpected allow: %+v", d)
	}
	cases := []struct {
		name   string
		change func(*DecisionRequest, *DurableState)
		out    DecisionOutcome
		reason string
	}{{"scope", func(r *DecisionRequest, _ *DurableState) { r.Scope.ID = "other" }, DecisionDeny, "permission_not_granted"}, {"no implicit scope inheritance", func(_ *DecisionRequest, s *DurableState) {
		s.Projection.RoleAssignments[0].Scope = Scope{"organization", "org"}
	}, DecisionDeny, "permission_not_granted"}, {"permission", func(r *DecisionRequest, _ *DurableState) { r.Operation = "mandate.sign" }, DecisionDeny, "permission_not_granted"}, {"control absent", func(r *DecisionRequest, _ *DurableState) { r.Controls = map[string]ControlEvidence{} }, DecisionNotEvaluable, "required_control_absent:gravity"}, {"control deny", func(r *DecisionRequest, _ *DurableState) { r.Controls["gravity"] = ControlEvidence{true, false, "g8"} }, DecisionDeny, "required_control_denied:gravity"}, {"identity unverified", func(_ *DecisionRequest, s *DurableState) {
		s.Projection.Principals[0].ExternalIdentities[0].Status = "revoked"
	}, DecisionDeny, "principal_identity_unverified"}, {"role missing", func(_ *DecisionRequest, s *DurableState) { s.Projection.RoleDefinitions = nil }, DecisionNotEvaluable, "referenced_role_unavailable"}, {"unknown operation", func(r *DecisionRequest, _ *DurableState) { r.Operation = "project.create" }, DecisionNotEvaluable, "operation_permission_unmapped"}}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			state := decisionState(now)
			r := request(now)
			tc.change(&r, state)
			d := (DecisionEvaluator{state: state}).Evaluate(r)
			if d.Outcome != tc.out || d.Reason != tc.reason {
				t.Fatalf("got %+v", d)
			}
		})
	}
}
func TestDecisionDeniesExpiryRevocationAndInactiveFacts(t *testing.T) {
	now := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	tests := []struct {
		name   string
		change func(*DurableState)
		reason string
	}{{"expired", func(s *DurableState) { s.Emission.ExpiresAt = now }, "state_expired"}, {"principal", func(s *DurableState) { s.Projection.Principals[0].Status = "suspended" }, "principal_inactive"}, {"membership revoked", func(s *DurableState) {
		s.Projection.Revocations = []Revocation{{RevocationID: "r", TargetType: "membership", TargetID: "m", EffectiveAt: now, RecordedInAuthorityVersion: "7", ReasonCode: "test"}}
	}, "permission_not_granted"}, {"assignment expired", func(s *DurableState) { until := now; s.Projection.RoleAssignments[0].ValidUntil = &until }, "permission_not_granted"}}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := decisionState(now)
			tc.change(s)
			d := (DecisionEvaluator{state: s}).Evaluate(request(now))
			if d.Outcome != DecisionDeny || d.Reason != tc.reason {
				t.Fatalf("got %+v", d)
			}
		})
	}
}
func TestDecisionStoreFailureIsVisibleNotEvaluable(t *testing.T) {
	now := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	d := (DecisionEvaluator{Store: &Store{Path: filepath.Join(t.TempDir(), "missing")}, Now: func() time.Time { return now }}).Evaluate(request(time.Time{}))
	if d.Outcome != DecisionNotEvaluable || d.Reason != "state_unavailable" {
		t.Fatalf("got %+v", d)
	}
}

func TestDecisionReadsOnlyVerifierAcceptedStateAndCheckpoint(t *testing.T) {
	now := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	p, pub, private := fullFixture(t, "7")
	p.IssuedAt = now.Add(-time.Minute)
	p.NotBefore = p.IssuedAt
	p.ExpiresAt = now.Add(time.Minute)
	p.Content, _ = json.Marshal(decisionState(now).Projection)
	dir := t.TempDir()
	store := &Store{Path: filepath.Join(dir, "state.json")}
	checkpoint := &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}
	verifier := &Verifier{Trust: TrustBundle{"issuer": {"key": pub}}, Binding: Binding{"org", "issuer", "installation"}, Store: store, Checkpoint: checkpoint, Now: func() time.Time { return now }}
	if _, err := verifier.VerifyAndAccept(signedFixture(t, p, private, "key"), "decision"); err != nil {
		t.Fatal(err)
	}
	d := (DecisionEvaluator{Store: store, Checkpoint: checkpoint, Now: func() time.Time { return now }}).Evaluate(request(time.Time{}))
	if d.Outcome != DecisionAllow {
		t.Fatalf("accepted pair did not authorize: %+v", d)
	}
	without := (DecisionEvaluator{Store: store, Now: func() time.Time { return now }}).Evaluate(request(time.Time{}))
	if without.Outcome != DecisionNotEvaluable {
		t.Fatalf("store without checkpoint evaluated: %+v", without)
	}
}
