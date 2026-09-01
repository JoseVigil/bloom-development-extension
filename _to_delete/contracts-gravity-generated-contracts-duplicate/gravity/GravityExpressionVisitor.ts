// Generated from contracts/gravity/GravityExpression.g4 by ANTLR 4.13.2

import {ParseTreeVisitor} from 'antlr4';


import { ExpressionContext } from "./GravityExpressionParser.js";
import { ConstraintExprContext } from "./GravityExpressionParser.js";
import { ThresholdExprContext } from "./GravityExpressionParser.js";
import { EvidenceExprContext } from "./GravityExpressionParser.js";
import { PriorityExprContext } from "./GravityExpressionParser.js";
import { EscalationExprContext } from "./GravityExpressionParser.js";
import { ExceptionExprContext } from "./GravityExpressionParser.js";
import { CriterionContext } from "./GravityExpressionParser.js";
import { TargetListContext } from "./GravityExpressionParser.js";
import { PriorityOrderContext } from "./GravityExpressionParser.js";
import { QuantityContext } from "./GravityExpressionParser.js";


/**
 * This interface defines a complete generic visitor for a parse tree produced
 * by `GravityExpressionParser`.
 *
 * @param <Result> The return type of the visit operation. Use `void` for
 * operations with no return type.
 */
export default class GravityExpressionVisitor<Result> extends ParseTreeVisitor<Result> {
	/**
	 * Visit a parse tree produced by `GravityExpressionParser.expression`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitExpression?: (ctx: ExpressionContext) => Result;
	/**
	 * Visit a parse tree produced by `GravityExpressionParser.constraintExpr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitConstraintExpr?: (ctx: ConstraintExprContext) => Result;
	/**
	 * Visit a parse tree produced by `GravityExpressionParser.thresholdExpr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitThresholdExpr?: (ctx: ThresholdExprContext) => Result;
	/**
	 * Visit a parse tree produced by `GravityExpressionParser.evidenceExpr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitEvidenceExpr?: (ctx: EvidenceExprContext) => Result;
	/**
	 * Visit a parse tree produced by `GravityExpressionParser.priorityExpr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitPriorityExpr?: (ctx: PriorityExprContext) => Result;
	/**
	 * Visit a parse tree produced by `GravityExpressionParser.escalationExpr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitEscalationExpr?: (ctx: EscalationExprContext) => Result;
	/**
	 * Visit a parse tree produced by `GravityExpressionParser.exceptionExpr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitExceptionExpr?: (ctx: ExceptionExprContext) => Result;
	/**
	 * Visit a parse tree produced by `GravityExpressionParser.criterion`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCriterion?: (ctx: CriterionContext) => Result;
	/**
	 * Visit a parse tree produced by `GravityExpressionParser.targetList`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitTargetList?: (ctx: TargetListContext) => Result;
	/**
	 * Visit a parse tree produced by `GravityExpressionParser.priorityOrder`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitPriorityOrder?: (ctx: PriorityOrderContext) => Result;
	/**
	 * Visit a parse tree produced by `GravityExpressionParser.quantity`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitQuantity?: (ctx: QuantityContext) => Result;
}

