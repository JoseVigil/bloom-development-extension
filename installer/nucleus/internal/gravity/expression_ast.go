package gravity

const GravityExpressionGrammarVersion = "gravity-expr/0.1"

type ExpressionNodeBase struct {
	GrammarVersion      string  `json:"grammarVersion"`
	Primitive           string  `json:"primitive"`
	Raw                 string  `json:"raw"`
	Criterion           *string `json:"criterion"`
	PredicateComputable bool    `json:"predicateComputable"`
}

type GravityExpressionAST interface {
	gravityExpressionAST()
}

type ConstraintNode struct {
	ExpressionNodeBase
	Targets []string `json:"targets"`
}

type Quantity struct {
	Value float64 `json:"value"`
	Unit  *string `json:"unit"`
}

type ThresholdNode struct {
	ExpressionNodeBase
	Metric     string   `json:"metric"`
	Comparator string   `json:"comparator"`
	Quantity   Quantity `json:"quantity"`
}

type EvidenceRequirement struct {
	MinCount float64 `json:"minCount"`
	Kind     string  `json:"kind"`
}

type EvidenceNode struct {
	ExpressionNodeBase
	Requirement *EvidenceRequirement `json:"requirement"`
}

type PriorityPair struct {
	Higher string `json:"higher"`
	Lower  string `json:"lower"`
}

type PriorityNode struct {
	ExpressionNodeBase
	Order          []PriorityPair `json:"order"`
	CollisionClass *string        `json:"collisionClass"`
}

type EscalationNode struct {
	ExpressionNodeBase
	EscalateTo   string  `json:"escalateTo"`
	TriggerClass *string `json:"triggerClass"`
}

type ExceptionNode struct {
	ExpressionNodeBase
	ExceptionOf string `json:"exceptionOf"`
}

func (ConstraintNode) gravityExpressionAST() {}
func (ThresholdNode) gravityExpressionAST()  {}
func (EvidenceNode) gravityExpressionAST()   {}
func (PriorityNode) gravityExpressionAST()   {}
func (EscalationNode) gravityExpressionAST() {}
func (ExceptionNode) gravityExpressionAST()  {}

type GravityEvaluationContext struct {
	RuleID             string
	Origin             RuleOrigin
	AST                GravityExpressionAST
	VerifiableDeclared bool
	Turn               struct{ IntentType string }
	Metrics            map[string]float64
}

type GravityEvaluationOutcome struct {
	Status     string `json:"status"`
	ReasonCode string `json:"reasonCode,omitempty"`
	RuleID     string `json:"ruleId,omitempty"`
	RuleRef    string `json:"ruleRef,omitempty"`
	Reason     string `json:"reason,omitempty"`
}

// GravityEvaluator is the contract only. This work deliberately provides no
// implementation of mechanical evaluation or arbitration consumption.
type GravityEvaluator interface {
	Evaluate(GravityEvaluationContext) GravityEvaluationOutcome
}

type ExpressionErrorPosition struct {
	Offset int `json:"offset"`
	Line   int `json:"line"`
	Column int `json:"column"`
}

type GravityExpressionError struct {
	ErrorClass     string                   `json:"errorClass"`
	ReasonCode     string                   `json:"reasonCode"`
	Message        string                   `json:"message"`
	Position       *ExpressionErrorPosition `json:"position,omitempty"`
	ExpectedTokens []string                 `json:"expectedTokens,omitempty"`
	ViolatedRule   string                   `json:"violatedRule,omitempty"`
	RuleRef        string                   `json:"ruleRef,omitempty"`
}

func (e *GravityExpressionError) Error() string { return e.Message }

func NewSemanticGravityExpressionError(message, violatedRule, ruleRef string) *GravityExpressionError {
	return &GravityExpressionError{
		ErrorClass: "semantic", ReasonCode: "GRAVITY_EXPRESSION_SEMANTIC_ERROR",
		Message: message, ViolatedRule: violatedRule, RuleRef: ruleRef,
	}
}
