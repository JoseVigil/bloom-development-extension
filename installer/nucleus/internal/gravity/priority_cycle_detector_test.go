package gravity

import (
	"encoding/json"
	"reflect"
	"testing"
)

// priorityPosture builds a ResolvedPosture whose GravityRule.Expression is
// the JSON-string-encoded raw expression text, exactly as decodePriorityNode
// expects it (see the decision documented at the top of
// priority_cycle_detector.go). Building fixtures through the real Parse()
// pipeline — rather than constructing PriorityNode literals by hand — keeps
// these tests honest about what DetectPriorityCycles actually consumes.
func priorityPosture(t *testing.T, ruleID, nodeID, expression string) ResolvedPosture {
	t.Helper()
	encoded, err := json.Marshal(expression)
	if err != nil {
		t.Fatal(err)
	}
	return ResolvedPosture{
		GravityRule: GravityRule{
			RuleID:     ruleID,
			Primitive:  "priority",
			Expression: encoded,
			AppliesTo:  []string{"*"},
			Status:     "active",
		},
		NodeType: NodeMandate,
		NodeID:   nodeID,
	}
}

// assertClosedCycle checks that a reported cycle is a genuine closed loop:
// each edge's Lower feeds the next edge's Higher, wrapping around.
func assertClosedCycle(t *testing.T, cycle []PriorityCycleEdge) {
	t.Helper()
	if len(cycle) == 0 {
		t.Fatal("cycle is empty")
	}
	for i, edge := range cycle {
		next := cycle[(i+1)%len(cycle)]
		if edge.Lower != next.Higher {
			t.Fatalf("cycle not closed at index %d: %+v", i, cycle)
		}
	}
}

func TestDetectPriorityCyclesNoCycleWhenChainIsAcyclic(t *testing.T) {
	postures := []ResolvedPosture{
		priorityPosture(t, "r1", "n1", "priority alpha over beta for scope_x"),
		priorityPosture(t, "r2", "n1", "priority beta over gamma for scope_x"),
	}
	findings := DetectPriorityCycles(postures)
	if len(findings) != 0 {
		t.Fatalf("expected no findings for an acyclic chain, got %+v", findings)
	}
}

func TestDetectPriorityCyclesConfirmsSimpleTwoCycle(t *testing.T) {
	postures := []ResolvedPosture{
		priorityPosture(t, "r1", "n1", "priority alpha over beta for scope_x"),
		priorityPosture(t, "r2", "n2", "priority beta over alpha for scope_x"),
	}
	findings := DetectPriorityCycles(postures)
	if len(findings) != 1 {
		t.Fatalf("expected exactly one finding, got %d: %+v", len(findings), findings)
	}
	f := findings[0]
	if f.Category != PriorityCycleCategory || f.Subtype != PriorityCycleSubtype {
		t.Fatalf("unexpected category/subtype: %+v", f)
	}
	if f.CollisionClass == nil || *f.CollisionClass != "scope_x" {
		t.Fatalf("unexpected collision class: %+v", f.CollisionClass)
	}
	if len(f.Cycle) != 2 {
		t.Fatalf("expected cycle length 2, got %d: %+v", len(f.Cycle), f.Cycle)
	}
	assertClosedCycle(t, f.Cycle)
	if !reflect.DeepEqual(f.RuleIDs, []string{"r1", "r2"}) {
		t.Fatalf("unexpected ruleIds: %+v", f.RuleIDs)
	}
	if !reflect.DeepEqual(f.NodeIDs, []string{"n1", "n2"}) {
		t.Fatalf("unexpected nodeIds: %+v", f.NodeIDs)
	}
	if f.DetectedAt == "" {
		t.Fatal("expected a non-empty detection instant")
	}
}

func TestDetectPriorityCyclesConfirmsThreeCycle(t *testing.T) {
	postures := []ResolvedPosture{
		priorityPosture(t, "r1", "n1", "priority alpha over beta for scope_x"),
		priorityPosture(t, "r2", "n1", "priority beta over gamma for scope_x"),
		priorityPosture(t, "r3", "n1", "priority gamma over alpha for scope_x"),
	}
	findings := DetectPriorityCycles(postures)
	if len(findings) != 1 {
		t.Fatalf("expected exactly one finding, got %d: %+v", len(findings), findings)
	}
	if len(findings[0].Cycle) != 3 {
		t.Fatalf("expected cycle length 3, got %d: %+v", len(findings[0].Cycle), findings[0].Cycle)
	}
	assertClosedCycle(t, findings[0].Cycle)
}

func TestDetectPriorityCyclesIsolatesDistinctCollisionClasses(t *testing.T) {
	// alpha>beta under scope_x and beta>alpha under scope_y would form a
	// 2-cycle if merged into one graph. Grouping by CollisionClass must keep
	// them apart, so no finding should be reported.
	postures := []ResolvedPosture{
		priorityPosture(t, "r1", "n1", "priority alpha over beta for scope_x"),
		priorityPosture(t, "r2", "n2", "priority beta over alpha for scope_y"),
	}
	findings := DetectPriorityCycles(postures)
	if len(findings) != 0 {
		t.Fatalf("expected collision classes to stay isolated, got %+v", findings)
	}
}

func TestDetectPriorityCyclesCatchesInternalCycleWithinOneExpression(t *testing.T) {
	// A single `priority` expression can declare more than one pair
	// (priority_order allows repetition). §3.4's "incluso dentro del mismo
	// nodo" case: one posture alone contradicts itself.
	postures := []ResolvedPosture{
		priorityPosture(t, "r1", "n1", "priority alpha over beta, beta over alpha for scope_x"),
	}
	findings := DetectPriorityCycles(postures)
	if len(findings) != 1 {
		t.Fatalf("expected exactly one finding for an internally contradictory expression, got %d: %+v", len(findings), findings)
	}
	assertClosedCycle(t, findings[0].Cycle)
	if !reflect.DeepEqual(findings[0].RuleIDs, []string{"r1"}) {
		t.Fatalf("unexpected ruleIds: %+v", findings[0].RuleIDs)
	}
}

func TestDetectPriorityCyclesIsolatesUnclassifiedPostures(t *testing.T) {
	// Two separate postures with no "for X" clause (CollisionClass == nil)
	// that would form a cycle if merged must NOT be compared against each
	// other — see the CollisionClass == nil decision documented in
	// priority_cycle_detector.go.
	postures := []ResolvedPosture{
		priorityPosture(t, "r1", "n1", "priority alpha over beta"),
		priorityPosture(t, "r2", "n2", "priority beta over alpha"),
	}
	findings := DetectPriorityCycles(postures)
	if len(findings) != 0 {
		t.Fatalf("expected unclassified postures to stay isolated from each other, got %+v", findings)
	}
}

func TestDetectPriorityCyclesNonPriorityAndUnparseableRulesAreIgnored(t *testing.T) {
	thresholdExpr, err := json.Marshal("threshold coverage_pct >= 80")
	if err != nil {
		t.Fatal(err)
	}
	postures := []ResolvedPosture{
		// Wrong primitive: must be skipped even though Expression parses fine.
		{GravityRule: GravityRule{RuleID: "r1", Primitive: "threshold", Expression: thresholdExpr, Status: "active"}, NodeID: "n1"},
		// Missing expression entirely.
		{GravityRule: GravityRule{RuleID: "r2", Primitive: "priority", Status: "active"}, NodeID: "n2"},
		// A real cycle mixed in, to confirm the noise above doesn't suppress it.
		priorityPosture(t, "r3", "n3", "priority alpha over beta for scope_x"),
		priorityPosture(t, "r4", "n4", "priority beta over alpha for scope_x"),
	}
	findings := DetectPriorityCycles(postures)
	if len(findings) != 1 {
		t.Fatalf("expected exactly one finding, got %d: %+v", len(findings), findings)
	}
}
