package evaluation

import (
	"encoding/json"
	"impact/internal/contracts"
	"os"
	"reflect"
	"testing"
)

func fixture(t *testing.T) contracts.EvaluationRequest {
	t.Helper()
	f, e := os.Open("../../testdata/assessment.json")
	if e != nil {
		t.Fatal(e)
	}
	defer f.Close()
	r, e := Decode(f)
	if e != nil {
		t.Fatal(e)
	}
	return r
}
func TestQuestionsAreDifferent(t *testing.T) {
	r := fixture(t)
	r.Postures[1].Expression = "threshold latency <= 10 ms"
	a, e := Default().Evaluate(r)
	if e != nil || len(a.Findings) != 1 || a.Findings[0].Conclusion != "coexistent" {
		t.Fatalf("%+v %v", a, e)
	}
	r.Question.Type = "preservation"
	a, e = Default().Evaluate(r)
	if e != nil || a.Findings[0].Conclusion != "not_preserved" {
		t.Fatalf("%+v %v", a, e)
	}
	r.Postures[1].Expression = "threshold latency <= 3 ms"
	a, e = Default().Evaluate(r)
	if e != nil || a.Findings[0].Conclusion != "preserved" {
		t.Fatalf("%+v %v", a, e)
	}
	r.Question.Type = "compliance"
	u := "ms"
	r.Snapshot.Facts = []contracts.Fact{{Ref: "obs:1", Metric: "latency", Unit: &u, Value: 4, ObservedAt: "2026-09-14T00:00:00Z"}}
	a, e = Default().Evaluate(r)
	if e != nil || len(a.Findings) != 2 {
		t.Fatalf("%+v %v", a, e)
	}
	results := map[string]bool{}
	for _, f := range a.Findings {
		results[f.Conclusion] = true
	}
	if !results["satisfied"] || !results["violated"] {
		t.Fatal(a)
	}
}
func TestInvalidUnknownAndIncomplete(t *testing.T) {
	r := fixture(t)
	r.Postures[0].Expression = "not a posture"
	if _, e := Default().Evaluate(r); e == nil {
		t.Fatal("malformed criterion accepted")
	}
	r = fixture(t)
	r.Question.Type = "future-question"
	a, e := Default().Evaluate(r)
	if e != nil || a.Coverage.Complete || len(a.Indeterminacy) == 0 {
		t.Fatalf("%+v %v", a, e)
	}
	r = fixture(t)
	r.Postures[0].Expression = "constraint on data :: protect customer information"
	a, e = Default().Evaluate(r)
	if e != nil || a.Coverage.Complete || len(a.Coverage.Undetermined) != 1 {
		t.Fatalf("%+v %v", a, e)
	}
	r = fixture(t)
	r.Snapshot.Complete = false
	a, e = Default().Evaluate(r)
	if e != nil || a.Coverage.Complete || len(a.Findings) == 0 {
		t.Fatalf("partial findings lost: %+v %v", a, e)
	}
}
func TestRepeatPermutationAndIsolation(t *testing.T) {
	r := fixture(t)
	before, _ := json.Marshal(r)
	e := Default()
	a, err := e.Evaluate(r)
	if err != nil {
		t.Fatal(err)
	}
	b, _ := e.Evaluate(r)
	if !reflect.DeepEqual(a, b) {
		t.Fatal("not deterministic")
	}
	after, _ := json.Marshal(r)
	if string(before) != string(after) {
		t.Fatal("mutated input")
	}
	r.Postures[0], r.Postures[1] = r.Postures[1], r.Postures[0]
	b, _ = e.Evaluate(r)
	if !reflect.DeepEqual(a, b) {
		t.Fatal("order changed assessment")
	}
	for i := 0; i < 8; i++ {
		t.Run("parallel", func(t *testing.T) {
			t.Parallel()
			x, err := e.Evaluate(r)
			if err != nil || !reflect.DeepEqual(a, x) {
				t.Fatal("shared state")
			}
		})
	}
}

type future struct{}

func TestUnitsRequireEquivalence(t *testing.T) {
	r := fixture(t)
	r.Postures[1].Expression = "threshold latency >= 1 s"
	for _, question := range []string{"coexistence", "preservation"} {
		r.Question.Type = question
		a, err := Default().Evaluate(r)
		if err != nil || a.Coverage.Complete || len(a.Indeterminacy) == 0 {
			t.Fatalf("%s: %+v %v", question, a, err)
		}
	}
}

func (future) Type() string         { return "future" }
func (future) Version() string      { return "7" }
func (future) QuestionText() string { return "Does this future question hold?" }
func (future) Evaluate(r contracts.EvaluationRequest) (contracts.Assessment, error) {
	return contracts.Assessment{Findings: []contracts.Finding{{Code: "FUTURE", Conclusion: "observed", Basis: "mechanical", References: []string{}, Evidence: []string{string(r.Payload)}}}, Coverage: contracts.Coverage{Complete: true}}, nil
}
func TestExtensionWithoutEnvelopeChange(t *testing.T) {
	e, err := New(future{})
	if err != nil {
		t.Fatal(err)
	}
	r := fixture(t)
	r.Question = contracts.Question{Type: "future", Version: "7"}
	r.Payload = json.RawMessage(`{"new":"data"}`)
	a, err := e.Evaluate(r)
	if err != nil || a.Findings[0].Code != "FUTURE" {
		t.Fatalf("%+v %v", a, err)
	}
	if _, err = New(future{}, future{}); err == nil {
		t.Fatal("duplicate evaluator accepted")
	}
}
func TestPriorityCycleAcrossThreePostures(t *testing.T) {
	r := fixture(t)
	r.Postures = []contracts.Posture{{"org:a@1", "priority a over b for shared", "baseline"}, {"org:b@1", "priority b over c for shared", "candidate"}, {"org:c@1", "priority c over a for shared", "candidate"}}
	a, e := Default().Evaluate(r)
	if e != nil || len(a.Findings) != 1 || a.Findings[0].Code != "PRIORITY_CYCLE" {
		t.Fatalf("%+v %v", a, e)
	}
}
func TestNoVacuousPreservationOrMissingObservationSuccess(t *testing.T) {
	r := fixture(t)
	r.Question.Type = "preservation"
	r.Postures = append(r.Postures, contracts.Posture{"org:other@1", "threshold latency < 3 ms", "candidate"})
	a, e := Default().Evaluate(r)
	if e != nil || a.Coverage.Complete || a.Findings[0].Code != "INCONSISTENT_CANDIDATE" {
		t.Fatalf("%+v %v", a, e)
	}
	r = fixture(t)
	r.Question.Type = "compliance"
	a, e = Default().Evaluate(r)
	if e != nil || a.Coverage.Complete || len(a.Findings) != 0 {
		t.Fatalf("%+v %v", a, e)
	}
}
