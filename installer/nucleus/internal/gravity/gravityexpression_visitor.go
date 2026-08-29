// Code generated from contracts/gravity/GravityExpression.g4 by ANTLR 4.13.2. DO NOT EDIT.

package gravity // GravityExpression
import "github.com/antlr4-go/antlr/v4"

// A complete Visitor for a parse tree produced by GravityExpressionParser.
type GravityExpressionVisitor interface {
	antlr.ParseTreeVisitor

	// Visit a parse tree produced by GravityExpressionParser#expression.
	VisitExpression(ctx *ExpressionContext) interface{}

	// Visit a parse tree produced by GravityExpressionParser#constraintExpr.
	VisitConstraintExpr(ctx *ConstraintExprContext) interface{}

	// Visit a parse tree produced by GravityExpressionParser#thresholdExpr.
	VisitThresholdExpr(ctx *ThresholdExprContext) interface{}

	// Visit a parse tree produced by GravityExpressionParser#evidenceExpr.
	VisitEvidenceExpr(ctx *EvidenceExprContext) interface{}

	// Visit a parse tree produced by GravityExpressionParser#priorityExpr.
	VisitPriorityExpr(ctx *PriorityExprContext) interface{}

	// Visit a parse tree produced by GravityExpressionParser#escalationExpr.
	VisitEscalationExpr(ctx *EscalationExprContext) interface{}

	// Visit a parse tree produced by GravityExpressionParser#exceptionExpr.
	VisitExceptionExpr(ctx *ExceptionExprContext) interface{}

	// Visit a parse tree produced by GravityExpressionParser#criterion.
	VisitCriterion(ctx *CriterionContext) interface{}

	// Visit a parse tree produced by GravityExpressionParser#targetList.
	VisitTargetList(ctx *TargetListContext) interface{}

	// Visit a parse tree produced by GravityExpressionParser#priorityOrder.
	VisitPriorityOrder(ctx *PriorityOrderContext) interface{}

	// Visit a parse tree produced by GravityExpressionParser#quantity.
	VisitQuantity(ctx *QuantityContext) interface{}
}
