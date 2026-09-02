package gravity

import (
	"encoding/json"
	"testing"
)

// thresholdPosture builds a ResolvedPosture whose GravityPosture.Expression
// is the JSON-string-encoded raw expression text, exactly as
// decodeThresholdNode expects it (see priorityPosture's identical rationale
// in priority_cycle_detector_test.go: building fixtures through the real
// Parse() pipeline, rather than constructing ThresholdNode literals by
// hand, keeps these tests honest about what DetectThresholdUnsatisfiable
// actually consumes).
func thresholdPosture(t *testing.T, postureID, nodeID, expression string) ResolvedPosture {
	t.Helper()
	encoded, err := json.Marshal(expression)
	if err != nil {
		t.Fatal(err)
	}
	return ResolvedPosture{
		GravityPosture: GravityPosture{
			PostureID:  postureID,
			Primitive:  "threshold",
			Expression: encoded,
			AppliesTo:  []string{"*"},
			Status:     "active",
		},
		NodeType: NodeMandate,
		NodeID:   nodeID,
	}
}

func TestDetectThresholdUnsatisfiableNoConflictWhenRangesOverlap(t *testing.T) {
	// x > 0 and x < 100 share the open interval (0, 100): satisfiable.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold x > 0"),
		thresholdPosture(t, "r2", "n2", "threshold x < 100"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 0 {
		t.Fatalf("expected no findings for an overlapping range, got %+v", findings)
	}
}

func TestDetectThresholdUnsatisfiableConfirmsSimpleTwoConflict(t *testing.T) {
	// x > 10 and x < 5: the required lower bound exceeds the required upper
	// bound, so no real value satisfies both.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold x > 10"),
		thresholdPosture(t, "r2", "n2", "threshold x < 5"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 1 {
		t.Fatalf("expected exactly one finding, got %d: %+v", len(findings), findings)
	}
	f := findings[0]
	if f.Category != ThresholdUnsatisfiableCategory || f.Subtype != ThresholdUnsatisfiableSubtype {
		t.Fatalf("unexpected category/subtype: %+v", f)
	}
	if f.Metric != "x" {
		t.Fatalf("unexpected metric: %+v", f)
	}
	if f.Unit != nil {
		t.Fatalf("expected nil unit, got %+v", f.Unit)
	}
	if len(f.Conflict) != 2 {
		t.Fatalf("expected a 2-constraint minimal witness, got %d: %+v", len(f.Conflict), f.Conflict)
	}
	if f.PostureIDs[0] != "r1" || f.PostureIDs[1] != "r2" {
		t.Fatalf("unexpected postureIds: %+v", f.PostureIDs)
	}
	if f.NodeIDs[0] != "n1" || f.NodeIDs[1] != "n2" {
		t.Fatalf("unexpected nodeIds: %+v", f.NodeIDs)
	}
	if f.DetectedAt == "" {
		t.Fatal("expected a non-empty detection instant")
	}
}

func TestDetectThresholdUnsatisfiableIsolatesDistinctMetrics(t *testing.T) {
	// x > 10 and y < 5 would conflict if merged into one group, but they
	// name different metrics: grouping must keep them apart.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold x > 10"),
		thresholdPosture(t, "r2", "n2", "threshold y < 5"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 0 {
		t.Fatalf("expected distinct metrics to stay isolated, got %+v", findings)
	}
}

func TestDetectThresholdUnsatisfiableIsolatesDistinctUnits(t *testing.T) {
	// Same metric, but declared in two different units. Nothing in this AST
	// authorizes converting between them, so this cowork's grouping
	// decision keeps them apart rather than asserting they're comparable —
	// the AST-level analogue of "non-comparable dimensions": out of scope
	// for mechanical confirmation, not reported as UNDECIDABLE_CANDIDATE
	// either, mirroring PRIORITY_CYCLE's choice to only ever emit
	// CONFIRMED_COLLISION shapes and stay silent otherwise.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold latency > 10 ms"),
		thresholdPosture(t, "r2", "n2", "threshold latency < 5 s"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 0 {
		t.Fatalf("expected distinct units to stay isolated, got %+v", findings)
	}
}

func TestDetectThresholdUnsatisfiableIsolatesNilUnitFromConcreteUnit(t *testing.T) {
	// Same metric, one posture declares no unit and the other declares one.
	// Per the grouping key decision, a nil Unit is never merged with a
	// concrete Unit.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold latency > 10"),
		thresholdPosture(t, "r2", "n2", "threshold latency < 5 ms"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 0 {
		t.Fatalf("expected a nil unit to stay isolated from a concrete unit, got %+v", findings)
	}
}

func TestDetectThresholdUnsatisfiableMatchingUnitsConfirm(t *testing.T) {
	// Same metric, same declared unit on both sides: the conflict is
	// confirmable.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold latency > 10 ms"),
		thresholdPosture(t, "r2", "n2", "threshold latency < 5 ms"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 1 {
		t.Fatalf("expected exactly one finding, got %d: %+v", len(findings), findings)
	}
	if findings[0].Unit == nil || *findings[0].Unit != "ms" {
		t.Fatalf("unexpected unit: %+v", findings[0].Unit)
	}
}

func TestDetectThresholdUnsatisfiableEqualityAgainstBound(t *testing.T) {
	// x == 20 cannot coexist with x < 10 for the same metric.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold x == 20"),
		thresholdPosture(t, "r2", "n2", "threshold x < 10"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 1 {
		t.Fatalf("expected exactly one finding, got %d: %+v", len(findings), findings)
	}
}

func TestDetectThresholdUnsatisfiableConflictingEqualities(t *testing.T) {
	// x == 20 and x == 30 cannot both hold.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold x == 20"),
		thresholdPosture(t, "r2", "n2", "threshold x == 30"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 1 {
		t.Fatalf("expected exactly one finding, got %d: %+v", len(findings), findings)
	}
}

func TestDetectThresholdUnsatisfiableEqualityAndExclusionCollide(t *testing.T) {
	// x == 20 and x != 20 cannot both hold.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold x == 20"),
		thresholdPosture(t, "r2", "n2", "threshold x != 20"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 1 {
		t.Fatalf("expected exactly one finding, got %d: %+v", len(findings), findings)
	}
}

func TestDetectThresholdUnsatisfiableExclusionAloneNeverConflicts(t *testing.T) {
	// x != 20 and x != 30 exclude two points from an otherwise unbounded
	// line: infinitely many values still satisfy both.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold x != 20"),
		thresholdPosture(t, "r2", "n2", "threshold x != 30"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 0 {
		t.Fatalf("expected no finding for exclusions alone, got %+v", findings)
	}
}

func TestDetectThresholdUnsatisfiableDegenerateIntervalExcluded(t *testing.T) {
	// x >= 5 and x <= 5 pin the interval to the single point {5}; x != 5
	// then removes that only remaining point.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold x >= 5"),
		thresholdPosture(t, "r2", "n2", "threshold x <= 5"),
		thresholdPosture(t, "r3", "n3", "threshold x != 5"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 1 {
		t.Fatalf("expected exactly one finding, got %d: %+v", len(findings), findings)
	}
	if len(findings[0].Conflict) != 3 {
		t.Fatalf("expected a 3-constraint minimal witness, got %d: %+v", len(findings[0].Conflict), findings[0].Conflict)
	}
}

func TestDetectThresholdUnsatisfiableDegenerateIntervalWithoutExclusionIsSatisfiable(t *testing.T) {
	// x >= 5 and x <= 5 alone still leave the single point {5} satisfiable.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold x >= 5"),
		thresholdPosture(t, "r2", "n2", "threshold x <= 5"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 0 {
		t.Fatalf("expected the closed single point to be satisfiable, got %+v", findings)
	}
}

func TestDetectThresholdUnsatisfiableOpenSinglePointIsUnsatisfiable(t *testing.T) {
	// x > 5 and x <= 5 share only the boundary point 5, but the lower bound
	// excludes it: empty interval.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold x > 5"),
		thresholdPosture(t, "r2", "n2", "threshold x <= 5"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 1 {
		t.Fatalf("expected exactly one finding, got %d: %+v", len(findings), findings)
	}
}

func TestDetectThresholdUnsatisfiableNonThresholdAndUnparseablePosturesAreIgnored(t *testing.T) {
	priorityExpr, err := json.Marshal("priority alpha over beta")
	if err != nil {
		t.Fatal(err)
	}
	postures := []ResolvedPosture{
		// Wrong primitive: must be skipped even though Expression parses fine.
		{GravityPosture: GravityPosture{PostureID: "r1", Primitive: "priority", Expression: priorityExpr, Status: "active"}, NodeID: "n1"},
		// Missing expression entirely.
		{GravityPosture: GravityPosture{PostureID: "r2", Primitive: "threshold", Status: "active"}, NodeID: "n2"},
		// A real conflict mixed in, to confirm the noise above doesn't suppress it.
		thresholdPosture(t, "r3", "n3", "threshold x > 10"),
		thresholdPosture(t, "r4", "n4", "threshold x < 5"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 1 {
		t.Fatalf("expected exactly one finding, got %d: %+v", len(findings), findings)
	}
}

func TestDetectThresholdUnsatisfiableTighterBoundsWinAtValueTie(t *testing.T) {
	// Two lower bounds tie on value (10): the strict ">" must win over the
	// inclusive ">=" as the tighter constraint. Combined with "<= 10", the
	// interval collapses to the single, excluded-by-strictness point 10.
	postures := []ResolvedPosture{
		thresholdPosture(t, "r1", "n1", "threshold x >= 10"),
		thresholdPosture(t, "r2", "n2", "threshold x > 10"),
		thresholdPosture(t, "r3", "n3", "threshold x <= 10"),
	}
	findings := DetectThresholdUnsatisfiable(postures)
	if len(findings) != 1 {
		t.Fatalf("expected exactly one finding, got %d: %+v", len(findings), findings)
	}
	// The witness must cite the strict ">" bound (r2), not the looser ">=" (r1).
	sawR2 := false
	for _, id := range findings[0].PostureIDs {
		if id == "r2" {
			sawR2 = true
		}
		if id == "r1" {
			t.Fatalf("expected the looser >= 10 bound (r1) to lose to the strict > 10 bound, got %+v", findings[0].PostureIDs)
		}
	}
	if !sawR2 {
		t.Fatalf("expected the strict > 10 bound (r2) in the witness, got %+v", findings[0].PostureIDs)
	}
}
