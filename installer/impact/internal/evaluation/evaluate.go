// Package evaluation evaluates consequences over explicit, immutable inputs.
// It does not resolve authority, perform IO, or retain caller state.
package evaluation

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"impact/internal/contracts"
	"io"
	"math"
	gravity "nucleus/gravity"
	"sort"
	"strings"
	"time"
)

type Engine struct {
	evaluators map[string]contracts.Evaluator
}

func New(evaluators ...contracts.Evaluator) (*Engine, error) {
	e := &Engine{evaluators: map[string]contracts.Evaluator{}}
	for _, v := range evaluators {
		if v == nil || v.Type() == "" || v.Version() == "" || v.QuestionText() == "" {
			return nil, fmt.Errorf("invalid evaluator")
		}
		key := v.Type() + "@" + v.Version()
		if _, ok := e.evaluators[key]; ok {
			return nil, fmt.Errorf("duplicate evaluator")
		}
		e.evaluators[key] = v
	}
	return e, nil
}
func Default() *Engine { e, _ := New(coexistence{}, preservation{}, compliance{}); return e }

// Decode rejects unknown envelope fields, trailing documents and oversized input
// at the adapters. Evaluator extension content belongs to parameters/payload.
func Decode(r io.Reader) (contracts.EvaluationRequest, error) {
	var req contracts.EvaluationRequest
	d := json.NewDecoder(r)
	d.DisallowUnknownFields()
	if err := d.Decode(&req); err != nil {
		return req, fmt.Errorf("invalid evaluation request JSON")
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return req, fmt.Errorf("expected one JSON document")
	}
	return req, nil
}
func (e *Engine) Evaluate(req contracts.EvaluationRequest) (contracts.Assessment, error) {
	if req.Contract != contracts.ContractVersion {
		return contracts.Assessment{}, fmt.Errorf("unsupported contract")
	}
	if req.Question.Type == "" || req.Question.Version == "" {
		return contracts.Assessment{}, fmt.Errorf("question type and version required")
	}
	// Deep-copy caller-owned slices and normalize ordering for reproducible output.
	raw, err := json.Marshal(req)
	if err != nil {
		return contracts.Assessment{}, fmt.Errorf("non-serializable request")
	}
	var input contracts.EvaluationRequest
	if err = json.Unmarshal(raw, &input); err != nil {
		return contracts.Assessment{}, err
	}
	sort.Slice(input.Postures, func(i, j int) bool { return input.Postures[i].Ref < input.Postures[j].Ref })
	sort.Slice(input.Snapshot.Facts, func(i, j int) bool { return input.Snapshot.Facts[i].Ref < input.Snapshot.Facts[j].Ref })
	raw, _ = json.Marshal(input)
	sum := sha256.Sum256(raw)
	base := contracts.Assessment{Contract: contracts.ContractVersion, Question: input.Question, InputDigest: "sha256:" + hex.EncodeToString(sum[:]), Findings: []contracts.Finding{}, Coverage: contracts.Coverage{Evaluated: []string{}, Undetermined: []string{}}, Indeterminacy: []string{}, ReevaluateWhen: []contracts.Reevaluation{{"inputDigest", "any criterion, context, snapshot, authority resolution or evidence changes"}, {"evaluatorVersion", "evaluator, Gravity contract or grammar semantics change"}}}
	evaluator, ok := e.evaluators[input.Question.Type+"@"+input.Question.Version]
	if !ok {
		base.QuestionText = "Unsupported question; no evaluation performed"
		base.Indeterminacy = append(base.Indeterminacy, "unsupported evaluator type or version")
		for _, p := range input.Postures {
			base.Coverage.Undetermined = append(base.Coverage.Undetermined, p.Ref)
		}
		return base, nil
	}
	result, err := evaluator.Evaluate(input)
	if err != nil {
		return contracts.Assessment{}, err
	}
	base.QuestionText = evaluator.QuestionText()
	base.EvaluatorVersion = evaluator.Version()
	base.Findings = append(base.Findings, result.Findings...)
	base.Coverage = result.Coverage
	base.Indeterminacy = append(base.Indeterminacy, result.Indeterminacy...)
	base.ReevaluateWhen = append(base.ReevaluateWhen, result.ReevaluateWhen...)
	if !input.Snapshot.Complete || len(input.Snapshot.Missing) > 0 {
		base.Coverage.Complete = false
		base.Indeterminacy = append(base.Indeterminacy, "snapshot or selected criterion is incomplete")
	}
	return base, nil
}
func prepare(r contracts.EvaluationRequest) ([]gravity.Meaning, contracts.Assessment, error) {
	a := contracts.Assessment{Findings: []contracts.Finding{}, Coverage: contracts.Coverage{Evaluated: []string{}, Undetermined: []string{}, Complete: true}, Indeterminacy: []string{}}
	if len(bytes.TrimSpace(r.Payload)) > 0 || len(bytes.TrimSpace(r.Question.Parameters)) > 0 {
		return nil, a, fmt.Errorf("this evaluator accepts no payload or parameters")
	}
	c := r.Context
	if c.Subject == "" || c.Scope == "" || c.Domain != "real" || c.Intent == "" || c.Resolution == "" || r.Snapshot.Ref == "" {
		return nil, a, fmt.Errorf("explicit subject, scope, real domain, intent, resolution and snapshot required")
	}
	if len(r.Postures) == 0 {
		return nil, a, fmt.Errorf("at least one posture required")
	}
	meanings := []gravity.Meaning{}
	seen := map[string]bool{}
	for _, p := range r.Postures {
		if !strings.Contains(p.Ref, ":") || seen[p.Ref] {
			return nil, a, fmt.Errorf("empty or duplicate reference")
		}
		seen[p.Ref] = true
		if p.Role != "baseline" && p.Role != "candidate" {
			return nil, a, fmt.Errorf("posture role must be baseline or candidate")
		}
		m, err := gravity.Interpret(p.Expression)
		if err != nil {
			return nil, a, fmt.Errorf("invalid criterion expression")
		}
		meanings = append(meanings, m)
	}
	for _, f := range r.Snapshot.Facts {
		if f.Ref == "" || seen[f.Ref] || f.Metric == "" || math.IsNaN(f.Value) || math.IsInf(f.Value, 0) {
			return nil, a, fmt.Errorf("invalid or duplicate fact")
		}
		seen[f.Ref] = true
		if _, err := time.Parse(time.RFC3339Nano, f.ObservedAt); err != nil {
			return nil, a, fmt.Errorf("fact observedAt must be RFC3339")
		}
	}
	return meanings, a, nil
}
func unknown(a *contracts.Assessment, ref, reason string) {
	a.Coverage.Complete = false
	a.Coverage.Undetermined = append(a.Coverage.Undetermined, ref)
	a.Indeterminacy = append(a.Indeterminacy, reason)
}
func sameDimension(a, b *gravity.Bound) bool {
	return a.Metric == b.Metric && ((a.Unit == nil && b.Unit == nil) || (a.Unit != nil && b.Unit != nil && *a.Unit == *b.Unit))
}
