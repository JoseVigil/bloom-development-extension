package authority

import (
	"path/filepath"
	"testing"
	"time"
)

func TestObservationDurableDeduplicatedAndAggregated(t *testing.T) {
	path := filepath.Join(t.TempDir(), "observation.json")
	start := time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC)
	accept := int64(12000)
	would := int64(50000)
	s := &ObservationStore{Path: path, Now: func() time.Time { return start }}
	e := ObservationEvent{EventID: "e1", Kind: ObservationAcceptance, OrganizationID: "org", InstallationID: "installation", AuthorityVersion: "2", ObservedAt: start.Add(time.Hour), CommitToAcceptanceMS: &accept}
	if err := s.Append(e); err != nil {
		t.Fatal(err)
	}
	if err := s.Append(e); err != nil {
		t.Fatal(err)
	}
	if err := s.Append(ObservationEvent{EventID: "e2", Kind: ObservationDivergence, OrganizationID: "org", InstallationID: "installation", Operation: "intent.create", Class: ClassStandard, Outcome: DecisionDeny, Reason: "permission_not_granted", ObservedAt: start.Add(2 * time.Hour), CommitToWouldBlockMS: &would}); err != nil {
		t.Fatal(err)
	}
	restarted := &ObservationStore{Path: path}
	events, err := restarted.Events()
	if err != nil || len(events) != 2 {
		t.Fatalf("restart events=%d err=%v", len(events), err)
	}
	summary, err := restarted.Summarize(start, start.Add(24*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if summary.Total != 2 || summary.Counts["acceptance"] != 1 || summary.Counts["divergence"] != 1 || !summary.SimulatedTwentyFourHours || *summary.MaxCommitToAcceptanceMS != 12000 || *summary.MaxCommitToWouldBlockMS != 50000 {
		t.Fatalf("summary %+v", summary)
	}
}
func TestObservationRejectsConflictCorruptionAndInvalidWindow(t *testing.T) {
	path := filepath.Join(t.TempDir(), "observation.json")
	s := &ObservationStore{Path: path}
	at := time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC)
	e := ObservationEvent{EventID: "e", Kind: ObservationFailure, OrganizationID: "o", InstallationID: "i", ObservedAt: at}
	if err := s.Append(e); err != nil {
		t.Fatal(err)
	}
	e.Reason = "changed"
	if err := s.Append(e); err == nil {
		t.Fatal("conflicting duplicate accepted")
	}
	if _, err := s.Summarize(at, at); err == nil {
		t.Fatal("invalid window accepted")
	}
}
func TestObservationShadowDoesNotChangeLocalResult(t *testing.T) {
	s := &ObservationStore{Path: filepath.Join(t.TempDir(), "observation.json")}
	at := time.Date(2026, 9, 10, 1, 0, 0, 0, time.UTC)
	localErr := &struct{ error }{error: nil}
	value, got, record := PreserveShadow("local", localErr, AuthorityDecision{Outcome: DecisionNotEvaluable, Reason: "required_control_absent:gravity", AuthorityVersion: "8"}, ShadowInput{Operation: "intent.create", Class: ClassStandard, CommittedAt: at.Add(-time.Minute), ObservedAt: at, Connected: false}, s)
	if value != "local" || got != localErr || !record.WouldBlock {
		t.Fatalf("shadow changed local result: %q %v %+v", value, got, record)
	}
	events, err := s.Events()
	if err != nil || len(events) != 1 || events[0].Kind != ObservationNotEvaluable {
		t.Fatalf("events %+v err=%v", events, err)
	}
}
