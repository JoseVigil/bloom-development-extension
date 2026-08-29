// Code generated from contracts/gravity/GravityExpression.g4 by ANTLR 4.13.2. DO NOT EDIT.

package gravity // GravityExpression
import (
	"fmt"
	"strconv"
	"sync"

	"github.com/antlr4-go/antlr/v4"
)

// Suppress unused import errors
var _ = fmt.Printf
var _ = strconv.Itoa
var _ = sync.Once{}

type GravityExpressionParser struct {
	*antlr.BaseParser
}

var GravityExpressionParserStaticData struct {
	once                   sync.Once
	serializedATN          []int32
	LiteralNames           []string
	SymbolicNames          []string
	RuleNames              []string
	PredictionContextCache *antlr.PredictionContextCache
	atn                    *antlr.ATN
	decisionToDFA          []*antlr.DFA
}

func gravityexpressionParserInit() {
	staticData := &GravityExpressionParserStaticData
	staticData.LiteralNames = []string{
		"", "'constraint'", "'threshold'", "'evidence'", "'min'", "'priority'",
		"'for'", "'escalation'", "'to'", "'exception'", "'of'", "'on'", "','",
		"'over'",
	}
	staticData.SymbolicNames = []string{
		"", "", "", "", "", "", "", "", "", "", "", "", "", "", "CRITERION",
		"RULE_REF", "NUMBER", "COMPARATOR", "IDENT", "WS",
	}
	staticData.RuleNames = []string{
		"expression", "constraintExpr", "thresholdExpr", "evidenceExpr", "priorityExpr",
		"escalationExpr", "exceptionExpr", "criterion", "targetList", "priorityOrder",
		"quantity",
	}
	staticData.PredictionContextCache = antlr.NewPredictionContextCache()
	staticData.serializedATN = []int32{
		4, 1, 19, 115, 2, 0, 7, 0, 2, 1, 7, 1, 2, 2, 7, 2, 2, 3, 7, 3, 2, 4, 7,
		4, 2, 5, 7, 5, 2, 6, 7, 6, 2, 7, 7, 7, 2, 8, 7, 8, 2, 9, 7, 9, 2, 10, 7,
		10, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1,
		0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 3, 0, 41, 8, 0, 1, 1, 1, 1, 3, 1,
		45, 8, 1, 1, 1, 1, 1, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 3, 2, 54, 8, 2, 1,
		3, 1, 3, 1, 3, 1, 3, 3, 3, 60, 8, 3, 1, 3, 1, 3, 1, 4, 1, 4, 1, 4, 1, 4,
		3, 4, 68, 8, 4, 1, 4, 3, 4, 71, 8, 4, 1, 5, 1, 5, 1, 5, 1, 5, 1, 5, 3,
		5, 78, 8, 5, 1, 5, 3, 5, 81, 8, 5, 1, 6, 1, 6, 1, 6, 1, 6, 1, 6, 1, 7,
		1, 7, 1, 8, 1, 8, 1, 8, 1, 8, 5, 8, 94, 8, 8, 10, 8, 12, 8, 97, 9, 8, 1,
		9, 1, 9, 1, 9, 1, 9, 1, 9, 1, 9, 1, 9, 5, 9, 106, 8, 9, 10, 9, 12, 9, 109,
		9, 9, 1, 10, 1, 10, 3, 10, 113, 8, 10, 1, 10, 0, 0, 11, 0, 2, 4, 6, 8,
		10, 12, 14, 16, 18, 20, 0, 0, 118, 0, 40, 1, 0, 0, 0, 2, 42, 1, 0, 0, 0,
		4, 48, 1, 0, 0, 0, 6, 55, 1, 0, 0, 0, 8, 63, 1, 0, 0, 0, 10, 72, 1, 0,
		0, 0, 12, 82, 1, 0, 0, 0, 14, 87, 1, 0, 0, 0, 16, 89, 1, 0, 0, 0, 18, 98,
		1, 0, 0, 0, 20, 110, 1, 0, 0, 0, 22, 23, 3, 2, 1, 0, 23, 24, 5, 0, 0, 1,
		24, 41, 1, 0, 0, 0, 25, 26, 3, 4, 2, 0, 26, 27, 5, 0, 0, 1, 27, 41, 1,
		0, 0, 0, 28, 29, 3, 6, 3, 0, 29, 30, 5, 0, 0, 1, 30, 41, 1, 0, 0, 0, 31,
		32, 3, 8, 4, 0, 32, 33, 5, 0, 0, 1, 33, 41, 1, 0, 0, 0, 34, 35, 3, 10,
		5, 0, 35, 36, 5, 0, 0, 1, 36, 41, 1, 0, 0, 0, 37, 38, 3, 12, 6, 0, 38,
		39, 5, 0, 0, 1, 39, 41, 1, 0, 0, 0, 40, 22, 1, 0, 0, 0, 40, 25, 1, 0, 0,
		0, 40, 28, 1, 0, 0, 0, 40, 31, 1, 0, 0, 0, 40, 34, 1, 0, 0, 0, 40, 37,
		1, 0, 0, 0, 41, 1, 1, 0, 0, 0, 42, 44, 5, 1, 0, 0, 43, 45, 3, 16, 8, 0,
		44, 43, 1, 0, 0, 0, 44, 45, 1, 0, 0, 0, 45, 46, 1, 0, 0, 0, 46, 47, 3,
		14, 7, 0, 47, 3, 1, 0, 0, 0, 48, 49, 5, 2, 0, 0, 49, 50, 5, 18, 0, 0, 50,
		51, 5, 17, 0, 0, 51, 53, 3, 20, 10, 0, 52, 54, 3, 14, 7, 0, 53, 52, 1,
		0, 0, 0, 53, 54, 1, 0, 0, 0, 54, 5, 1, 0, 0, 0, 55, 59, 5, 3, 0, 0, 56,
		57, 5, 4, 0, 0, 57, 58, 5, 16, 0, 0, 58, 60, 5, 18, 0, 0, 59, 56, 1, 0,
		0, 0, 59, 60, 1, 0, 0, 0, 60, 61, 1, 0, 0, 0, 61, 62, 3, 14, 7, 0, 62,
		7, 1, 0, 0, 0, 63, 64, 5, 5, 0, 0, 64, 67, 3, 18, 9, 0, 65, 66, 5, 6, 0,
		0, 66, 68, 5, 18, 0, 0, 67, 65, 1, 0, 0, 0, 67, 68, 1, 0, 0, 0, 68, 70,
		1, 0, 0, 0, 69, 71, 3, 14, 7, 0, 70, 69, 1, 0, 0, 0, 70, 71, 1, 0, 0, 0,
		71, 9, 1, 0, 0, 0, 72, 73, 5, 7, 0, 0, 73, 74, 5, 8, 0, 0, 74, 77, 5, 18,
		0, 0, 75, 76, 5, 6, 0, 0, 76, 78, 5, 18, 0, 0, 77, 75, 1, 0, 0, 0, 77,
		78, 1, 0, 0, 0, 78, 80, 1, 0, 0, 0, 79, 81, 3, 14, 7, 0, 80, 79, 1, 0,
		0, 0, 80, 81, 1, 0, 0, 0, 81, 11, 1, 0, 0, 0, 82, 83, 5, 9, 0, 0, 83, 84,
		5, 10, 0, 0, 84, 85, 5, 15, 0, 0, 85, 86, 3, 14, 7, 0, 86, 13, 1, 0, 0,
		0, 87, 88, 5, 14, 0, 0, 88, 15, 1, 0, 0, 0, 89, 90, 5, 11, 0, 0, 90, 95,
		5, 18, 0, 0, 91, 92, 5, 12, 0, 0, 92, 94, 5, 18, 0, 0, 93, 91, 1, 0, 0,
		0, 94, 97, 1, 0, 0, 0, 95, 93, 1, 0, 0, 0, 95, 96, 1, 0, 0, 0, 96, 17,
		1, 0, 0, 0, 97, 95, 1, 0, 0, 0, 98, 99, 5, 18, 0, 0, 99, 100, 5, 13, 0,
		0, 100, 107, 5, 18, 0, 0, 101, 102, 5, 12, 0, 0, 102, 103, 5, 18, 0, 0,
		103, 104, 5, 13, 0, 0, 104, 106, 5, 18, 0, 0, 105, 101, 1, 0, 0, 0, 106,
		109, 1, 0, 0, 0, 107, 105, 1, 0, 0, 0, 107, 108, 1, 0, 0, 0, 108, 19, 1,
		0, 0, 0, 109, 107, 1, 0, 0, 0, 110, 112, 5, 16, 0, 0, 111, 113, 5, 18,
		0, 0, 112, 111, 1, 0, 0, 0, 112, 113, 1, 0, 0, 0, 113, 21, 1, 0, 0, 0,
		11, 40, 44, 53, 59, 67, 70, 77, 80, 95, 107, 112,
	}
	deserializer := antlr.NewATNDeserializer(nil)
	staticData.atn = deserializer.Deserialize(staticData.serializedATN)
	atn := staticData.atn
	staticData.decisionToDFA = make([]*antlr.DFA, len(atn.DecisionToState))
	decisionToDFA := staticData.decisionToDFA
	for index, state := range atn.DecisionToState {
		decisionToDFA[index] = antlr.NewDFA(state, index)
	}
}

// GravityExpressionParserInit initializes any static state used to implement GravityExpressionParser. By default the
// static state used to implement the parser is lazily initialized during the first call to
// NewGravityExpressionParser(). You can call this function if you wish to initialize the static state ahead
// of time.
func GravityExpressionParserInit() {
	staticData := &GravityExpressionParserStaticData
	staticData.once.Do(gravityexpressionParserInit)
}

// NewGravityExpressionParser produces a new parser instance for the optional input antlr.TokenStream.
func NewGravityExpressionParser(input antlr.TokenStream) *GravityExpressionParser {
	GravityExpressionParserInit()
	this := new(GravityExpressionParser)
	this.BaseParser = antlr.NewBaseParser(input)
	staticData := &GravityExpressionParserStaticData
	this.Interpreter = antlr.NewParserATNSimulator(this, staticData.atn, staticData.decisionToDFA, staticData.PredictionContextCache)
	this.RuleNames = staticData.RuleNames
	this.LiteralNames = staticData.LiteralNames
	this.SymbolicNames = staticData.SymbolicNames
	this.GrammarFileName = "GravityExpression.g4"

	return this
}

// GravityExpressionParser tokens.
const (
	GravityExpressionParserEOF        = antlr.TokenEOF
	GravityExpressionParserT__0       = 1
	GravityExpressionParserT__1       = 2
	GravityExpressionParserT__2       = 3
	GravityExpressionParserT__3       = 4
	GravityExpressionParserT__4       = 5
	GravityExpressionParserT__5       = 6
	GravityExpressionParserT__6       = 7
	GravityExpressionParserT__7       = 8
	GravityExpressionParserT__8       = 9
	GravityExpressionParserT__9       = 10
	GravityExpressionParserT__10      = 11
	GravityExpressionParserT__11      = 12
	GravityExpressionParserT__12      = 13
	GravityExpressionParserCRITERION  = 14
	GravityExpressionParserRULE_REF   = 15
	GravityExpressionParserNUMBER     = 16
	GravityExpressionParserCOMPARATOR = 17
	GravityExpressionParserIDENT      = 18
	GravityExpressionParserWS         = 19
)

// GravityExpressionParser rules.
const (
	GravityExpressionParserRULE_expression     = 0
	GravityExpressionParserRULE_constraintExpr = 1
	GravityExpressionParserRULE_thresholdExpr  = 2
	GravityExpressionParserRULE_evidenceExpr   = 3
	GravityExpressionParserRULE_priorityExpr   = 4
	GravityExpressionParserRULE_escalationExpr = 5
	GravityExpressionParserRULE_exceptionExpr  = 6
	GravityExpressionParserRULE_criterion      = 7
	GravityExpressionParserRULE_targetList     = 8
	GravityExpressionParserRULE_priorityOrder  = 9
	GravityExpressionParserRULE_quantity       = 10
)

// IExpressionContext is an interface to support dynamic dispatch.
type IExpressionContext interface {
	antlr.ParserRuleContext

	// GetParser returns the parser.
	GetParser() antlr.Parser

	// Getter signatures
	ConstraintExpr() IConstraintExprContext
	EOF() antlr.TerminalNode
	ThresholdExpr() IThresholdExprContext
	EvidenceExpr() IEvidenceExprContext
	PriorityExpr() IPriorityExprContext
	EscalationExpr() IEscalationExprContext
	ExceptionExpr() IExceptionExprContext

	// IsExpressionContext differentiates from other interfaces.
	IsExpressionContext()
}

type ExpressionContext struct {
	antlr.BaseParserRuleContext
	parser antlr.Parser
}

func NewEmptyExpressionContext() *ExpressionContext {
	var p = new(ExpressionContext)
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_expression
	return p
}

func InitEmptyExpressionContext(p *ExpressionContext) {
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_expression
}

func (*ExpressionContext) IsExpressionContext() {}

func NewExpressionContext(parser antlr.Parser, parent antlr.ParserRuleContext, invokingState int) *ExpressionContext {
	var p = new(ExpressionContext)

	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, parent, invokingState)

	p.parser = parser
	p.RuleIndex = GravityExpressionParserRULE_expression

	return p
}

func (s *ExpressionContext) GetParser() antlr.Parser { return s.parser }

func (s *ExpressionContext) ConstraintExpr() IConstraintExprContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(IConstraintExprContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(IConstraintExprContext)
}

func (s *ExpressionContext) EOF() antlr.TerminalNode {
	return s.GetToken(GravityExpressionParserEOF, 0)
}

func (s *ExpressionContext) ThresholdExpr() IThresholdExprContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(IThresholdExprContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(IThresholdExprContext)
}

func (s *ExpressionContext) EvidenceExpr() IEvidenceExprContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(IEvidenceExprContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(IEvidenceExprContext)
}

func (s *ExpressionContext) PriorityExpr() IPriorityExprContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(IPriorityExprContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(IPriorityExprContext)
}

func (s *ExpressionContext) EscalationExpr() IEscalationExprContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(IEscalationExprContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(IEscalationExprContext)
}

func (s *ExpressionContext) ExceptionExpr() IExceptionExprContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(IExceptionExprContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(IExceptionExprContext)
}

func (s *ExpressionContext) GetRuleContext() antlr.RuleContext {
	return s
}

func (s *ExpressionContext) ToStringTree(ruleNames []string, recog antlr.Recognizer) string {
	return antlr.TreesStringTree(s, ruleNames, recog)
}

func (s *ExpressionContext) Accept(visitor antlr.ParseTreeVisitor) interface{} {
	switch t := visitor.(type) {
	case GravityExpressionVisitor:
		return t.VisitExpression(s)

	default:
		return t.VisitChildren(s)
	}
}

func (p *GravityExpressionParser) Expression() (localctx IExpressionContext) {
	localctx = NewExpressionContext(p, p.GetParserRuleContext(), p.GetState())
	p.EnterRule(localctx, 0, GravityExpressionParserRULE_expression)
	p.SetState(40)
	p.GetErrorHandler().Sync(p)
	if p.HasError() {
		goto errorExit
	}

	switch p.GetTokenStream().LA(1) {
	case GravityExpressionParserT__0:
		p.EnterOuterAlt(localctx, 1)
		{
			p.SetState(22)
			p.ConstraintExpr()
		}
		{
			p.SetState(23)
			p.Match(GravityExpressionParserEOF)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}

	case GravityExpressionParserT__1:
		p.EnterOuterAlt(localctx, 2)
		{
			p.SetState(25)
			p.ThresholdExpr()
		}
		{
			p.SetState(26)
			p.Match(GravityExpressionParserEOF)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}

	case GravityExpressionParserT__2:
		p.EnterOuterAlt(localctx, 3)
		{
			p.SetState(28)
			p.EvidenceExpr()
		}
		{
			p.SetState(29)
			p.Match(GravityExpressionParserEOF)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}

	case GravityExpressionParserT__4:
		p.EnterOuterAlt(localctx, 4)
		{
			p.SetState(31)
			p.PriorityExpr()
		}
		{
			p.SetState(32)
			p.Match(GravityExpressionParserEOF)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}

	case GravityExpressionParserT__6:
		p.EnterOuterAlt(localctx, 5)
		{
			p.SetState(34)
			p.EscalationExpr()
		}
		{
			p.SetState(35)
			p.Match(GravityExpressionParserEOF)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}

	case GravityExpressionParserT__8:
		p.EnterOuterAlt(localctx, 6)
		{
			p.SetState(37)
			p.ExceptionExpr()
		}
		{
			p.SetState(38)
			p.Match(GravityExpressionParserEOF)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}

	default:
		p.SetError(antlr.NewNoViableAltException(p, nil, nil, nil, nil, nil))
		goto errorExit
	}

errorExit:
	if p.HasError() {
		v := p.GetError()
		localctx.SetException(v)
		p.GetErrorHandler().ReportError(p, v)
		p.GetErrorHandler().Recover(p, v)
		p.SetError(nil)
	}
	p.ExitRule()
	return localctx
	goto errorExit // Trick to prevent compiler error if the label is not used
}

// IConstraintExprContext is an interface to support dynamic dispatch.
type IConstraintExprContext interface {
	antlr.ParserRuleContext

	// GetParser returns the parser.
	GetParser() antlr.Parser

	// Getter signatures
	Criterion() ICriterionContext
	TargetList() ITargetListContext

	// IsConstraintExprContext differentiates from other interfaces.
	IsConstraintExprContext()
}

type ConstraintExprContext struct {
	antlr.BaseParserRuleContext
	parser antlr.Parser
}

func NewEmptyConstraintExprContext() *ConstraintExprContext {
	var p = new(ConstraintExprContext)
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_constraintExpr
	return p
}

func InitEmptyConstraintExprContext(p *ConstraintExprContext) {
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_constraintExpr
}

func (*ConstraintExprContext) IsConstraintExprContext() {}

func NewConstraintExprContext(parser antlr.Parser, parent antlr.ParserRuleContext, invokingState int) *ConstraintExprContext {
	var p = new(ConstraintExprContext)

	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, parent, invokingState)

	p.parser = parser
	p.RuleIndex = GravityExpressionParserRULE_constraintExpr

	return p
}

func (s *ConstraintExprContext) GetParser() antlr.Parser { return s.parser }

func (s *ConstraintExprContext) Criterion() ICriterionContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(ICriterionContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(ICriterionContext)
}

func (s *ConstraintExprContext) TargetList() ITargetListContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(ITargetListContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(ITargetListContext)
}

func (s *ConstraintExprContext) GetRuleContext() antlr.RuleContext {
	return s
}

func (s *ConstraintExprContext) ToStringTree(ruleNames []string, recog antlr.Recognizer) string {
	return antlr.TreesStringTree(s, ruleNames, recog)
}

func (s *ConstraintExprContext) Accept(visitor antlr.ParseTreeVisitor) interface{} {
	switch t := visitor.(type) {
	case GravityExpressionVisitor:
		return t.VisitConstraintExpr(s)

	default:
		return t.VisitChildren(s)
	}
}

func (p *GravityExpressionParser) ConstraintExpr() (localctx IConstraintExprContext) {
	localctx = NewConstraintExprContext(p, p.GetParserRuleContext(), p.GetState())
	p.EnterRule(localctx, 2, GravityExpressionParserRULE_constraintExpr)
	var _la int

	p.EnterOuterAlt(localctx, 1)
	{
		p.SetState(42)
		p.Match(GravityExpressionParserT__0)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	p.SetState(44)
	p.GetErrorHandler().Sync(p)
	if p.HasError() {
		goto errorExit
	}
	_la = p.GetTokenStream().LA(1)

	if _la == GravityExpressionParserT__10 {
		{
			p.SetState(43)
			p.TargetList()
		}

	}
	{
		p.SetState(46)
		p.Criterion()
	}

errorExit:
	if p.HasError() {
		v := p.GetError()
		localctx.SetException(v)
		p.GetErrorHandler().ReportError(p, v)
		p.GetErrorHandler().Recover(p, v)
		p.SetError(nil)
	}
	p.ExitRule()
	return localctx
	goto errorExit // Trick to prevent compiler error if the label is not used
}

// IThresholdExprContext is an interface to support dynamic dispatch.
type IThresholdExprContext interface {
	antlr.ParserRuleContext

	// GetParser returns the parser.
	GetParser() antlr.Parser

	// Getter signatures
	IDENT() antlr.TerminalNode
	COMPARATOR() antlr.TerminalNode
	Quantity() IQuantityContext
	Criterion() ICriterionContext

	// IsThresholdExprContext differentiates from other interfaces.
	IsThresholdExprContext()
}

type ThresholdExprContext struct {
	antlr.BaseParserRuleContext
	parser antlr.Parser
}

func NewEmptyThresholdExprContext() *ThresholdExprContext {
	var p = new(ThresholdExprContext)
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_thresholdExpr
	return p
}

func InitEmptyThresholdExprContext(p *ThresholdExprContext) {
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_thresholdExpr
}

func (*ThresholdExprContext) IsThresholdExprContext() {}

func NewThresholdExprContext(parser antlr.Parser, parent antlr.ParserRuleContext, invokingState int) *ThresholdExprContext {
	var p = new(ThresholdExprContext)

	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, parent, invokingState)

	p.parser = parser
	p.RuleIndex = GravityExpressionParserRULE_thresholdExpr

	return p
}

func (s *ThresholdExprContext) GetParser() antlr.Parser { return s.parser }

func (s *ThresholdExprContext) IDENT() antlr.TerminalNode {
	return s.GetToken(GravityExpressionParserIDENT, 0)
}

func (s *ThresholdExprContext) COMPARATOR() antlr.TerminalNode {
	return s.GetToken(GravityExpressionParserCOMPARATOR, 0)
}

func (s *ThresholdExprContext) Quantity() IQuantityContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(IQuantityContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(IQuantityContext)
}

func (s *ThresholdExprContext) Criterion() ICriterionContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(ICriterionContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(ICriterionContext)
}

func (s *ThresholdExprContext) GetRuleContext() antlr.RuleContext {
	return s
}

func (s *ThresholdExprContext) ToStringTree(ruleNames []string, recog antlr.Recognizer) string {
	return antlr.TreesStringTree(s, ruleNames, recog)
}

func (s *ThresholdExprContext) Accept(visitor antlr.ParseTreeVisitor) interface{} {
	switch t := visitor.(type) {
	case GravityExpressionVisitor:
		return t.VisitThresholdExpr(s)

	default:
		return t.VisitChildren(s)
	}
}

func (p *GravityExpressionParser) ThresholdExpr() (localctx IThresholdExprContext) {
	localctx = NewThresholdExprContext(p, p.GetParserRuleContext(), p.GetState())
	p.EnterRule(localctx, 4, GravityExpressionParserRULE_thresholdExpr)
	var _la int

	p.EnterOuterAlt(localctx, 1)
	{
		p.SetState(48)
		p.Match(GravityExpressionParserT__1)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	{
		p.SetState(49)
		p.Match(GravityExpressionParserIDENT)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	{
		p.SetState(50)
		p.Match(GravityExpressionParserCOMPARATOR)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	{
		p.SetState(51)
		p.Quantity()
	}
	p.SetState(53)
	p.GetErrorHandler().Sync(p)
	if p.HasError() {
		goto errorExit
	}
	_la = p.GetTokenStream().LA(1)

	if _la == GravityExpressionParserCRITERION {
		{
			p.SetState(52)
			p.Criterion()
		}

	}

errorExit:
	if p.HasError() {
		v := p.GetError()
		localctx.SetException(v)
		p.GetErrorHandler().ReportError(p, v)
		p.GetErrorHandler().Recover(p, v)
		p.SetError(nil)
	}
	p.ExitRule()
	return localctx
	goto errorExit // Trick to prevent compiler error if the label is not used
}

// IEvidenceExprContext is an interface to support dynamic dispatch.
type IEvidenceExprContext interface {
	antlr.ParserRuleContext

	// GetParser returns the parser.
	GetParser() antlr.Parser

	// Getter signatures
	Criterion() ICriterionContext
	NUMBER() antlr.TerminalNode
	IDENT() antlr.TerminalNode

	// IsEvidenceExprContext differentiates from other interfaces.
	IsEvidenceExprContext()
}

type EvidenceExprContext struct {
	antlr.BaseParserRuleContext
	parser antlr.Parser
}

func NewEmptyEvidenceExprContext() *EvidenceExprContext {
	var p = new(EvidenceExprContext)
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_evidenceExpr
	return p
}

func InitEmptyEvidenceExprContext(p *EvidenceExprContext) {
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_evidenceExpr
}

func (*EvidenceExprContext) IsEvidenceExprContext() {}

func NewEvidenceExprContext(parser antlr.Parser, parent antlr.ParserRuleContext, invokingState int) *EvidenceExprContext {
	var p = new(EvidenceExprContext)

	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, parent, invokingState)

	p.parser = parser
	p.RuleIndex = GravityExpressionParserRULE_evidenceExpr

	return p
}

func (s *EvidenceExprContext) GetParser() antlr.Parser { return s.parser }

func (s *EvidenceExprContext) Criterion() ICriterionContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(ICriterionContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(ICriterionContext)
}

func (s *EvidenceExprContext) NUMBER() antlr.TerminalNode {
	return s.GetToken(GravityExpressionParserNUMBER, 0)
}

func (s *EvidenceExprContext) IDENT() antlr.TerminalNode {
	return s.GetToken(GravityExpressionParserIDENT, 0)
}

func (s *EvidenceExprContext) GetRuleContext() antlr.RuleContext {
	return s
}

func (s *EvidenceExprContext) ToStringTree(ruleNames []string, recog antlr.Recognizer) string {
	return antlr.TreesStringTree(s, ruleNames, recog)
}

func (s *EvidenceExprContext) Accept(visitor antlr.ParseTreeVisitor) interface{} {
	switch t := visitor.(type) {
	case GravityExpressionVisitor:
		return t.VisitEvidenceExpr(s)

	default:
		return t.VisitChildren(s)
	}
}

func (p *GravityExpressionParser) EvidenceExpr() (localctx IEvidenceExprContext) {
	localctx = NewEvidenceExprContext(p, p.GetParserRuleContext(), p.GetState())
	p.EnterRule(localctx, 6, GravityExpressionParserRULE_evidenceExpr)
	var _la int

	p.EnterOuterAlt(localctx, 1)
	{
		p.SetState(55)
		p.Match(GravityExpressionParserT__2)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	p.SetState(59)
	p.GetErrorHandler().Sync(p)
	if p.HasError() {
		goto errorExit
	}
	_la = p.GetTokenStream().LA(1)

	if _la == GravityExpressionParserT__3 {
		{
			p.SetState(56)
			p.Match(GravityExpressionParserT__3)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}
		{
			p.SetState(57)
			p.Match(GravityExpressionParserNUMBER)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}
		{
			p.SetState(58)
			p.Match(GravityExpressionParserIDENT)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}

	}
	{
		p.SetState(61)
		p.Criterion()
	}

errorExit:
	if p.HasError() {
		v := p.GetError()
		localctx.SetException(v)
		p.GetErrorHandler().ReportError(p, v)
		p.GetErrorHandler().Recover(p, v)
		p.SetError(nil)
	}
	p.ExitRule()
	return localctx
	goto errorExit // Trick to prevent compiler error if the label is not used
}

// IPriorityExprContext is an interface to support dynamic dispatch.
type IPriorityExprContext interface {
	antlr.ParserRuleContext

	// GetParser returns the parser.
	GetParser() antlr.Parser

	// Getter signatures
	PriorityOrder() IPriorityOrderContext
	IDENT() antlr.TerminalNode
	Criterion() ICriterionContext

	// IsPriorityExprContext differentiates from other interfaces.
	IsPriorityExprContext()
}

type PriorityExprContext struct {
	antlr.BaseParserRuleContext
	parser antlr.Parser
}

func NewEmptyPriorityExprContext() *PriorityExprContext {
	var p = new(PriorityExprContext)
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_priorityExpr
	return p
}

func InitEmptyPriorityExprContext(p *PriorityExprContext) {
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_priorityExpr
}

func (*PriorityExprContext) IsPriorityExprContext() {}

func NewPriorityExprContext(parser antlr.Parser, parent antlr.ParserRuleContext, invokingState int) *PriorityExprContext {
	var p = new(PriorityExprContext)

	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, parent, invokingState)

	p.parser = parser
	p.RuleIndex = GravityExpressionParserRULE_priorityExpr

	return p
}

func (s *PriorityExprContext) GetParser() antlr.Parser { return s.parser }

func (s *PriorityExprContext) PriorityOrder() IPriorityOrderContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(IPriorityOrderContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(IPriorityOrderContext)
}

func (s *PriorityExprContext) IDENT() antlr.TerminalNode {
	return s.GetToken(GravityExpressionParserIDENT, 0)
}

func (s *PriorityExprContext) Criterion() ICriterionContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(ICriterionContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(ICriterionContext)
}

func (s *PriorityExprContext) GetRuleContext() antlr.RuleContext {
	return s
}

func (s *PriorityExprContext) ToStringTree(ruleNames []string, recog antlr.Recognizer) string {
	return antlr.TreesStringTree(s, ruleNames, recog)
}

func (s *PriorityExprContext) Accept(visitor antlr.ParseTreeVisitor) interface{} {
	switch t := visitor.(type) {
	case GravityExpressionVisitor:
		return t.VisitPriorityExpr(s)

	default:
		return t.VisitChildren(s)
	}
}

func (p *GravityExpressionParser) PriorityExpr() (localctx IPriorityExprContext) {
	localctx = NewPriorityExprContext(p, p.GetParserRuleContext(), p.GetState())
	p.EnterRule(localctx, 8, GravityExpressionParserRULE_priorityExpr)
	var _la int

	p.EnterOuterAlt(localctx, 1)
	{
		p.SetState(63)
		p.Match(GravityExpressionParserT__4)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	{
		p.SetState(64)
		p.PriorityOrder()
	}
	p.SetState(67)
	p.GetErrorHandler().Sync(p)
	if p.HasError() {
		goto errorExit
	}
	_la = p.GetTokenStream().LA(1)

	if _la == GravityExpressionParserT__5 {
		{
			p.SetState(65)
			p.Match(GravityExpressionParserT__5)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}
		{
			p.SetState(66)
			p.Match(GravityExpressionParserIDENT)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}

	}
	p.SetState(70)
	p.GetErrorHandler().Sync(p)
	if p.HasError() {
		goto errorExit
	}
	_la = p.GetTokenStream().LA(1)

	if _la == GravityExpressionParserCRITERION {
		{
			p.SetState(69)
			p.Criterion()
		}

	}

errorExit:
	if p.HasError() {
		v := p.GetError()
		localctx.SetException(v)
		p.GetErrorHandler().ReportError(p, v)
		p.GetErrorHandler().Recover(p, v)
		p.SetError(nil)
	}
	p.ExitRule()
	return localctx
	goto errorExit // Trick to prevent compiler error if the label is not used
}

// IEscalationExprContext is an interface to support dynamic dispatch.
type IEscalationExprContext interface {
	antlr.ParserRuleContext

	// GetParser returns the parser.
	GetParser() antlr.Parser

	// Getter signatures
	AllIDENT() []antlr.TerminalNode
	IDENT(i int) antlr.TerminalNode
	Criterion() ICriterionContext

	// IsEscalationExprContext differentiates from other interfaces.
	IsEscalationExprContext()
}

type EscalationExprContext struct {
	antlr.BaseParserRuleContext
	parser antlr.Parser
}

func NewEmptyEscalationExprContext() *EscalationExprContext {
	var p = new(EscalationExprContext)
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_escalationExpr
	return p
}

func InitEmptyEscalationExprContext(p *EscalationExprContext) {
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_escalationExpr
}

func (*EscalationExprContext) IsEscalationExprContext() {}

func NewEscalationExprContext(parser antlr.Parser, parent antlr.ParserRuleContext, invokingState int) *EscalationExprContext {
	var p = new(EscalationExprContext)

	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, parent, invokingState)

	p.parser = parser
	p.RuleIndex = GravityExpressionParserRULE_escalationExpr

	return p
}

func (s *EscalationExprContext) GetParser() antlr.Parser { return s.parser }

func (s *EscalationExprContext) AllIDENT() []antlr.TerminalNode {
	return s.GetTokens(GravityExpressionParserIDENT)
}

func (s *EscalationExprContext) IDENT(i int) antlr.TerminalNode {
	return s.GetToken(GravityExpressionParserIDENT, i)
}

func (s *EscalationExprContext) Criterion() ICriterionContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(ICriterionContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(ICriterionContext)
}

func (s *EscalationExprContext) GetRuleContext() antlr.RuleContext {
	return s
}

func (s *EscalationExprContext) ToStringTree(ruleNames []string, recog antlr.Recognizer) string {
	return antlr.TreesStringTree(s, ruleNames, recog)
}

func (s *EscalationExprContext) Accept(visitor antlr.ParseTreeVisitor) interface{} {
	switch t := visitor.(type) {
	case GravityExpressionVisitor:
		return t.VisitEscalationExpr(s)

	default:
		return t.VisitChildren(s)
	}
}

func (p *GravityExpressionParser) EscalationExpr() (localctx IEscalationExprContext) {
	localctx = NewEscalationExprContext(p, p.GetParserRuleContext(), p.GetState())
	p.EnterRule(localctx, 10, GravityExpressionParserRULE_escalationExpr)
	var _la int

	p.EnterOuterAlt(localctx, 1)
	{
		p.SetState(72)
		p.Match(GravityExpressionParserT__6)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	{
		p.SetState(73)
		p.Match(GravityExpressionParserT__7)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	{
		p.SetState(74)
		p.Match(GravityExpressionParserIDENT)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	p.SetState(77)
	p.GetErrorHandler().Sync(p)
	if p.HasError() {
		goto errorExit
	}
	_la = p.GetTokenStream().LA(1)

	if _la == GravityExpressionParserT__5 {
		{
			p.SetState(75)
			p.Match(GravityExpressionParserT__5)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}
		{
			p.SetState(76)
			p.Match(GravityExpressionParserIDENT)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}

	}
	p.SetState(80)
	p.GetErrorHandler().Sync(p)
	if p.HasError() {
		goto errorExit
	}
	_la = p.GetTokenStream().LA(1)

	if _la == GravityExpressionParserCRITERION {
		{
			p.SetState(79)
			p.Criterion()
		}

	}

errorExit:
	if p.HasError() {
		v := p.GetError()
		localctx.SetException(v)
		p.GetErrorHandler().ReportError(p, v)
		p.GetErrorHandler().Recover(p, v)
		p.SetError(nil)
	}
	p.ExitRule()
	return localctx
	goto errorExit // Trick to prevent compiler error if the label is not used
}

// IExceptionExprContext is an interface to support dynamic dispatch.
type IExceptionExprContext interface {
	antlr.ParserRuleContext

	// GetParser returns the parser.
	GetParser() antlr.Parser

	// Getter signatures
	RULE_REF() antlr.TerminalNode
	Criterion() ICriterionContext

	// IsExceptionExprContext differentiates from other interfaces.
	IsExceptionExprContext()
}

type ExceptionExprContext struct {
	antlr.BaseParserRuleContext
	parser antlr.Parser
}

func NewEmptyExceptionExprContext() *ExceptionExprContext {
	var p = new(ExceptionExprContext)
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_exceptionExpr
	return p
}

func InitEmptyExceptionExprContext(p *ExceptionExprContext) {
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_exceptionExpr
}

func (*ExceptionExprContext) IsExceptionExprContext() {}

func NewExceptionExprContext(parser antlr.Parser, parent antlr.ParserRuleContext, invokingState int) *ExceptionExprContext {
	var p = new(ExceptionExprContext)

	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, parent, invokingState)

	p.parser = parser
	p.RuleIndex = GravityExpressionParserRULE_exceptionExpr

	return p
}

func (s *ExceptionExprContext) GetParser() antlr.Parser { return s.parser }

func (s *ExceptionExprContext) RULE_REF() antlr.TerminalNode {
	return s.GetToken(GravityExpressionParserRULE_REF, 0)
}

func (s *ExceptionExprContext) Criterion() ICriterionContext {
	var t antlr.RuleContext
	for _, ctx := range s.GetChildren() {
		if _, ok := ctx.(ICriterionContext); ok {
			t = ctx.(antlr.RuleContext)
			break
		}
	}

	if t == nil {
		return nil
	}

	return t.(ICriterionContext)
}

func (s *ExceptionExprContext) GetRuleContext() antlr.RuleContext {
	return s
}

func (s *ExceptionExprContext) ToStringTree(ruleNames []string, recog antlr.Recognizer) string {
	return antlr.TreesStringTree(s, ruleNames, recog)
}

func (s *ExceptionExprContext) Accept(visitor antlr.ParseTreeVisitor) interface{} {
	switch t := visitor.(type) {
	case GravityExpressionVisitor:
		return t.VisitExceptionExpr(s)

	default:
		return t.VisitChildren(s)
	}
}

func (p *GravityExpressionParser) ExceptionExpr() (localctx IExceptionExprContext) {
	localctx = NewExceptionExprContext(p, p.GetParserRuleContext(), p.GetState())
	p.EnterRule(localctx, 12, GravityExpressionParserRULE_exceptionExpr)
	p.EnterOuterAlt(localctx, 1)
	{
		p.SetState(82)
		p.Match(GravityExpressionParserT__8)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	{
		p.SetState(83)
		p.Match(GravityExpressionParserT__9)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	{
		p.SetState(84)
		p.Match(GravityExpressionParserRULE_REF)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	{
		p.SetState(85)
		p.Criterion()
	}

errorExit:
	if p.HasError() {
		v := p.GetError()
		localctx.SetException(v)
		p.GetErrorHandler().ReportError(p, v)
		p.GetErrorHandler().Recover(p, v)
		p.SetError(nil)
	}
	p.ExitRule()
	return localctx
	goto errorExit // Trick to prevent compiler error if the label is not used
}

// ICriterionContext is an interface to support dynamic dispatch.
type ICriterionContext interface {
	antlr.ParserRuleContext

	// GetParser returns the parser.
	GetParser() antlr.Parser

	// Getter signatures
	CRITERION() antlr.TerminalNode

	// IsCriterionContext differentiates from other interfaces.
	IsCriterionContext()
}

type CriterionContext struct {
	antlr.BaseParserRuleContext
	parser antlr.Parser
}

func NewEmptyCriterionContext() *CriterionContext {
	var p = new(CriterionContext)
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_criterion
	return p
}

func InitEmptyCriterionContext(p *CriterionContext) {
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_criterion
}

func (*CriterionContext) IsCriterionContext() {}

func NewCriterionContext(parser antlr.Parser, parent antlr.ParserRuleContext, invokingState int) *CriterionContext {
	var p = new(CriterionContext)

	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, parent, invokingState)

	p.parser = parser
	p.RuleIndex = GravityExpressionParserRULE_criterion

	return p
}

func (s *CriterionContext) GetParser() antlr.Parser { return s.parser }

func (s *CriterionContext) CRITERION() antlr.TerminalNode {
	return s.GetToken(GravityExpressionParserCRITERION, 0)
}

func (s *CriterionContext) GetRuleContext() antlr.RuleContext {
	return s
}

func (s *CriterionContext) ToStringTree(ruleNames []string, recog antlr.Recognizer) string {
	return antlr.TreesStringTree(s, ruleNames, recog)
}

func (s *CriterionContext) Accept(visitor antlr.ParseTreeVisitor) interface{} {
	switch t := visitor.(type) {
	case GravityExpressionVisitor:
		return t.VisitCriterion(s)

	default:
		return t.VisitChildren(s)
	}
}

func (p *GravityExpressionParser) Criterion() (localctx ICriterionContext) {
	localctx = NewCriterionContext(p, p.GetParserRuleContext(), p.GetState())
	p.EnterRule(localctx, 14, GravityExpressionParserRULE_criterion)
	p.EnterOuterAlt(localctx, 1)
	{
		p.SetState(87)
		p.Match(GravityExpressionParserCRITERION)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}

errorExit:
	if p.HasError() {
		v := p.GetError()
		localctx.SetException(v)
		p.GetErrorHandler().ReportError(p, v)
		p.GetErrorHandler().Recover(p, v)
		p.SetError(nil)
	}
	p.ExitRule()
	return localctx
	goto errorExit // Trick to prevent compiler error if the label is not used
}

// ITargetListContext is an interface to support dynamic dispatch.
type ITargetListContext interface {
	antlr.ParserRuleContext

	// GetParser returns the parser.
	GetParser() antlr.Parser

	// Getter signatures
	AllIDENT() []antlr.TerminalNode
	IDENT(i int) antlr.TerminalNode

	// IsTargetListContext differentiates from other interfaces.
	IsTargetListContext()
}

type TargetListContext struct {
	antlr.BaseParserRuleContext
	parser antlr.Parser
}

func NewEmptyTargetListContext() *TargetListContext {
	var p = new(TargetListContext)
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_targetList
	return p
}

func InitEmptyTargetListContext(p *TargetListContext) {
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_targetList
}

func (*TargetListContext) IsTargetListContext() {}

func NewTargetListContext(parser antlr.Parser, parent antlr.ParserRuleContext, invokingState int) *TargetListContext {
	var p = new(TargetListContext)

	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, parent, invokingState)

	p.parser = parser
	p.RuleIndex = GravityExpressionParserRULE_targetList

	return p
}

func (s *TargetListContext) GetParser() antlr.Parser { return s.parser }

func (s *TargetListContext) AllIDENT() []antlr.TerminalNode {
	return s.GetTokens(GravityExpressionParserIDENT)
}

func (s *TargetListContext) IDENT(i int) antlr.TerminalNode {
	return s.GetToken(GravityExpressionParserIDENT, i)
}

func (s *TargetListContext) GetRuleContext() antlr.RuleContext {
	return s
}

func (s *TargetListContext) ToStringTree(ruleNames []string, recog antlr.Recognizer) string {
	return antlr.TreesStringTree(s, ruleNames, recog)
}

func (s *TargetListContext) Accept(visitor antlr.ParseTreeVisitor) interface{} {
	switch t := visitor.(type) {
	case GravityExpressionVisitor:
		return t.VisitTargetList(s)

	default:
		return t.VisitChildren(s)
	}
}

func (p *GravityExpressionParser) TargetList() (localctx ITargetListContext) {
	localctx = NewTargetListContext(p, p.GetParserRuleContext(), p.GetState())
	p.EnterRule(localctx, 16, GravityExpressionParserRULE_targetList)
	var _la int

	p.EnterOuterAlt(localctx, 1)
	{
		p.SetState(89)
		p.Match(GravityExpressionParserT__10)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	{
		p.SetState(90)
		p.Match(GravityExpressionParserIDENT)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	p.SetState(95)
	p.GetErrorHandler().Sync(p)
	if p.HasError() {
		goto errorExit
	}
	_la = p.GetTokenStream().LA(1)

	for _la == GravityExpressionParserT__11 {
		{
			p.SetState(91)
			p.Match(GravityExpressionParserT__11)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}
		{
			p.SetState(92)
			p.Match(GravityExpressionParserIDENT)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}

		p.SetState(97)
		p.GetErrorHandler().Sync(p)
		if p.HasError() {
			goto errorExit
		}
		_la = p.GetTokenStream().LA(1)
	}

errorExit:
	if p.HasError() {
		v := p.GetError()
		localctx.SetException(v)
		p.GetErrorHandler().ReportError(p, v)
		p.GetErrorHandler().Recover(p, v)
		p.SetError(nil)
	}
	p.ExitRule()
	return localctx
	goto errorExit // Trick to prevent compiler error if the label is not used
}

// IPriorityOrderContext is an interface to support dynamic dispatch.
type IPriorityOrderContext interface {
	antlr.ParserRuleContext

	// GetParser returns the parser.
	GetParser() antlr.Parser

	// Getter signatures
	AllIDENT() []antlr.TerminalNode
	IDENT(i int) antlr.TerminalNode

	// IsPriorityOrderContext differentiates from other interfaces.
	IsPriorityOrderContext()
}

type PriorityOrderContext struct {
	antlr.BaseParserRuleContext
	parser antlr.Parser
}

func NewEmptyPriorityOrderContext() *PriorityOrderContext {
	var p = new(PriorityOrderContext)
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_priorityOrder
	return p
}

func InitEmptyPriorityOrderContext(p *PriorityOrderContext) {
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_priorityOrder
}

func (*PriorityOrderContext) IsPriorityOrderContext() {}

func NewPriorityOrderContext(parser antlr.Parser, parent antlr.ParserRuleContext, invokingState int) *PriorityOrderContext {
	var p = new(PriorityOrderContext)

	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, parent, invokingState)

	p.parser = parser
	p.RuleIndex = GravityExpressionParserRULE_priorityOrder

	return p
}

func (s *PriorityOrderContext) GetParser() antlr.Parser { return s.parser }

func (s *PriorityOrderContext) AllIDENT() []antlr.TerminalNode {
	return s.GetTokens(GravityExpressionParserIDENT)
}

func (s *PriorityOrderContext) IDENT(i int) antlr.TerminalNode {
	return s.GetToken(GravityExpressionParserIDENT, i)
}

func (s *PriorityOrderContext) GetRuleContext() antlr.RuleContext {
	return s
}

func (s *PriorityOrderContext) ToStringTree(ruleNames []string, recog antlr.Recognizer) string {
	return antlr.TreesStringTree(s, ruleNames, recog)
}

func (s *PriorityOrderContext) Accept(visitor antlr.ParseTreeVisitor) interface{} {
	switch t := visitor.(type) {
	case GravityExpressionVisitor:
		return t.VisitPriorityOrder(s)

	default:
		return t.VisitChildren(s)
	}
}

func (p *GravityExpressionParser) PriorityOrder() (localctx IPriorityOrderContext) {
	localctx = NewPriorityOrderContext(p, p.GetParserRuleContext(), p.GetState())
	p.EnterRule(localctx, 18, GravityExpressionParserRULE_priorityOrder)
	var _la int

	p.EnterOuterAlt(localctx, 1)
	{
		p.SetState(98)
		p.Match(GravityExpressionParserIDENT)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	{
		p.SetState(99)
		p.Match(GravityExpressionParserT__12)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	{
		p.SetState(100)
		p.Match(GravityExpressionParserIDENT)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	p.SetState(107)
	p.GetErrorHandler().Sync(p)
	if p.HasError() {
		goto errorExit
	}
	_la = p.GetTokenStream().LA(1)

	for _la == GravityExpressionParserT__11 {
		{
			p.SetState(101)
			p.Match(GravityExpressionParserT__11)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}
		{
			p.SetState(102)
			p.Match(GravityExpressionParserIDENT)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}
		{
			p.SetState(103)
			p.Match(GravityExpressionParserT__12)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}
		{
			p.SetState(104)
			p.Match(GravityExpressionParserIDENT)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}

		p.SetState(109)
		p.GetErrorHandler().Sync(p)
		if p.HasError() {
			goto errorExit
		}
		_la = p.GetTokenStream().LA(1)
	}

errorExit:
	if p.HasError() {
		v := p.GetError()
		localctx.SetException(v)
		p.GetErrorHandler().ReportError(p, v)
		p.GetErrorHandler().Recover(p, v)
		p.SetError(nil)
	}
	p.ExitRule()
	return localctx
	goto errorExit // Trick to prevent compiler error if the label is not used
}

// IQuantityContext is an interface to support dynamic dispatch.
type IQuantityContext interface {
	antlr.ParserRuleContext

	// GetParser returns the parser.
	GetParser() antlr.Parser

	// Getter signatures
	NUMBER() antlr.TerminalNode
	IDENT() antlr.TerminalNode

	// IsQuantityContext differentiates from other interfaces.
	IsQuantityContext()
}

type QuantityContext struct {
	antlr.BaseParserRuleContext
	parser antlr.Parser
}

func NewEmptyQuantityContext() *QuantityContext {
	var p = new(QuantityContext)
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_quantity
	return p
}

func InitEmptyQuantityContext(p *QuantityContext) {
	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, nil, -1)
	p.RuleIndex = GravityExpressionParserRULE_quantity
}

func (*QuantityContext) IsQuantityContext() {}

func NewQuantityContext(parser antlr.Parser, parent antlr.ParserRuleContext, invokingState int) *QuantityContext {
	var p = new(QuantityContext)

	antlr.InitBaseParserRuleContext(&p.BaseParserRuleContext, parent, invokingState)

	p.parser = parser
	p.RuleIndex = GravityExpressionParserRULE_quantity

	return p
}

func (s *QuantityContext) GetParser() antlr.Parser { return s.parser }

func (s *QuantityContext) NUMBER() antlr.TerminalNode {
	return s.GetToken(GravityExpressionParserNUMBER, 0)
}

func (s *QuantityContext) IDENT() antlr.TerminalNode {
	return s.GetToken(GravityExpressionParserIDENT, 0)
}

func (s *QuantityContext) GetRuleContext() antlr.RuleContext {
	return s
}

func (s *QuantityContext) ToStringTree(ruleNames []string, recog antlr.Recognizer) string {
	return antlr.TreesStringTree(s, ruleNames, recog)
}

func (s *QuantityContext) Accept(visitor antlr.ParseTreeVisitor) interface{} {
	switch t := visitor.(type) {
	case GravityExpressionVisitor:
		return t.VisitQuantity(s)

	default:
		return t.VisitChildren(s)
	}
}

func (p *GravityExpressionParser) Quantity() (localctx IQuantityContext) {
	localctx = NewQuantityContext(p, p.GetParserRuleContext(), p.GetState())
	p.EnterRule(localctx, 20, GravityExpressionParserRULE_quantity)
	var _la int

	p.EnterOuterAlt(localctx, 1)
	{
		p.SetState(110)
		p.Match(GravityExpressionParserNUMBER)
		if p.HasError() {
			// Recognition error - abort rule
			goto errorExit
		}
	}
	p.SetState(112)
	p.GetErrorHandler().Sync(p)
	if p.HasError() {
		goto errorExit
	}
	_la = p.GetTokenStream().LA(1)

	if _la == GravityExpressionParserIDENT {
		{
			p.SetState(111)
			p.Match(GravityExpressionParserIDENT)
			if p.HasError() {
				// Recognition error - abort rule
				goto errorExit
			}
		}

	}

errorExit:
	if p.HasError() {
		v := p.GetError()
		localctx.SetException(v)
		p.GetErrorHandler().ReportError(p, v)
		p.GetErrorHandler().Recover(p, v)
		p.SetError(nil)
	}
	p.ExitRule()
	return localctx
	goto errorExit // Trick to prevent compiler error if the label is not used
}
