package decision

import (
	"context"
	"errors"
	"nucleus/internal/authority"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type evaluatorFunc func(authority.DecisionRequest) authority.AuthorityDecision

func (f evaluatorFunc) Evaluate(r authority.DecisionRequest) authority.AuthorityDecision { return f(r) }

type sink struct{ records []authority.ShadowRecord }

func (s *sink) RecordShadow(r authority.ShadowRecord) error {
	s.records = append(s.records, r)
	return nil
}
func decisionRoot(t *testing.T) {
	root := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", root)
	record := `{"org_id":"org","owner_id":"owner","owner_name":"Owner","created_at":"2026-09-10T00:00:00Z","signed_hash":"","team_members":[]}`
	if err := os.WriteFile(filepath.Join(root, ".ownership.json"), []byte(record), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".master"), []byte("master"), 0600); err != nil {
		t.Fatal(err)
	}
}
func TestGovernanceShadowPreservesSealedLocalDecision(t *testing.T) {
	decisionRoot(t)
	now := time.Date(2026, 9, 10, 10, 0, 50, 0, time.UTC)
	log := &sink{}
	restore := InstallShadow(&ShadowConfiguration{Evaluator: evaluatorFunc(func(authority.DecisionRequest) authority.AuthorityDecision {
		return authority.AuthorityDecision{Outcome: authority.DecisionDeny, Reason: "permission_not_granted", AuthorityVersion: "8"}
	}), Request: func(_ GovernedOperation, _ string, _ *string, _ *uint64) authority.DecisionRequest {
		return authority.DecisionRequest{Operation: "intent.create"}
	}, Sink: log, Now: func() time.Time { return now }, CommittedAt: func(authority.AuthorityDecision) time.Time { return now.Add(-50 * time.Second) }, Connected: true})
	defer restore()
	parent := "org"
	version := uint64(3)
	got, err := AuthorizeGravityNodeCreation(OpCreateProject, "project", &parent, &version)
	if err != nil {
		t.Fatal(err)
	}
	if got.Basis() != BasisLocalLegacy || got.NodeID() != "project" || got.ShadowEvidence() == nil || !got.ShadowEvidence().WouldBlock || len(log.records) != 1 {
		t.Fatalf("local decision changed or shadow missing: %+v", got.ShadowEvidence())
	}
}
func TestGovernanceShadowPreservesExactLocalErrorOffline(t *testing.T) {
	decisionRoot(t)
	now := time.Date(2026, 9, 10, 10, 0, 50, 0, time.UTC)
	log := &sink{}
	restore := InstallShadow(&ShadowConfiguration{Sink: log, Now: func() time.Time { return now }, CommittedAt: func(authority.AuthorityDecision) time.Time { return now.Add(-time.Minute) }, Connected: false})
	defer restore()
	_, local := authorizeGravityNodeCreationLocal(OpCreateProject, "project", nil, nil)
	_, got := AuthorizeGravityNodeCreation(OpCreateProject, "project", nil, nil)
	if local == nil || got == nil || local.Error() != got.Error() {
		t.Fatalf("local error changed: local=%v shadow=%v", local, got)
	}
	if len(log.records) != 1 || log.records[0].RemoteOutcome != authority.DecisionNotEvaluable || !log.records[0].WouldBlock {
		t.Fatalf("offline evidence missing: %+v", log.records)
	}
}
func TestUnmappedGovernedOperationsAreVisibleWithoutInventingPermission(t *testing.T) {
	decisionRoot(t)
	log := &sink{}
	restore := InstallShadow(&ShadowConfiguration{Evaluator: evaluatorFunc(func(authority.DecisionRequest) authority.AuthorityDecision {
		panic("must not evaluate without mapping")
	}), Sink: log, Now: func() time.Time { return time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC) }})
	defer restore()
	if _, err := AuthorizeGravityNodeCreation(OpCreateOrganization, "org", nil, nil); err != nil {
		t.Fatal(err)
	}
	if len(log.records) != 1 || log.records[0].RemoteReason != "operation_permission_unmapped" {
		t.Fatalf("missing incompatibility evidence: %+v", log.records)
	}
}

func remoteDecisionRoot(t *testing.T) {
	root := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", root)
	raw := `{"schema":"bloom.organization.ownership","schema_version":"1.0","authority_mode":"remote_enforced","organization":{"canonical_id":"org","legacy_org_id":"legacy","legacy_locator":null,"slug":"acme","display_name":null,"tenant_id":"tenant"},"installation":{"installation_id":"ownership-installation"},"binding":{"state":"REMOTE_LOCKED","issuer_id":"issuer","accepted_at":"2026-09-17T10:00:00Z","remote_locked_at":"2026-09-17T10:01:00Z"},"trust_binding":{"issuer_id":"issuer","trust_anchor_id":"root","trust_anchor_fingerprint_sha256":"fingerprint","bound_organization_id":"org","bound_installation_id":"ownership-installation","accepted_at":"2026-09-17T10:00:00Z"},"legacy_authority":null,"migration":null,"created_at":"2026-09-17T09:00:00Z","updated_at":"2026-09-17T10:01:00Z"}`
	if err := os.WriteFile(filepath.Join(root, ".ownership.json"), []byte(raw), 0600); err != nil {
		t.Fatal(err)
	}
}
func TestRemoteEnforcedRequiresBindingAndUsesRemoteDecision(t *testing.T) {
	remoteDecisionRoot(t)
	parent := "org"
	version := uint64(1)
	restore := InstallShadow(&ShadowConfiguration{Connected: true, ProjectBinding: func(context.Context, string) (authority.ProjectBinding, error) {
		return authority.ProjectBinding{}, &authority.ProjectClaimError{Code: "project_binding_required"}
	}, Evaluator: evaluatorFunc(func(r authority.DecisionRequest) authority.AuthorityDecision {
		return authority.AuthorityDecision{Outcome: authority.DecisionAllow, Reason: "permission_granted", EvaluatedAt: time.Now().UTC()}
	}), Request: func(_ GovernedOperation, _ string, _ *string, _ *uint64) authority.DecisionRequest {
		return authority.DecisionRequest{}
	}})
	defer restore()
	if _, err := AuthorizeGravityNodeCreation(OpCreateProject, "project", &parent, &version); !errors.Is(err, ErrProjectBindingRequired) {
		t.Fatalf("expected project_binding_required, got %v", err)
	}
	restore()
	restore = InstallShadow(&ShadowConfiguration{Connected: true, ProjectBinding: func(_ context.Context, id string) (authority.ProjectBinding, error) {
		return authority.ProjectBinding{Status: "bound", OrganizationID: "org", TenantID: "tenant", ProjectID: id, Revision: "1", SourceRef: "installation:origin", EvidenceKind: "canonical", ClaimedAt: time.Now(), ValidUntil: time.Now().Add(time.Hour), CheckedAt: time.Now()}, nil
	}, Evaluator: evaluatorFunc(func(r authority.DecisionRequest) authority.AuthorityDecision {
		return authority.AuthorityDecision{Outcome: authority.DecisionAllow, Reason: "permission_granted", EvaluatedAt: time.Now().UTC()}
	}), Request: func(_ GovernedOperation, _ string, _ *string, _ *uint64) authority.DecisionRequest {
		return authority.DecisionRequest{}
	}})
	decision, err := AuthorizeGravityNodeCreation(OpCreateProject, "project", &parent, &version)
	if err != nil || decision.Basis() != BasisRemoteAuthority {
		t.Fatalf("decision=%+v err=%v", decision, err)
	}
	if _, err := AuthorizeGravityNodeCreation(OpCreateOrganization, "org", nil, nil); err == nil {
		t.Fatal("create_organization became remotely mapped")
	}
}

func TestRemoteEnforcedPreservesStableFailureCauses(t *testing.T) {
	remoteDecisionRoot(t)
	parent := "org"
	version := uint64(1)
	for _, tc := range []struct {
		code string
		want error
	}{{"project_binding_required", ErrProjectBindingRequired}, {"project_binding_unavailable", ErrProjectBindingUnavailable}, {"project_binding_expired", ErrProjectBindingExpired}, {"project_binding_revoked", ErrProjectBindingRevoked}, {"project_binding_conflict", ErrProjectBindingConflict}} {
		t.Run(tc.code, func(t *testing.T) {
			restore := InstallShadow(&ShadowConfiguration{Connected: true, ProjectBinding: func(context.Context, string) (authority.ProjectBinding, error) {
				return authority.ProjectBinding{}, &authority.ProjectClaimError{Code: tc.code}
			}, Evaluator: evaluatorFunc(func(authority.DecisionRequest) authority.AuthorityDecision {
				return authority.AuthorityDecision{Outcome: authority.DecisionNotEvaluable, Reason: "principal_required"}
			}), Request: func(GovernedOperation, string, *string, *uint64) authority.DecisionRequest {
				return authority.DecisionRequest{}
			}})
			defer restore()
			if _, err := AuthorizeGravityNodeCreation(OpCreateProject, "project", &parent, &version); !errors.Is(err, tc.want) {
				t.Fatalf("want %v got %v", tc.want, err)
			}
		})
	}
}

func TestRemoteEnforcedRevalidatesLiveBindingFields(t *testing.T) {
	remoteDecisionRoot(t)
	parent, version := "org", uint64(1)
	now := time.Date(2026, 9, 18, 1, 0, 0, 0, time.UTC)
	valid := authority.ProjectBinding{Status: "bound", OrganizationID: "org", TenantID: "tenant", ProjectID: "project", Revision: "1", SourceRef: "installation:origin", EvidenceKind: "canonical", ClaimedAt: now.Add(-time.Hour), CheckedAt: now, ValidUntil: now.Add(time.Hour)}
	for _, tc := range []struct {
		name   string
		mutate func(*authority.ProjectBinding)
		want   error
	}{
		{"expired", func(b *authority.ProjectBinding) { b.ValidUntil = now }, ErrProjectBindingExpired},
		{"future check", func(b *authority.ProjectBinding) { b.CheckedAt = now.Add(projectBindingClockSkew + time.Second) }, ErrProjectBindingConflict},
		{"contradictory chronology", func(b *authority.ProjectBinding) { b.ClaimedAt = b.CheckedAt.Add(time.Second) }, ErrProjectBindingConflict},
		{"forged source", func(b *authority.ProjectBinding) { b.SourceRef = "forged" }, ErrProjectBindingConflict},
		{"wrong tenant", func(b *authority.ProjectBinding) { b.TenantID = "other" }, ErrProjectBindingConflict},
	} {
		t.Run(tc.name, func(t *testing.T) {
			b := valid
			tc.mutate(&b)
			restore := InstallShadow(&ShadowConfiguration{Connected: true, Now: func() time.Time { return now }, ProjectBinding: func(context.Context, string) (authority.ProjectBinding, error) { return b, nil }, Evaluator: evaluatorFunc(func(authority.DecisionRequest) authority.AuthorityDecision {
				return authority.AuthorityDecision{Outcome: authority.DecisionAllow, Reason: "permission_granted", EvaluatedAt: now}
			}), Request: func(GovernedOperation, string, *string, *uint64) authority.DecisionRequest {
				return authority.DecisionRequest{PrincipalID: "principal", Scope: authority.Scope{Type: "organization", ID: "org"}, At: now}
			}})
			defer restore()
			if _, err := AuthorizeGravityNodeCreation(OpCreateProject, "project", &parent, &version); !errors.Is(err, tc.want) {
				t.Fatalf("want %v got %v", tc.want, err)
			}
		})
	}
}

func TestRemoteEnforcedAcceptsBindingCheckedDuringS2SLatency(t *testing.T) {
	remoteDecisionRoot(t)
	parent, version := "org", uint64(1)
	t0 := time.Date(2026, 9, 18, 1, 0, 0, 0, time.UTC)
	checkedAt := t0.Add(250 * time.Millisecond)
	validationNow := checkedAt.Add(250 * time.Millisecond)
	clockCalls := 0
	evaluationTimes := []time.Time{}
	restore := InstallShadow(&ShadowConfiguration{
		Connected: true,
		Now: func() time.Time {
			clockCalls++
			if clockCalls == 1 {
				return t0
			}
			return validationNow
		},
		ProjectBinding: func(context.Context, string) (authority.ProjectBinding, error) {
			return authority.ProjectBinding{Status: "bound", OrganizationID: "org", TenantID: "tenant", ProjectID: "project", Revision: "1", SourceRef: "installation:origin", EvidenceKind: "canonical", ClaimedAt: t0.Add(-time.Hour), CheckedAt: checkedAt, ValidUntil: validationNow.Add(time.Hour)}, nil
		},
		Evaluator: evaluatorFunc(func(request authority.DecisionRequest) authority.AuthorityDecision {
			evaluationTimes = append(evaluationTimes, request.At)
			return authority.AuthorityDecision{Outcome: authority.DecisionAllow, Reason: "permission_granted", EvaluatedAt: validationNow}
		}),
		Request: func(GovernedOperation, string, *string, *uint64) authority.DecisionRequest {
			return authority.DecisionRequest{PrincipalID: "principal", Scope: authority.Scope{Type: "organization", ID: "org"}}
		},
	})
	defer restore()
	decision, err := AuthorizeGravityNodeCreation(OpCreateProject, "project", &parent, &version)
	if err != nil || decision.Basis() != BasisRemoteAuthority {
		t.Fatalf("valid binding checked during S2S latency rejected: decision=%+v err=%v", decision, err)
	}
	if len(evaluationTimes) != 2 || !evaluationTimes[0].Equal(t0) || !evaluationTimes[1].Equal(validationNow) {
		t.Fatalf("authority was not evaluated at T0 then T1: %v", evaluationTimes)
	}
}

func TestRemoteEnforcedReevaluatesAuthorityAtT1(t *testing.T) {
	parent, version := "org", uint64(1)
	t0 := time.Date(2026, 9, 18, 1, 0, 0, 0, time.UTC)
	t1 := t0.Add(time.Second)
	binding := authority.ProjectBinding{Status: "bound", OrganizationID: "org", TenantID: "tenant", ProjectID: "project", Revision: "1", SourceRef: "installation:origin", EvidenceKind: "canonical", ClaimedAt: t0.Add(-time.Hour), CheckedAt: t0.Add(500 * time.Millisecond), ValidUntil: t1.Add(time.Hour)}
	for _, tc := range []struct {
		name       string
		atT1       authority.AuthorityDecision
		want       error
		wantDetail string
	}{
		{"snapshot expired", authority.AuthorityDecision{Outcome: authority.DecisionDeny, Reason: "state_expired", EvaluatedAt: t1}, ErrRemoteStateExpired, ""},
		{"revocation effective", authority.AuthorityDecision{Outcome: authority.DecisionDeny, Reason: "principal_inactive", EvaluatedAt: t1}, ErrRemotePermissionDenied, "principal_inactive"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			remoteDecisionRoot(t)
			clockCalls := 0
			restore := InstallShadow(&ShadowConfiguration{
				Connected: true,
				Now: func() time.Time {
					clockCalls++
					if clockCalls == 1 {
						return t0
					}
					return t1
				},
				ProjectBinding: func(context.Context, string) (authority.ProjectBinding, error) { return binding, nil },
				Evaluator: evaluatorFunc(func(request authority.DecisionRequest) authority.AuthorityDecision {
					if request.At.Equal(t1) {
						return tc.atT1
					}
					return authority.AuthorityDecision{Outcome: authority.DecisionNotEvaluable, Reason: "principal_required", EvaluatedAt: request.At}
				}),
				Request: func(GovernedOperation, string, *string, *uint64) authority.DecisionRequest {
					return authority.DecisionRequest{PrincipalID: "principal", Scope: authority.Scope{Type: "organization", ID: "org"}}
				},
			})
			defer restore()
			_, err := AuthorizeGravityNodeCreation(OpCreateProject, "project", &parent, &version)
			if !errors.Is(err, tc.want) || (tc.wantDetail != "" && !strings.Contains(err.Error(), tc.wantDetail)) {
				t.Fatalf("T1 authority cause not preserved: want=%v detail=%q got=%v", tc.want, tc.wantDetail, err)
			}
		})
	}
}

func TestForgedLocalReceiptCannotSatisfyRemoteGate(t *testing.T) {
	remoteDecisionRoot(t)
	root := os.Getenv("BLOOM_NUCLEUS_ROOT")
	if err := os.WriteFile(filepath.Join(root, "project-bindings.json"), []byte(`{"project_bindings":[{"organization_id":"org","tenant_id":"tenant","project_id":"project","principal_id":"forged","evidence_kind":"canonical","valid_until":"2099-01-01T00:00:00Z"}]}`), 0600); err != nil {
		t.Fatal(err)
	}
	called := false
	restore := InstallShadow(&ShadowConfiguration{Connected: true, ProjectBinding: func(context.Context, string) (authority.ProjectBinding, error) {
		called = true
		return authority.ProjectBinding{}, &authority.ProjectClaimError{Code: "project_binding_required"}
	}, Evaluator: evaluatorFunc(func(authority.DecisionRequest) authority.AuthorityDecision {
		return authority.AuthorityDecision{Outcome: authority.DecisionAllow, Reason: "permission_granted"}
	}), Request: func(GovernedOperation, string, *string, *uint64) authority.DecisionRequest {
		return authority.DecisionRequest{PrincipalID: "forged"}
	}})
	defer restore()
	parent, version := "org", uint64(1)
	if _, err := AuthorizeGravityNodeCreation(OpCreateProject, "project", &parent, &version); !errors.Is(err, ErrProjectBindingRequired) || !called {
		t.Fatalf("forged receipt affected gate: %v", err)
	}
}
