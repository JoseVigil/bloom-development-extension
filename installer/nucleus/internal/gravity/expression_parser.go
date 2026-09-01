package gravity

import (
	"strconv"
	"strings"

	"github.com/antlr4-go/antlr/v4"
)

type expressionErrorListener struct {
	*antlr.DefaultErrorListener
	input  antlr.CharStream
	errors []*GravityExpressionError
}

func (l *expressionErrorListener) SyntaxError(_ antlr.Recognizer, offendingSymbol interface{}, line, column int, msg string, _ antlr.RecognitionException) {
	offset := l.input.Index()
	if token, ok := offendingSymbol.(antlr.Token); ok {
		offset = token.GetStart()
	}
	l.errors = append(l.errors, syntaxExpressionError(msg, offset, line, column, nil))
}

func syntaxExpressionError(message string, offset, line, column int, expected []string) *GravityExpressionError {
	return &GravityExpressionError{
		ErrorClass: "syntax", ReasonCode: "GRAVITY_EXPRESSION_SYNTAX_ERROR", Message: message,
		Position: &ExpressionErrorPosition{Offset: offset, Line: line, Column: column}, ExpectedTokens: expected,
	}
}

func Parse(expression string) (GravityExpressionAST, error) {
	input := antlr.NewInputStream(expression)
	listener := &expressionErrorListener{DefaultErrorListener: antlr.NewDefaultErrorListener(), input: input}
	lexer := NewGravityExpressionLexer(input)
	lexer.RemoveErrorListeners()
	lexer.AddErrorListener(listener)
	tokens := antlr.NewCommonTokenStream(lexer, antlr.TokenDefaultChannel)
	parser := NewGravityExpressionParser(tokens)
	parser.RemoveErrorListeners()
	parser.AddErrorListener(listener)
	tree := parser.Expression().(*ExpressionContext)
	if len(listener.errors) > 0 {
		return nil, listener.errors[0]
	}
	return buildExpressionAST(expression, tree)
}

func buildExpressionAST(raw string, tree *ExpressionContext) (GravityExpressionAST, error) {
	if ctx := tree.ConstraintExpr(); ctx != nil {
		value := ctx.(*ConstraintExprContext)
		criterion, err := requiredCriterion(value.Criterion(), raw)
		if err != nil {
			return nil, err
		}
		var targets []string
		if value.TargetList() != nil {
			targets = terminalTexts(value.TargetList().(*TargetListContext).AllIDENT())
		}
		return ConstraintNode{ExpressionNodeBase: expressionBase("constraint", raw, criterion, false), Targets: targets}, nil
	}
	if ctx := tree.ThresholdExpr(); ctx != nil {
		value := ctx.(*ThresholdExprContext)
		quantity := value.Quantity().(*QuantityContext)
		criterion, err := optionalCriterion(value.Criterion(), raw)
		if err != nil {
			return nil, err
		}
		number, err := strconv.ParseFloat(quantity.NUMBER().GetText(), 64)
		if err != nil {
			return nil, syntaxExpressionError("invalid threshold quantity", quantity.GetStart().GetStart(), quantity.GetStart().GetLine(), quantity.GetStart().GetColumn(), nil)
		}
		return ThresholdNode{
			ExpressionNodeBase: expressionBase("threshold", raw, criterion, true),
			Metric:             value.IDENT().GetText(), Comparator: value.COMPARATOR().GetText(),
			Quantity: Quantity{Value: number, Unit: terminalTextPointer(quantity.IDENT())},
		}, nil
	}
	if ctx := tree.EvidenceExpr(); ctx != nil {
		value := ctx.(*EvidenceExprContext)
		criterion, err := requiredCriterion(value.Criterion(), raw)
		if err != nil {
			return nil, err
		}
		var requirement *EvidenceRequirement
		if value.NUMBER() != nil {
			count, err := strconv.ParseFloat(value.NUMBER().GetText(), 64)
			if err != nil {
				return nil, syntaxExpressionError("invalid evidence minimum", value.GetStart().GetStart(), value.GetStart().GetLine(), value.GetStart().GetColumn(), nil)
			}
			requirement = &EvidenceRequirement{MinCount: count, Kind: value.IDENT().GetText()}
		}
		return EvidenceNode{ExpressionNodeBase: expressionBase("evidence", raw, criterion, false), Requirement: requirement}, nil
	}
	if ctx := tree.PriorityExpr(); ctx != nil {
		value := ctx.(*PriorityExprContext)
		criterion, err := optionalCriterion(value.Criterion(), raw)
		if err != nil {
			return nil, err
		}
		identifiers := terminalTexts(value.PriorityOrder().(*PriorityOrderContext).AllIDENT())
		order := make([]PriorityPair, 0, len(identifiers)/2)
		for index := 0; index < len(identifiers); index += 2 {
			if identifiers[index] == identifiers[index+1] {
				token := value.PriorityOrder().(*PriorityOrderContext).IDENT(index)
				return nil, syntaxExpressionError("WF-5: priority pair must declare distinct higher and lower identifiers", token.GetSymbol().GetStart(), token.GetSymbol().GetLine(), token.GetSymbol().GetColumn(), nil)
			}
			order = append(order, PriorityPair{Higher: identifiers[index], Lower: identifiers[index+1]})
		}
		return PriorityNode{
			ExpressionNodeBase: expressionBase("priority", raw, criterion, true),
			Order:              order, CollisionClass: terminalTextPointer(value.IDENT()),
		}, nil
	}
	if ctx := tree.EscalationExpr(); ctx != nil {
		value := ctx.(*EscalationExprContext)
		criterion, err := optionalCriterion(value.Criterion(), raw)
		if err != nil {
			return nil, err
		}
		identifiers := terminalTexts(value.AllIDENT())
		var trigger *string
		if len(identifiers) == 2 {
			trigger = &identifiers[1]
		}
		return EscalationNode{
			ExpressionNodeBase: expressionBase("escalation", raw, criterion, true),
			EscalateTo:         identifiers[0], TriggerClass: trigger,
		}, nil
	}
	if ctx := tree.ExceptionExpr(); ctx != nil {
		value := ctx.(*ExceptionExprContext)
		criterion, err := requiredCriterion(value.Criterion(), raw)
		if err != nil {
			return nil, err
		}
		return ExceptionNode{ExpressionNodeBase: expressionBase("exception", raw, criterion, false), ExceptionOf: value.POSTURE_REF().GetText()}, nil
	}
	return nil, syntaxExpressionError("expression does not match a Gravity primitive", 0, 1, 0, nil)
}

func expressionBase(primitive, raw string, criterion *string, computable bool) ExpressionNodeBase {
	return ExpressionNodeBase{GrammarVersion: GravityExpressionGrammarVersion, Primitive: primitive, Raw: raw, Criterion: criterion, PredicateComputable: computable}
}

func requiredCriterion(ctx ICriterionContext, raw string) (*string, error) {
	criterion, err := optionalCriterion(ctx, raw)
	if err != nil {
		return nil, err
	}
	if criterion == nil {
		offset := strings.Index(raw, "::")
		if offset < 0 {
			offset = len(raw)
		}
		return nil, syntaxExpressionError("WF-2/WF-3: non-empty criterion is required", offset, 1, offset, []string{":: <criterion>"})
	}
	return criterion, nil
}

func optionalCriterion(ctx ICriterionContext, raw string) (*string, error) {
	if ctx == nil {
		return nil, nil
	}
	value := strings.TrimSpace(strings.TrimPrefix(ctx.(*CriterionContext).CRITERION().GetText(), "::"))
	if value == "" {
		offset := strings.Index(raw, "::")
		return nil, syntaxExpressionError("WF-2: criterion must contain non-whitespace text", offset, 1, offset, nil)
	}
	return &value, nil
}

func terminalTexts(nodes []antlr.TerminalNode) []string {
	values := make([]string, len(nodes))
	for index, node := range nodes {
		values[index] = node.GetText()
	}
	return values
}

func terminalTextPointer(node antlr.TerminalNode) *string {
	if node == nil {
		return nil
	}
	value := node.GetText()
	return &value
}
