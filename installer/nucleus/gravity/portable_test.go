package gravity

import (
	"encoding/json"
	internal "nucleus/internal/gravity"
	"reflect"
	"testing"
)

func TestBoundaryRetainsDetectorSemanticsAndRemovesClock(t *testing.T) {
	cs := []Criterion{{"org:a@1", "threshold x <= 5"}, {"org:b@1", "threshold x >= 10"}}
	a, e := AnalyzeJoint(cs)
	if e != nil {
		t.Fatal(e)
	}
	b, e := AnalyzeJoint(cs)
	if e != nil || !reflect.DeepEqual(a, b) {
		t.Fatal("unstable boundary")
	}
	rs := []internal.ResolvedPosture{}
	for _, c := range cs {
		raw, _ := json.Marshal(c.Expression)
		rs = append(rs, internal.ResolvedPosture{GravityPosture: internal.GravityPosture{PostureID: c.Ref, Primitive: "threshold", Expression: raw}, NodeID: c.Ref})
	}
	f := internal.DetectThresholdUnsatisfiable(rs)
	if len(a.Conflicts) != len(f) || a.Conflicts[0].Code != f[0].Subtype || !reflect.DeepEqual(a.Conflicts[0].References, f[0].PostureIDs) {
		t.Fatal("divergence")
	}
}
func TestBoundaryRejectsInvalidAndMarksUnknown(t *testing.T) {
	if _, e := AnalyzeJoint([]Criterion{{"a", "bad"}}); e == nil {
		t.Fatal("invalid accepted")
	}
	a, e := AnalyzeJoint([]Criterion{{"a", "priority a over b"}})
	if e != nil || len(a.Undetermined) != 1 {
		t.Fatal(a, e)
	}
}
