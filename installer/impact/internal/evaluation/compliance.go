package evaluation

import (
	"impact/internal/contracts"
	gravity "nucleus/gravity"
)

type compliance struct{}

func (compliance) Type() string    { return "compliance" }
func (compliance) Version() string { return "1" }
func (compliance) QuestionText() string {
	return "Do the supplied observations satisfy each selected numeric obligation in this snapshot?"
}
func (compliance) Evaluate(r contracts.EvaluationRequest) (contracts.Assessment, error) {
	ms, a, err := prepare(r)
	if err != nil {
		return a, err
	}
	for i, m := range ms {
		p := r.Postures[i]
		if m.Threshold == nil {
			unknown(&a, p.Ref, "runtime evaluation of this primitive requires judgment or another evaluator")
			continue
		}
		matches := []contracts.Fact{}
		for _, f := range r.Snapshot.Facts {
			if sameDimension(m.Threshold, &gravity.Bound{Metric: f.Metric, Unit: f.Unit}) {
				matches = append(matches, f)
			}
		}
		if len(matches) != 1 {
			unknown(&a, p.Ref, "exactly one observation per metric/unit required; missing or ambiguous observation")
			continue
		}
		f := matches[0]
		verdict := "satisfied"
		if !satisfies(f.Value, m.Threshold.Comparator, m.Threshold.Value) {
			verdict = "violated"
		}
		a.Coverage.Evaluated = append(a.Coverage.Evaluated, p.Ref)
		a.Findings = append(a.Findings, contracts.Finding{Code: "THRESHOLD_OBSERVATION", Conclusion: verdict, References: []string{p.Ref, f.Ref}, Basis: "mechanical", Evidence: []string{"exact numeric comparison; observation " + f.ObservedAt}})
	}
	return a, nil
}
func satisfies(x float64, op string, y float64) bool {
	switch op {
	case "<":
		return x < y
	case "<=":
		return x <= y
	case ">":
		return x > y
	case ">=":
		return x >= y
	case "==":
		return x == y
	case "!=":
		return x != y
	}
	return false
}
