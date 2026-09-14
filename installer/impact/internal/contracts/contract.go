// Package contracts defines Impact's extensible evaluation request and assessment.
// It contains no evaluation logic, authority resolution or IO.
package contracts

import "encoding/json"

const ContractVersion = "impact/1"

// Type is an open identifier, not an enum. Version identifies evaluator semantics.
type Question struct {
	Type       string          `json:"type"`
	Version    string          `json:"version"`
	Parameters json.RawMessage `json:"parameters,omitempty"`
}
type Context struct {
	Subject    string `json:"subject"`
	Scope      string `json:"scope"`
	Domain     string `json:"domain"`
	Intent     string `json:"intent"`
	Resolution string `json:"resolution"`
}
type Posture struct {
	Ref        string `json:"ref"`
	Expression string `json:"expression"`
	Role       string `json:"role"`
}
type Fact struct {
	Ref        string  `json:"ref"`
	Metric     string  `json:"metric"`
	Unit       *string `json:"unit"`
	Value      float64 `json:"value"`
	ObservedAt string  `json:"observedAt"`
}
type Snapshot struct {
	Ref      string   `json:"ref"`
	Facts    []Fact   `json:"facts"`
	Complete bool     `json:"complete"`
	Missing  []string `json:"missing"`
}
type EvaluationRequest struct {
	Contract string    `json:"contract"`
	Question Question  `json:"question"`
	Context  Context   `json:"context"`
	Postures []Posture `json:"postures"`
	Snapshot Snapshot  `json:"snapshot"`
	// Payload is evaluator-owned extension data. New questions require no envelope change.
	Payload json.RawMessage `json:"payload,omitempty"`
}
type Finding struct {
	Code       string   `json:"code"`
	Conclusion string   `json:"conclusion"`
	References []string `json:"references"`
	Basis      string   `json:"basis"`
	Evidence   []string `json:"evidence"`
}
type Coverage struct {
	Evaluated    []string `json:"evaluated"`
	Undetermined []string `json:"undetermined"`
	Complete     bool     `json:"complete"`
}
type Reevaluation struct {
	Dependency string `json:"dependency"`
	Condition  string `json:"condition"`
}
type Assessment struct {
	Contract         string         `json:"contract"`
	Question         Question       `json:"question"`
	QuestionText     string         `json:"questionText"`
	InputDigest      string         `json:"inputDigest"`
	EvaluatorVersion string         `json:"evaluatorVersion"`
	Findings         []Finding      `json:"findings"`
	Coverage         Coverage       `json:"coverage"`
	Indeterminacy    []string       `json:"indeterminacy"`
	ReevaluateWhen   []Reevaluation `json:"reevaluateWhen"`
}

// Evaluator implementations must be deterministic and must not retain or mutate
// input. Register extensions on an Engine instance; there is no global registry.
type Evaluator interface {
	Type() string
	Version() string
	QuestionText() string
	Evaluate(EvaluationRequest) (Assessment, error)
}
