// Package gravity defines the versioned, value-only criterion boundary for
// consumers outside Nucleus. It grants no authority and performs no resolution.
package gravity

import (
	"encoding/json"
	"fmt"
	"math"
	internal "nucleus/internal/gravity"
	"sort"
)

const ContractVersion = "gravity-criterion/1"
const GrammarVersion = internal.GravityExpressionGrammarVersion

// Criterion is already situated by the caller in one shared applicability
// context. Ref must be globally qualified by its source namespace and revision.
type Criterion struct {
	Ref        string `json:"ref"`
	Expression string `json:"expression"`
}
type Bound struct {
	Metric     string  `json:"metric"`
	Unit       *string `json:"unit"`
	Comparator string  `json:"comparator"`
	Value      float64 `json:"value"`
}

// Meaning deliberately owns its DTOs: internal ASTs never cross this boundary.
type Meaning struct {
	Primitive         string `json:"primitive"`
	Threshold         *Bound `json:"threshold,omitempty"`
	QualifiedPriority bool   `json:"qualifiedPriority"`
	RequiresJudgment  bool   `json:"requiresJudgment"`
}
type Conflict struct {
	Code       string   `json:"code"`
	References []string `json:"references"`
	Basis      string   `json:"basis"`
}
type Analysis struct {
	Conflicts    []Conflict `json:"conflicts"`
	Evaluated    []string   `json:"evaluated"`
	Undetermined []string   `json:"undetermined"`
}

func Interpret(expression string) (Meaning, error) {
	ast, err := internal.Parse(expression)
	if err != nil {
		return Meaning{}, fmt.Errorf("invalid Gravity expression")
	}
	switch n := ast.(type) {
	case internal.ThresholdNode:
		if math.IsNaN(n.Quantity.Value) || math.IsInf(n.Quantity.Value, 0) {
			return Meaning{}, fmt.Errorf("non-finite threshold")
		}
		return Meaning{Primitive: "threshold", Threshold: &Bound{n.Metric, n.Quantity.Unit, n.Comparator, n.Quantity.Value}}, nil
	case internal.PriorityNode:
		return Meaning{Primitive: "priority", QualifiedPriority: n.CollisionClass != nil}, nil
	case internal.ConstraintNode:
		return Meaning{Primitive: "constraint", RequiresJudgment: true}, nil
	case internal.EvidenceNode:
		return Meaning{Primitive: "evidence", RequiresJudgment: true}, nil
	case internal.ExceptionNode:
		return Meaning{Primitive: "exception", RequiresJudgment: true}, nil
	case internal.EscalationNode:
		return Meaning{Primitive: "escalation", RequiresJudgment: true}, nil
	}
	return Meaning{}, fmt.Errorf("unsupported Gravity expression")
}

// AnalyzeJoint establishes numeric inconsistency and priority cycles, not
// governance approval or completeness of the caller's criterion selection.
// The caller MUST supply one subject/scope/domain context. Units are exact;
// there is no alias inference or conversion. Unknown criteria remain explicit.
func AnalyzeJoint(criteria []Criterion) (Analysis, error) {
	out := Analysis{Conflicts: []Conflict{}, Evaluated: []string{}, Undetermined: []string{}}
	items := append([]Criterion(nil), criteria...)
	sort.Slice(items, func(i, j int) bool { return items[i].Ref < items[j].Ref })
	resolved := []internal.ResolvedPosture{}
	seen := map[string]bool{}
	thresholds := map[string][]struct{ ref, unit string }{}
	for _, c := range items {
		if c.Ref == "" || seen[c.Ref] {
			return out, fmt.Errorf("empty or duplicate criterion reference")
		}
		seen[c.Ref] = true
		meaning, err := Interpret(c.Expression)
		if err != nil {
			return out, err
		}
		if meaning.Threshold != nil {
			unit := "<unspecified>"
			if meaning.Threshold.Unit != nil {
				unit = "unit:" + *meaning.Threshold.Unit
			}
			thresholds[meaning.Threshold.Metric] = append(thresholds[meaning.Threshold.Metric], struct{ ref, unit string }{c.Ref, unit})
		}
		raw, _ := json.Marshal(c.Expression)
		resolved = append(resolved, internal.ResolvedPosture{GravityPosture: internal.GravityPosture{PostureID: c.Ref, Primitive: meaning.Primitive, Expression: raw, Status: "active"}, NodeID: c.Ref})
		if meaning.RequiresJudgment || meaning.Primitive == "priority" && !meaning.QualifiedPriority {
			out.Undetermined = append(out.Undetermined, c.Ref)
		} else {
			out.Evaluated = append(out.Evaluated, c.Ref)
		}
	}
	// The same metric with different units is not proven independent. Without
	// an explicit conversion contract its joint consistency is undetermined.
	uncertain := map[string]bool{}
	for _, entries := range thresholds {
		units := map[string]bool{}
		for _, entry := range entries {
			units[entry.unit] = true
		}
		if len(units) > 1 {
			for _, entry := range entries {
				uncertain[entry.ref] = true
			}
		}
	}
	kept := []string{}
	for _, ref := range out.Evaluated {
		if uncertain[ref] {
			out.Undetermined = append(out.Undetermined, ref)
		} else {
			kept = append(kept, ref)
		}
	}
	out.Evaluated = kept
	sort.Strings(out.Undetermined)
	// Internal wall-clock stamps are deliberately not part of this contract.
	for _, f := range internal.DetectThresholdUnsatisfiable(resolved) {
		out.Conflicts = append(out.Conflicts, Conflict{f.Subtype, f.PostureIDs, "empty real-valued intersection; exact metric and unit"})
	}
	for _, f := range internal.DetectPriorityCycles(resolved) {
		out.Conflicts = append(out.Conflicts, Conflict{f.Subtype, f.PostureIDs, "directed priority cycle within one declared collision class or expression"})
	}
	return out, nil
}
