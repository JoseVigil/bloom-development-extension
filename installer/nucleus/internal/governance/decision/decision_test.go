package decision

import (
	"nucleus/internal/authority"
	"os"
	"path/filepath"
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
