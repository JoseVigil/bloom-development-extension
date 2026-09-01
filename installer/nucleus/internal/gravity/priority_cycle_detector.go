package gravity

import (
	"encoding/json"
	"sort"
	"time"
)

// This file implements detection of the PRIORITY_CYCLE subtype ONLY, out of
// the taxonomy proposed by
// docs/ANAYSIS/GRAVITY/COLISIONES/Orbital_Gravity_Deteccion_Tipificacion_Colisiones_Mandates_Posturas_Spec_v0_1.md
// ("Spec-Colisiones"). This is a deliberately narrow cowork, ratified by the
// control session for exactly this subtype (Spec-Colisiones §9.4). No other
// subtype of POSTURE_HORIZONTAL_INCOMPATIBILITY, no MANDATE_TERRITORY_OVERLAP,
// no POSTURE_HIERARCHICAL_CONTRADICTION, and no ArbitrationEvent producer or
// consumer are implemented here. Nothing here reads or writes disk, wires to
// a Workflow/activity/CLI/endpoint, or adds an edge type to GravityGraph.
//
// §3.3/§3.4 reading (see closing report for the full rationale). Spec-Colisiones
// names PRIORITY_CYCLE twice: as a subtype of POSTURE_HORIZONTAL_INCOMPATIBILITY
// (§3.3, cross-posture) and as POSTURE_INTERNAL_PRECEDENCE_CONFLICT (§3.4,
// "incluso dentro del mismo nodo"). This implementation treats them as ONE
// mechanical check: the transitive closure of Higher->Lower relations across
// every active PriorityNode sharing a CollisionClass, regardless of whether
// the pairs originated in the same GravityRule/node or in different ones. A
// cycle entirely inside a single expression (e.g. "A over B, B over A"
// declared in one `priority` posture) is caught the same way a cycle
// spanning two different postures is — see TestDetectPriorityCyclesCatchesInternalCycleWithinOneExpression.
//
// CollisionClass == nil decision. Spec-Colisiones §4.1/§4.3 groups priority
// candidates by a shared CollisionClass so unrelated `priority` postures are
// never compared. CollisionClass is optional in the grammar ("for IDENT" is
// optional for priority_expr per the Grammar spec §2.6/WF-3), and
// Spec-Colisiones leaves open what happens when it's absent. This
// implementation isolates each CollisionClass==nil PriorityNode into its own
// singleton group: it is checked for cycles against its own Order pairs only
// (catching an internal contradiction inside one unclassified expression),
// but is never compared against any other node — classed or unclassified.
// Rationale: the absence of a declared CollisionClass gives no structural
// basis for asserting that two unclassified priority relations govern the
// same conflict; merging every nil-class node into one shared group (an
// alternative reading of the spec's own suggested example) risks a
// false-positive cycle between two postures that happen to reuse the same
// identifiers for unrelated purposes. This is a narrow decision for this
// function only — it does not resolve COLLISION-CATALOG-01.

// PriorityCycleFinding is the CONFIRMED_COLLISION shape this function
// produces for one confirmed PRIORITY_CYCLE (Spec-Colisiones §4.2, §6.2). It
// is intentionally narrower than the general ArbitrationEvent input shape
// that ARBITRATION-EVENT-INPUT-01 would require (§9.1) — only what this
// subtype needs.
type PriorityCycleFinding struct {
	Category       string              `json:"category"`
	Subtype        string              `json:"subtype"`
	CollisionClass *string             `json:"collisionClass"`
	Cycle          []PriorityCycleEdge `json:"cycle"`
	RuleIDs        []string            `json:"ruleIds"`
	NodeIDs        []string            `json:"nodeIds"`
	DetectedAt     string              `json:"detectedAt"`
}

// PriorityCycleEdge is one Higher->Lower relation participating in a
// confirmed cycle, together with the GravityRule/GravityNode it came from.
type PriorityCycleEdge struct {
	Higher string `json:"higher"`
	Lower  string `json:"lower"`
	RuleID string `json:"ruleId"`
	NodeID string `json:"nodeId"`
}

const (
	// PriorityCycleCategory names the parent taxonomy category (Spec-Colisiones §3.3).
	PriorityCycleCategory = "POSTURE_HORIZONTAL_INCOMPATIBILITY"
	// PriorityCycleSubtype names this specific subtype (Spec-Colisiones §3.3/§3.4).
	PriorityCycleSubtype = "PRIORITY_CYCLE"
)

// DetectPriorityCycles finds PRIORITY_CYCLE collisions (Spec-Colisiones
// §3.3/§3.4) among a set of already-resolved, already-active postures — the
// shape Store.ResolveActive already produces (resolver.go, []ResolvedPosture).
// It is pure: no filesystem, no network, no mutation of its input, and no
// dependency on anything outside the arguments except the wall clock used to
// stamp DetectedAt.
func DetectPriorityCycles(postures []ResolvedPosture) []PriorityCycleFinding {
	groups := groupPriorityPostures(postures)
	detectedAt := time.Now().UTC().Format(time.RFC3339Nano)

	var findings []PriorityCycleFinding
	for _, group := range groups {
		findings = append(findings, detectCyclesInGroup(group, detectedAt)...)
	}
	return findings
}

// priorityEdge is one Higher->Lower pair together with the posture it came
// from, flattened out of a PriorityNode.Order for graph construction.
type priorityEdge struct {
	Higher, Lower  string
	RuleID, NodeID string
}

// priorityGroup is the set of priority edges that are comparable against
// each other because they share a CollisionClass (or, for CollisionClass ==
// nil, because they came from the very same PriorityNode — see the
// CollisionClass == nil decision above).
type priorityGroup struct {
	collisionClass *string
	edges          []priorityEdge
	// order lists every identifier seen in this group, in first-appearance
	// order, so cycle detection is deterministic regardless of Go's
	// randomized map iteration.
	order     []string
	seenNodes map[string]bool
}

func newPriorityGroup(collisionClass *string) *priorityGroup {
	return &priorityGroup{collisionClass: collisionClass, seenNodes: map[string]bool{}}
}

func (g *priorityGroup) addPair(pair PriorityPair, ruleID, nodeID string) {
	for _, ident := range [2]string{pair.Higher, pair.Lower} {
		if !g.seenNodes[ident] {
			g.seenNodes[ident] = true
			g.order = append(g.order, ident)
		}
	}
	g.edges = append(g.edges, priorityEdge{Higher: pair.Higher, Lower: pair.Lower, RuleID: ruleID, NodeID: nodeID})
}

// groupPriorityPostures decodes every active posture's expression, keeps
// only PriorityNode ASTs, and groups their Order pairs per the
// CollisionClass == nil decision documented above. Group order follows
// first-encounter order in the input slice, so downstream processing (and
// therefore the findings slice) is deterministic for a given input.
func groupPriorityPostures(postures []ResolvedPosture) []*priorityGroup {
	var groups []*priorityGroup
	classIndex := map[string]int{}

	for _, posture := range postures {
		node, ok := decodePriorityNode(posture.GravityRule)
		if !ok {
			continue
		}
		var group *priorityGroup
		if node.CollisionClass == nil {
			group = newPriorityGroup(nil)
			groups = append(groups, group)
		} else {
			key := *node.CollisionClass
			if idx, exists := classIndex[key]; exists {
				group = groups[idx]
			} else {
				group = newPriorityGroup(node.CollisionClass)
				classIndex[key] = len(groups)
				groups = append(groups, group)
			}
		}
		for _, pair := range node.Order {
			group.addPair(pair, posture.RuleID, posture.NodeID)
		}
	}
	return groups
}

// decodePriorityNode extracts a PriorityNode from a GravityRule, if and only
// if the rule's Primitive is "priority" and its Expression decodes and
// parses to a PriorityNode. Anything else (a different primitive, a missing
// or malformed Expression, an expression that fails to parse) is discarded,
// not reported as an error: this function assumes it is only ever handed
// already-active postures that were already validated at postulation time
// (Parse() runs there); a single malformed entry must not block cycle
// detection for the rest of the active set.
//
// GravityRule.Expression is documented (Grammar spec §2.10) as governing
// exclusively the content of `gravityRules[].expression: string` — i.e. the
// verbatim expression text, JSON-encoded as a string. There is no existing
// call site in the repository that decodes it yet, so this is this cowork's
// own decision, made explicit here rather than left implicit.
func decodePriorityNode(rule GravityRule) (PriorityNode, bool) {
	if rule.Primitive != "priority" || len(rule.Expression) == 0 {
		return PriorityNode{}, false
	}
	var raw string
	if err := json.Unmarshal(rule.Expression, &raw); err != nil {
		return PriorityNode{}, false
	}
	ast, err := Parse(raw)
	if err != nil {
		return PriorityNode{}, false
	}
	node, ok := ast.(PriorityNode)
	return node, ok
}

// detectCyclesInGroup runs Tarjan's SCC algorithm over one group's directed
// Higher->Lower graph and emits one PriorityCycleFinding per non-trivial
// strongly connected component (size >= 2), each carrying one concrete
// witness cycle found within that component. A group may contain more edges
// than any single cycle needs; reporting one witness per SCC avoids
// enumerating every elementary cycle (which is exponential in the worst
// case) while still confirming — with a real, closed, structural cycle — the
// incompatibility that component represents.
func detectCyclesInGroup(group *priorityGroup, detectedAt string) []PriorityCycleFinding {
	edgesBySource := map[string][]priorityEdge{}
	for _, edge := range group.edges {
		edgesBySource[edge.Higher] = append(edgesBySource[edge.Higher], edge)
	}
	sccs := tarjanSCCs(edgesBySource, group.order)

	var findings []PriorityCycleFinding
	for _, scc := range sccs {
		if len(scc) < 2 {
			continue
		}
		sccSet := make(map[string]bool, len(scc))
		for _, ident := range scc {
			sccSet[ident] = true
		}
		cycle := findWitnessCycle(edgesBySource, sccSet, scc[0])
		if len(cycle) == 0 {
			// Unreachable for a genuine SCC of size >= 2, kept defensively.
			continue
		}
		findings = append(findings, buildFinding(group.collisionClass, cycle, detectedAt))
	}
	return findings
}

func buildFinding(collisionClass *string, cycleEdges []priorityEdge, detectedAt string) PriorityCycleFinding {
	cycle := make([]PriorityCycleEdge, len(cycleEdges))
	ruleSet := map[string]bool{}
	nodeSet := map[string]bool{}
	for i, edge := range cycleEdges {
		cycle[i] = PriorityCycleEdge{Higher: edge.Higher, Lower: edge.Lower, RuleID: edge.RuleID, NodeID: edge.NodeID}
		ruleSet[edge.RuleID] = true
		nodeSet[edge.NodeID] = true
	}
	return PriorityCycleFinding{
		Category:       PriorityCycleCategory,
		Subtype:        PriorityCycleSubtype,
		CollisionClass: collisionClass,
		Cycle:          cycle,
		RuleIDs:        sortedSetKeys(ruleSet),
		NodeIDs:        sortedSetKeys(nodeSet),
		DetectedAt:     detectedAt,
	}
}

func sortedSetKeys(set map[string]bool) []string {
	keys := make([]string, 0, len(set))
	for key := range set {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// tarjanSCCs computes strongly connected components of the directed graph
// described by edgesBySource, visiting nodes in the deterministic order
// given by `order` (every identifier that appears in the group, in
// first-appearance order) rather than ranging over a map.
func tarjanSCCs(edgesBySource map[string][]priorityEdge, order []string) [][]string {
	state := &tarjanState{
		edgesBySource: edgesBySource,
		indices:       map[string]int{},
		lowlink:       map[string]int{},
		onStack:       map[string]bool{},
	}
	for _, node := range order {
		if _, seen := state.indices[node]; !seen {
			state.strongconnect(node)
		}
	}
	return state.sccs
}

type tarjanState struct {
	edgesBySource map[string][]priorityEdge
	index         int
	indices       map[string]int
	lowlink       map[string]int
	onStack       map[string]bool
	stack         []string
	sccs          [][]string
}

func (t *tarjanState) strongconnect(v string) {
	t.indices[v] = t.index
	t.lowlink[v] = t.index
	t.index++
	t.stack = append(t.stack, v)
	t.onStack[v] = true

	for _, edge := range t.edgesBySource[v] {
		w := edge.Lower
		if _, seen := t.indices[w]; !seen {
			t.strongconnect(w)
			if t.lowlink[w] < t.lowlink[v] {
				t.lowlink[v] = t.lowlink[w]
			}
		} else if t.onStack[w] {
			if t.indices[w] < t.lowlink[v] {
				t.lowlink[v] = t.indices[w]
			}
		}
	}

	if t.lowlink[v] == t.indices[v] {
		var scc []string
		for {
			n := len(t.stack) - 1
			w := t.stack[n]
			t.stack = t.stack[:n]
			t.onStack[w] = false
			scc = append(scc, w)
			if w == v {
				break
			}
		}
		t.sccs = append(t.sccs, scc)
	}
}

// findWitnessCycle performs a DFS from start, restricted to nodes in sccSet,
// using the classic white/gray/black coloring to find one closed cycle. A
// non-trivial SCC guarantees a cycle exists among its members, so this
// always succeeds when sccSet is a genuine SCC of size >= 2.
func findWitnessCycle(edgesBySource map[string][]priorityEdge, sccSet map[string]bool, start string) []priorityEdge {
	const (
		white = iota
		gray
		black
	)
	color := map[string]int{}
	pathIndex := map[string]int{}
	var path []priorityEdge

	var dfs func(node string) []priorityEdge
	dfs = func(node string) []priorityEdge {
		color[node] = gray
		pathIndex[node] = len(path)
		for _, edge := range edgesBySource[node] {
			if !sccSet[edge.Lower] {
				continue
			}
			switch color[edge.Lower] {
			case gray:
				idx := pathIndex[edge.Lower]
				cycle := append([]priorityEdge{}, path[idx:]...)
				return append(cycle, edge)
			case white:
				path = append(path, edge)
				if found := dfs(edge.Lower); found != nil {
					return found
				}
				path = path[:len(path)-1]
			}
		}
		color[node] = black
		return nil
	}
	return dfs(start)
}
