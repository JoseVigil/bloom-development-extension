package workflows

import (
	"errors"
	"nucleus/internal/authority"
	authoritydecision "nucleus/internal/governance/decision"
	"os"
	"path/filepath"
	"testing"
	"time"
)

type gateEvaluator struct{ decision authority.AuthorityDecision }

func (e gateEvaluator) Evaluate(authority.DecisionRequest) authority.AuthorityDecision {
	return e.decision
}

type gateSink struct{ records []authority.ShadowRecord }

func (s *gateSink) RecordShadow(r authority.ShadowRecord) error {
	s.records = append(s.records, r)
	return nil
}
func sealedGateDecision(t *testing.T, outcome authority.DecisionOutcome) authoritydecision.GovernedCreationDecision {
	t.Helper()
	root := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", root)
	ownership := `{"org_id":"org","owner_id":"owner","owner_name":"Owner","created_at":"2026-09-10T00:00:00Z","signed_hash":"","team_members":[]}`
	if err := os.WriteFile(filepath.Join(root, ".ownership.json"), []byte(ownership), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".master"), []byte("master"), 0600); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 10, 10, 0, 50, 0, time.UTC)
	restore := authoritydecision.InstallShadow(&authoritydecision.ShadowConfiguration{Evaluator: gateEvaluator{authority.AuthorityDecision{Outcome: outcome, Reason: "fixture", AuthorityVersion: "4"}}, Request: func(authoritydecision.GovernedOperation, string, *string, *uint64) authority.DecisionRequest {
		return authority.DecisionRequest{Operation: "intent.create"}
	}, Now: func() time.Time { return now }, CommittedAt: func(authority.AuthorityDecision) time.Time { return now.Add(-time.Minute) }, Connected: true})
	defer restore()
	decision, err := authoritydecision.AuthorizeGravityNodeCreation(authoritydecision.OpCreateOrganization, "org", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	return decision
}
func TestSystemGatePreservesLocalAllowDenyAndErrorAcrossRemoteShadow(t *testing.T) {
	for _, outcome := range []authority.DecisionOutcome{authority.DecisionAllow, authority.DecisionDeny, authority.DecisionNotEvaluable} {
		decision := sealedGateDecision(t, outcome)
		for _, local := range []error{nil, errors.New("local deny"), errors.New("local failure")} {
			sink := &gateSink{}
			got := ApplyGovernedSystemGate(local, decision, sink)
			if got != local {
				t.Fatalf("local result identity changed: %v %v", local, got)
			}
			if len(sink.records) != 1 || sink.records[0].RemoteOutcome != outcome {
				t.Fatalf("shadow evidence missing: %+v", sink.records)
			}
		}
	}
}
func TestSystemGateWithoutShadowEvidenceKeepsLocalResult(t *testing.T) {
	decision := sealedGateDecision(t, authority.DecisionAllow)
	local := errors.New("local")
	if got := ApplyGovernedSystemGate(local, decision, nil); got != local {
		t.Fatal("nil recorder changed local result")
	}
}
