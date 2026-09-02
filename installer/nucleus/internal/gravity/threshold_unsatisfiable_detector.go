package gravity

import (
	"encoding/json"
	"sort"
	"time"
)

// This file implements detection of the THRESHOLD_UNSATISFIABLE subtype
// ONLY, out of the taxonomy proposed by
// docs/ANAYSIS/GRAVITY/COLISIONES/Orbital_Gravity_Deteccion_Tipificacion_Colisiones_Mandates_Posturas_Spec_v0_1.md
// ("Spec-Colisiones"). This is the next narrow, control-ratified increment
// after PRIORITY_CYCLE (priority_cycle_detector.go, commit 56420a6) — the
// only other POSTURE_HORIZONTAL_INCOMPATIBILITY subtype Spec-Colisiones §9.4
// names as mechanically decidable today, alongside PRIORITY_CYCLE. No other
// subtype (ESCALATION_TARGET_DIVERGENCE, QUALITATIVE_CRITERION_CONFLICT),
// no MANDATE_TERRITORY_OVERLAP, no pending part of
// POSTURE_HIERARCHICAL_CONTRADICTION, and no ArbitrationEvent producer or
// consumer are implemented here. Nothing here reads or writes disk, wires to
// a Workflow/activity/CLI/endpoint, or adds an edge type to GravityGraph.
//
// Obligatory pre-read finding: no AST blocker. Before writing this file, the
// cowork prompt required confirming whether expression_ast.go exposes an
// identifier for "the same dimension" between two ThresholdNode values. It
// does: ThresholdNode.Metric is a required, non-optional IDENT
// (threshold_expr = "threshold", IDENT, COMPARATOR, quantity, [criterion] —
// Grammar spec §2.4) naming the measured dimension. There is no missing
// identifier to report as a blocker, so this cowork proceeds.
//
// Value domain: always numeric, also not a blocker. quantity = NUMBER,
// [IDENT] (Grammar spec §2.3); expression_parser.go only ever builds
// Quantity{Value float64, Unit *string} via strconv.ParseFloat. There is no
// non-numeric ThresholdNode value the parser can produce, so
// Spec-Colisiones §4.3's open question ("si el dominio de valores es
// exclusivamente numérico") has one answer for this AST: yes, always. This
// implementation therefore never narrows to "the numeric subset" or reports
// an out-of-scope/undecidable outcome for a non-numeric value — that case
// cannot occur structurally.
//
// Grouping key decision — (Metric, Unit), NOT CollisionClass.
// PRIORITY_CYCLE groups PriorityNode candidates by a shared CollisionClass
// (priority_cycle_detector.go's groupPriorityPostures). ThresholdNode has no
// CollisionClass field at all: threshold_expr's grammar has no "for IDENT"
// clause the way priority_expr does (Grammar spec §2.4 vs §2.6), and
// expression_ast.go's ThresholdNode carries only Metric, Comparator and
// Quantity — nothing else. Copying the CollisionClass grouping decision
// here without checking would be copying a field that does not exist. The
// mechanically correct analogue — and the one Spec-Colisiones §4.3 names
// directly ("comparación matemática básica cuando coinciden métrica, unidad,
// dominio y contexto") — is to group by (Metric, Unit): two ThresholdNode
// values are only ever compared against each other when their Metric
// strings match exactly AND their Quantity.Unit values match exactly (both
// nil, or the same non-empty string). A nil Unit is never merged with any
// concrete Unit, and two different concrete Units sharing a Metric are never
// merged with each other, because nothing in this AST or in Spec-Colisiones
// authorizes a unit-conversion table — see
// TestDetectThresholdUnsatisfiableIsolatesDistinctUnits and
// TestDetectThresholdUnsatisfiableIsolatesDistinctMetrics. This is a narrow
// decision for this function only; it does not resolve COLLISION-CATALOG-01
// (métrica/alias equivalence is still unratified — e.g. "latency_ms" and
// "latencyMs" are treated as two unrelated dimensions here, correctly, since
// nothing confirms they denote the same measure).
//
// Comparator semantics. The grammar's COMPARATOR token is exactly one of
// "<", "<=", ">", ">=", "==", "!=" (Grammar spec §1.3/§5's TypeScript
// shape). All six are handled: ">"/">=" tighten a lower bound, "<"/"<="
// tighten an upper bound, "==" pins an exact value, "!=" excludes one
// point. Two or more constraints in the same (Metric, Unit) group are
// THRESHOLD_UNSATISFIABLE iff the real-valued solution set their
// conjunction describes is empty — plain interval arithmetic
// (Spec-Colisiones §3.3's own phrase: "aritmética de intervalos simple"),
// with no floating-point tolerance and no unit conversion. Each confirmed
// finding carries only the minimal subset of constraints that proves
// emptiness (the winning lower/upper bound, or a colliding equality/
// exclusion), mirroring PRIORITY_CYCLE's "one witness, not every edge"
// choice (see detectCyclesInGroup's comment in priority_cycle_detector.go)
// rather than dumping the whole group as evidence.
//
// A single `threshold` expression can only ever declare one (metric,
// comparator, quantity) triple — unlike `priority_expr`, `threshold_expr`
// has no repeated/comma-separated form (Grammar spec §2.4). So, unlike
// PRIORITY_CYCLE's "cycle entirely inside a single expression" case
// (§3.4), a THRESHOLD_UNSATISFIABLE finding can never involve just one
// posture: it always takes at least two distinct ThresholdNode-bearing
// postures to produce a conflict.

// ThresholdUnsatisfiableFinding is the CONFIRMED_COLLISION shape this
// function produces for one confirmed THRESHOLD_UNSATISFIABLE
// (Spec-Colisiones §3.3, §4.2, §6.2). Deliberately narrower than the general
// ArbitrationEvent input shape ARBITRATION-EVENT-INPUT-01 would require
// (§9.1) — only what this subtype needs, same posture PRIORITY_CYCLE took
// with PriorityCycleFinding.
type ThresholdUnsatisfiableFinding struct {
	Category   string                        `json:"category"`
	Subtype    string                        `json:"subtype"`
	Metric     string                        `json:"metric"`
	Unit       *string                       `json:"unit"`
	Conflict   []ThresholdConstraintEvidence `json:"conflict"`
	PostureIDs []string                      `json:"postureIds"`
	NodeIDs    []string                      `json:"nodeIds"`
	DetectedAt string                        `json:"detectedAt"`
}

// ThresholdConstraintEvidence is one (comparator, quantity) constraint,
// together with the GravityPosture/GravityNode it came from, that
// participates in a confirmed THRESHOLD_UNSATISFIABLE finding's minimal
// proof of emptiness.
type ThresholdConstraintEvidence struct {
	Comparator string  `json:"comparator"`
	Value      float64 `json:"value"`
	PostureID  string  `json:"postureId"`
	NodeID     string  `json:"nodeId"`
}

const (
	// ThresholdUnsatisfiableCategory names the parent taxonomy category
	// (Spec-Colisiones §3.3). Deliberately its own constant rather than a
	// reference to priority_cycle_detector.go's PriorityCycleCategory: that
	// file is not to be modified by this cowork, and its constant name is
	// scoped to PRIORITY_CYCLE even though the string value is the shared
	// parent category. Both files defining the same literal
	// "POSTURE_HORIZONTAL_INCOMPATIBILITY" under their own subtype-scoped
	// constant name is a duplication worth flagging for control to resolve
	// (e.g. hoisting one shared category constant into its own file) rather
	// than something this cowork should decide unilaterally by editing
	// priority_cycle_detector.go.
	ThresholdUnsatisfiableCategory = "POSTURE_HORIZONTAL_INCOMPATIBILITY"
	// ThresholdUnsatisfiableSubtype names this specific subtype (Spec-Colisiones §3.3).
	ThresholdUnsatisfiableSubtype = "THRESHOLD_UNSATISFIABLE"
)

// DetectThresholdUnsatisfiable finds THRESHOLD_UNSATISFIABLE collisions
// (Spec-Colisiones §3.3) among a set of already-resolved, already-active
// postures — the shape Store.ResolveActive already produces (resolver.go,
// []ResolvedPosture), the same input DetectPriorityCycles takes. It is
// pure: no filesystem, no network, no mutation of its input, and no
// dependency on anything outside the arguments except the wall clock used
// to stamp DetectedAt.
func DetectThresholdUnsatisfiable(postures []ResolvedPosture) []ThresholdUnsatisfiableFinding {
	groups := groupThresholdPostures(postures)
	detectedAt := time.Now().UTC().Format(time.RFC3339Nano)

	var findings []ThresholdUnsatisfiableFinding
	for _, group := range groups {
		unsatisfiable, witness := evaluateThresholdGroup(group.constraints)
		if !unsatisfiable {
			continue
		}
		findings = append(findings, buildThresholdFinding(group.metric, group.unit, witness, detectedAt))
	}
	return findings
}

// thresholdConstraint is one (comparator, quantity) constraint together with
// the posture/node it came from, flattened out of a ThresholdNode for
// interval evaluation.
type thresholdConstraint struct {
	Comparator        string
	Value             float64
	PostureID, NodeID string
}

// thresholdGroup is the set of threshold constraints that are comparable
// against each other because they share both Metric and Unit — see the
// grouping key decision documented above.
type thresholdGroup struct {
	metric      string
	unit        *string
	constraints []thresholdConstraint
}

// groupThresholdPostures decodes every active posture's expression, keeps
// only ThresholdNode ASTs, and groups their constraints by (Metric, Unit).
// Group order follows first-encounter order in the input slice, so
// downstream processing (and therefore the findings slice) is deterministic
// for a given input — the same determinism discipline
// groupPriorityPostures follows.
func groupThresholdPostures(postures []ResolvedPosture) []*thresholdGroup {
	var groups []*thresholdGroup
	index := map[string]int{}

	for _, posture := range postures {
		node, ok := decodeThresholdNode(posture.GravityPosture)
		if !ok {
			continue
		}
		key := node.Metric + "\x00"
		if node.Quantity.Unit != nil {
			key += *node.Quantity.Unit
		}
		group, exists := groupAt(groups, index, key)
		if !exists {
			group = &thresholdGroup{metric: node.Metric, unit: node.Quantity.Unit}
			index[key] = len(groups)
			groups = append(groups, group)
		}
		group.constraints = append(group.constraints, thresholdConstraint{
			Comparator: node.Comparator,
			Value:      node.Quantity.Value,
			PostureID:  posture.PostureID,
			NodeID:     posture.NodeID,
		})
	}
	return groups
}

// groupAt looks up an existing group by key without mutating index/groups;
// the caller creates and registers a new group on a miss. Split out only to
// keep groupThresholdPostures' loop body readable.
func groupAt(groups []*thresholdGroup, index map[string]int, key string) (*thresholdGroup, bool) {
	idx, exists := index[key]
	if !exists {
		return nil, false
	}
	return groups[idx], true
}

// decodeThresholdNode extracts a ThresholdNode from a GravityPosture, if and
// only if the posture's Primitive is "threshold" and its Expression decodes
// and parses to a ThresholdNode. Anything else (a different primitive, a
// missing or malformed Expression, an expression that fails to parse) is
// discarded, not reported as an error — the same assumption
// decodePriorityNode makes: already-active postures were already validated
// at postulation time (Parse() runs there), and a single malformed entry
// must not block detection for the rest of the active set.
func decodeThresholdNode(posture GravityPosture) (ThresholdNode, bool) {
	if posture.Primitive != "threshold" || len(posture.Expression) == 0 {
		return ThresholdNode{}, false
	}
	var raw string
	if err := json.Unmarshal(posture.Expression, &raw); err != nil {
		return ThresholdNode{}, false
	}
	ast, err := Parse(raw)
	if err != nil {
		return ThresholdNode{}, false
	}
	node, ok := ast.(ThresholdNode)
	return node, ok
}

// thresholdBound is the tightest lower or upper bound seen so far in a
// group, together with the constraint that produced it, so a confirmed
// finding can cite its real source posture/node.
type thresholdBound struct {
	value     float64
	inclusive bool
	source    thresholdConstraint
}

// evaluateThresholdGroup determines whether the conjunction of every
// constraint in a (Metric, Unit) group has an empty real-valued solution
// set, using plain interval arithmetic (Spec-Colisiones §3.3). On conflict
// it returns the minimal subset of constraints that proves emptiness — 2
// constraints for a bound-vs-bound or bound-vs-equality conflict, or 2-3 for
// an equality colliding with an exclusion or a degenerate single-point
// interval that an exclusion removes entirely.
func evaluateThresholdGroup(constraints []thresholdConstraint) (unsatisfiable bool, witness []thresholdConstraint) {
	var lower, upper *thresholdBound
	var equalities, exclusions []thresholdConstraint

	for _, c := range constraints {
		switch c.Comparator {
		case ">":
			lower = tighterLower(lower, c, false)
		case ">=":
			lower = tighterLower(lower, c, true)
		case "<":
			upper = tighterUpper(upper, c, false)
		case "<=":
			upper = tighterUpper(upper, c, true)
		case "==":
			equalities = append(equalities, c)
		case "!=":
			exclusions = append(exclusions, c)
		}
		// No default case: an unrecognized Comparator cannot be produced by
		// Parse() today (Grammar spec §1.3 fixes the six above). A switch
		// with no matching case silently contributes no bound, the same
		// "don't block on an entry we don't understand" posture
		// decodeThresholdNode already takes for malformed postures.
	}

	for i := 1; i < len(equalities); i++ {
		if equalities[i].Value != equalities[0].Value {
			return true, []thresholdConstraint{equalities[0], equalities[i]}
		}
	}

	if len(equalities) > 0 {
		eq := equalities[0]
		if lower != nil && (eq.Value < lower.value || (eq.Value == lower.value && !lower.inclusive)) {
			return true, []thresholdConstraint{lower.source, eq}
		}
		if upper != nil && (eq.Value > upper.value || (eq.Value == upper.value && !upper.inclusive)) {
			return true, []thresholdConstraint{eq, upper.source}
		}
		for _, ex := range exclusions {
			if ex.Value == eq.Value {
				return true, []thresholdConstraint{eq, ex}
			}
		}
		return false, nil
	}

	if lower == nil || upper == nil {
		// An unbounded side means the remaining interval is infinite; no
		// finite set of exclusions can empty it.
		return false, nil
	}
	if lower.value > upper.value {
		return true, []thresholdConstraint{lower.source, upper.source}
	}
	if lower.value == upper.value {
		if !lower.inclusive || !upper.inclusive {
			// Open at the single point they share: empty interval.
			return true, []thresholdConstraint{lower.source, upper.source}
		}
		for _, ex := range exclusions {
			if ex.Value == lower.value {
				return true, []thresholdConstraint{lower.source, upper.source, ex}
			}
		}
		return false, nil
	}
	// lower.value < upper.value: an infinite interval remains even after
	// removing the finitely many points any "!=" constraints exclude.
	return false, nil
}

// tighterLower returns the tighter (larger) of the current lower bound and
// candidate, at value equality preferring the strict (exclusive) side as
// more restrictive than an inclusive one.
func tighterLower(current *thresholdBound, candidate thresholdConstraint, inclusive bool) *thresholdBound {
	if current == nil {
		return &thresholdBound{value: candidate.Value, inclusive: inclusive, source: candidate}
	}
	if candidate.Value > current.value || (candidate.Value == current.value && current.inclusive && !inclusive) {
		return &thresholdBound{value: candidate.Value, inclusive: inclusive, source: candidate}
	}
	return current
}

// tighterUpper is tighterLower's mirror for the smaller (upper) side.
func tighterUpper(current *thresholdBound, candidate thresholdConstraint, inclusive bool) *thresholdBound {
	if current == nil {
		return &thresholdBound{value: candidate.Value, inclusive: inclusive, source: candidate}
	}
	if candidate.Value < current.value || (candidate.Value == current.value && current.inclusive && !inclusive) {
		return &thresholdBound{value: candidate.Value, inclusive: inclusive, source: candidate}
	}
	return current
}

func buildThresholdFinding(metric string, unit *string, witness []thresholdConstraint, detectedAt string) ThresholdUnsatisfiableFinding {
	conflict := make([]ThresholdConstraintEvidence, len(witness))
	postureSet := map[string]bool{}
	nodeSet := map[string]bool{}
	for i, c := range witness {
		conflict[i] = ThresholdConstraintEvidence{Comparator: c.Comparator, Value: c.Value, PostureID: c.PostureID, NodeID: c.NodeID}
		postureSet[c.PostureID] = true
		nodeSet[c.NodeID] = true
	}
	return ThresholdUnsatisfiableFinding{
		Category:   ThresholdUnsatisfiableCategory,
		Subtype:    ThresholdUnsatisfiableSubtype,
		Metric:     metric,
		Unit:       unit,
		Conflict:   conflict,
		PostureIDs: sortedThresholdSetKeys(postureSet),
		NodeIDs:    sortedThresholdSetKeys(nodeSet),
		DetectedAt: detectedAt,
	}
}

// sortedThresholdSetKeys is a local, deliberately separate copy of
// priority_cycle_detector.go's sortedSetKeys (same package, same trivial
// map-to-sorted-slice logic). Kept local rather than calling that file's
// unexported helper so this file stays independently reviewable without a
// silent dependency on priority_cycle_detector.go's internals — see the
// closing report for the explicit note to control about this duplication.
func sortedThresholdSetKeys(set map[string]bool) []string {
	keys := make([]string, 0, len(set))
	for key := range set {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
