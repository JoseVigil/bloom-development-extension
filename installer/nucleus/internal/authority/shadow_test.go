package authority

import (
	"errors"
	"testing"
	"time"
)

type shadowMemory struct {
	records []ShadowRecord
	err     error
}

func (s *shadowMemory) RecordShadow(r ShadowRecord) error {
	s.records = append(s.records, r)
	return s.err
}
func TestShadowPreservesExactLocalValueAndErrorForEveryClass(t *testing.T) {
	sentinel := errors.New("same error")
	committed := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	for _, class := range []OperationClass{ClassCritical, ClassPrivileged, ClassStandard} {
		for _, connected := range []bool{true, false} {
			sink := &shadowMemory{err: errors.New("sink down")}
			value, err, record := PreserveShadow(&struct{ X int }{7}, sentinel, AuthorityDecision{Outcome: DecisionNotEvaluable, Reason: "state_unavailable", AuthorityVersion: "9"}, ShadowInput{"intent.create", class, committed, committed.Add(50 * time.Second), connected}, sink)
			if value.X != 7 || err != sentinel || !record.WouldBlock || record.WouldBlockAt != committed.Add(50*time.Second) || len(sink.records) != 1 {
				t.Fatalf("shadow altered local or missed evidence: %+v", record)
			}
		}
	}
}
func TestShadowAllowAndBeforeThresholdNeverWouldBlock(t *testing.T) {
	at := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		remote   DecisionOutcome
		observed time.Time
	}{{DecisionDeny, at.Add(49 * time.Second)}, {DecisionAllow, at.Add(time.Hour)}} {
		_, _, r := PreserveShadow(42, nil, AuthorityDecision{Outcome: tc.remote, Reason: "test"}, ShadowInput{"op", ClassStandard, at, tc.observed, true}, nil)
		if r.WouldBlock {
			t.Fatalf("unexpected would-block: %+v", r)
		}
	}
}

func TestShadowInvalidRemoteCandidateIsNotEvaluable(t *testing.T) {
	at := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	value, err, record := PreserveShadow("local", nil, AuthorityDecision{}, ShadowInput{Operation: "intent.create", Class: ClassStandard, ObservedAt: at, Connected: false}, nil)
	if value != "local" || err != nil || record.RemoteOutcome != DecisionNotEvaluable || record.RemoteReason != "remote_decision_invalid" || record.WouldBlock {
		t.Fatalf("invalid candidate changed local or became authority: %+v", record)
	}
}
