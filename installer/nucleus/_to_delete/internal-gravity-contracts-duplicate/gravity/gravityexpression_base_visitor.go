// Code generated from contracts/gravity/GravityExpression.g4 by ANTLR 4.13.2. DO NOT EDIT.

package gravity // GravityExpression
import "github.com/antlr4-go/antlr/v4"

type BaseGravityExpressionVisitor struct {
	*antlr.BaseParseTreeVisitor
}

func (v *BaseGravityExpressionVisitor) VisitExpression(ctx *ExpressionContext) interface{} {
	return v.VisitChildren(ctx)
}

func (v *BaseGravityExpressionVisitor) VisitConstraintExpr(ctx *ConstraintExprContext) interface{} {
	return v.VisitChildren(ctx)
}

func (v *BaseGravityExpressionVisitor) VisitThresholdExpr(ctx *ThresholdExprContext) interface{} {
	return v.VisitChildren(ctx)
}

func (v *BaseGravityExpressionVisitor) VisitEvidenceExpr(ctx *EvidenceExprContext) interface{} {
	return v.VisitChildren(ctx)
}

func (v *BaseGravityExpressionVisitor) VisitPriorityExpr(ctx *PriorityExprContext) interface{} {
	return v.VisitChildren(ctx)
}

func (v *BaseGravityExpressionVisitor) VisitEscalationExpr(ctx *EscalationExprContext) interface{} {
	return v.VisitChildren(ctx)
}

func (v *BaseGravityExpressionVisitor) VisitExceptionExpr(ctx *ExceptionExprContext) interface{} {
	return v.VisitChildren(ctx)
}

func (v *BaseGravityExpressionVisitor) VisitCriterion(ctx *CriterionContext) interface{} {
	return v.VisitChildren(ctx)
}

func (v *BaseGravityExpressionVisitor) VisitTargetList(ctx *TargetListContext) interface{} {
	return v.VisitChildren(ctx)
}

func (v *BaseGravityExpressionVisitor) VisitPriorityOrder(ctx *PriorityOrderContext) interface{} {
	return v.VisitChildren(ctx)
}

func (v *BaseGravityExpressionVisitor) VisitQuantity(ctx *QuantityContext) interface{} {
	return v.VisitChildren(ctx)
}
