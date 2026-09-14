package evaluation

import (
	"fmt"
	"impact/internal/contracts"
	gravity "nucleus/gravity"
	"strconv"
)

type preservation struct{}

func (preservation) Type() string    { return "preservation" }
func (preservation) Version() string { return "1" }
func (preservation) QuestionText() string {
	return "Does the candidate numeric criterion entail every baseline obligation, without vacuous success from an inconsistent candidate?"
}
func (preservation) Evaluate(r contracts.EvaluationRequest) (contracts.Assessment, error) {
	ms, a, err := prepare(r)
	if err != nil {
		return a, err
	}
	candidates := []gravity.Criterion{}
	baseline := 0
	candidateCount := 0
	qualitativeCandidate := false
	for i, p := range r.Postures {
		if p.Role == "baseline" {
			baseline++
		}
		if p.Role == "candidate" {
			candidateCount++
			if ms[i].Threshold != nil {
				candidates = append(candidates, gravity.Criterion{Ref: p.Ref, Expression: p.Expression})
			} else {
				qualitativeCandidate = true
				unknown(&a, p.Ref, "candidate contains criterion outside numeric entailment")
			}
		}
	}
	if baseline == 0 || candidateCount == 0 {
		return a, fmt.Errorf("preservation requires baseline and candidate criteria")
	}
	check, err := gravity.AnalyzeJoint(candidates)
	if err != nil {
		return a, err
	}
	if len(check.Undetermined) > 0 {
		qualitativeCandidate = true
	}
	if len(check.Conflicts) > 0 {
		for _, p := range r.Postures {
			if p.Role == "baseline" {
				unknown(&a, p.Ref, "candidate is inconsistent; entailment would be vacuous")
			}
		}
		a.Findings = append(a.Findings, contracts.Finding{Code: "INCONSISTENT_CANDIDATE", Conclusion: "conflict", References: check.Conflicts[0].References, Basis: "mechanical", Evidence: []string{"candidate solution set is empty"}})
		return a, nil
	}
	for i, p := range r.Postures {
		m := ms[i]
		if p.Role == "candidate" {
			if m.Threshold != nil {
				a.Coverage.Evaluated = append(a.Coverage.Evaluated, p.Ref)
			}
			continue
		}
		if m.Threshold == nil || qualitativeCandidate {
			unknown(&a, p.Ref, "preservation cannot be established over unmodeled criterion")
			continue
		}
		b := m.Threshold
		op := map[string]string{"<": ">=", "<=": ">", ">": "<=", ">=": "<", "==": "!=", "!=": "=="}[b.Comparator]
		expression := "threshold " + b.Metric + " " + op + " " + strconv.FormatFloat(b.Value, 'f', -1, 64)
		if b.Unit != nil {
			expression += " " + *b.Unit
		}
		// Ref reserved only inside this call; never interpreted as caller authority.
		negRef := "impact:negation:" + p.Ref
		used := map[string]bool{}
		for _, c := range candidates {
			used[c.Ref] = true
		}
		for used[negRef] {
			negRef += "_"
		}
		joint := append(append([]gravity.Criterion(nil), candidates...), gravity.Criterion{Ref: negRef, Expression: expression})
		proof, err := gravity.AnalyzeJoint(joint)
		if err != nil {
			return a, err
		}
		if len(proof.Undetermined) > 0 {
			unknown(&a, p.Ref, "unit equivalence required for numeric entailment")
			continue
		}
		conclusion := "not_preserved"
		if len(proof.Conflicts) > 0 {
			conclusion = "preserved"
		}
		refs := []string{p.Ref}
		for _, c := range candidates {
			refs = append(refs, c.Ref)
		}
		a.Coverage.Evaluated = append(a.Coverage.Evaluated, p.Ref)
		a.Findings = append(a.Findings, contracts.Finding{Code: "NUMERIC_ENTAILMENT", Conclusion: conclusion, References: refs, Basis: "mechanical", Evidence: []string{"candidate AND negated baseline is tested for satisfiability over real numbers"}})
	}
	return a, nil
}
