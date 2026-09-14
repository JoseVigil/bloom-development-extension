package evaluation

import (
	"impact/internal/contracts"
	gravity "nucleus/gravity"
)

type coexistence struct{}

func (coexistence) Type() string    { return "coexistence" }
func (coexistence) Version() string { return "1" }
func (coexistence) QuestionText() string {
	return "Can the selected criteria hold jointly for this subject, scope and intent over the real numeric domain?"
}
func (coexistence) Evaluate(r contracts.EvaluationRequest) (contracts.Assessment, error) {
	_, a, err := prepare(r)
	if err != nil {
		return a, err
	}
	cs := []gravity.Criterion{}
	for _, p := range r.Postures {
		cs = append(cs, gravity.Criterion{Ref: p.Ref, Expression: p.Expression})
	}
	analysis, err := gravity.AnalyzeJoint(cs)
	if err != nil {
		return a, err
	}
	a.Coverage.Evaluated = analysis.Evaluated
	for _, ref := range analysis.Undetermined {
		unknown(&a, ref, "criterion requires judgment, priority qualification or unit equivalence")
	}
	for _, f := range analysis.Conflicts {
		a.Findings = append(a.Findings, contracts.Finding{Code: f.Code, Conclusion: "conflict", References: f.References, Basis: "mechanical", Evidence: []string{f.Basis}})
	}
	if len(a.Findings) == 0 && a.Coverage.Complete {
		a.Findings = append(a.Findings, contracts.Finding{Code: "JOINTLY_SATISFIABLE", Conclusion: "coexistent", References: a.Coverage.Evaluated, Basis: "mechanical", Evidence: []string{"nonempty numeric intersections and acyclic qualified priority relations; distinct declared metrics are independent dimensions"}})
	}
	return a, nil
}
