// Generated from contracts/gravity/GravityExpression.g4 by ANTLR 4.13.2
// noinspection ES6UnusedImports,JSUnusedGlobalSymbols,JSUnusedLocalSymbols

import {
	ATN,
	ATNDeserializer, DecisionState, DFA, FailedPredicateException,
	RecognitionException, NoViableAltException, BailErrorStrategy,
	Parser, ParserATNSimulator,
	RuleContext, ParserRuleContext, PredictionMode, PredictionContextCache,
	TerminalNode, RuleNode,
	Token, TokenStream,
	Interval, IntervalSet
} from 'antlr4';
import GravityExpressionVisitor from "./GravityExpressionVisitor.js";

// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;

export default class GravityExpressionParser extends Parser {
	public static readonly T__0 = 1;
	public static readonly T__1 = 2;
	public static readonly T__2 = 3;
	public static readonly T__3 = 4;
	public static readonly T__4 = 5;
	public static readonly T__5 = 6;
	public static readonly T__6 = 7;
	public static readonly T__7 = 8;
	public static readonly T__8 = 9;
	public static readonly T__9 = 10;
	public static readonly T__10 = 11;
	public static readonly T__11 = 12;
	public static readonly T__12 = 13;
	public static readonly CRITERION = 14;
	public static readonly RULE_REF = 15;
	public static readonly NUMBER = 16;
	public static readonly COMPARATOR = 17;
	public static readonly IDENT = 18;
	public static readonly WS = 19;
	public static override readonly EOF = Token.EOF;
	public static readonly RULE_expression = 0;
	public static readonly RULE_constraintExpr = 1;
	public static readonly RULE_thresholdExpr = 2;
	public static readonly RULE_evidenceExpr = 3;
	public static readonly RULE_priorityExpr = 4;
	public static readonly RULE_escalationExpr = 5;
	public static readonly RULE_exceptionExpr = 6;
	public static readonly RULE_criterion = 7;
	public static readonly RULE_targetList = 8;
	public static readonly RULE_priorityOrder = 9;
	public static readonly RULE_quantity = 10;
	public static readonly literalNames: (string | null)[] = [ null, "'constraint'", 
                                                            "'threshold'", 
                                                            "'evidence'", 
                                                            "'min'", "'priority'", 
                                                            "'for'", "'escalation'", 
                                                            "'to'", "'exception'", 
                                                            "'of'", "'on'", 
                                                            "','", "'over'" ];
	public static readonly symbolicNames: (string | null)[] = [ null, null, 
                                                             null, null, 
                                                             null, null, 
                                                             null, null, 
                                                             null, null, 
                                                             null, null, 
                                                             null, null, 
                                                             "CRITERION", 
                                                             "RULE_REF", 
                                                             "NUMBER", "COMPARATOR", 
                                                             "IDENT", "WS" ];
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"expression", "constraintExpr", "thresholdExpr", "evidenceExpr", "priorityExpr", 
		"escalationExpr", "exceptionExpr", "criterion", "targetList", "priorityOrder", 
		"quantity",
	];
	public get grammarFileName(): string { return "GravityExpression.g4"; }
	public get literalNames(): (string | null)[] { return GravityExpressionParser.literalNames; }
	public get symbolicNames(): (string | null)[] { return GravityExpressionParser.symbolicNames; }
	public get ruleNames(): string[] { return GravityExpressionParser.ruleNames; }
	public get serializedATN(): number[] { return GravityExpressionParser._serializedATN; }

	protected createFailedPredicateException(predicate?: string, message?: string): FailedPredicateException {
		return new FailedPredicateException(this, predicate, message);
	}

	constructor(input: TokenStream) {
		super(input);
		this._interp = new ParserATNSimulator(this, GravityExpressionParser._ATN, GravityExpressionParser.DecisionsToDFA, new PredictionContextCache());
	}
	// @RuleVersion(0)
	public expression(): ExpressionContext {
		let localctx: ExpressionContext = new ExpressionContext(this, this._ctx, this.state);
		this.enterRule(localctx, 0, GravityExpressionParser.RULE_expression);
		try {
			this.state = 40;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case 1:
				this.enterOuterAlt(localctx, 1);
				{
				this.state = 22;
				this.constraintExpr();
				this.state = 23;
				this.match(GravityExpressionParser.EOF);
				}
				break;
			case 2:
				this.enterOuterAlt(localctx, 2);
				{
				this.state = 25;
				this.thresholdExpr();
				this.state = 26;
				this.match(GravityExpressionParser.EOF);
				}
				break;
			case 3:
				this.enterOuterAlt(localctx, 3);
				{
				this.state = 28;
				this.evidenceExpr();
				this.state = 29;
				this.match(GravityExpressionParser.EOF);
				}
				break;
			case 5:
				this.enterOuterAlt(localctx, 4);
				{
				this.state = 31;
				this.priorityExpr();
				this.state = 32;
				this.match(GravityExpressionParser.EOF);
				}
				break;
			case 7:
				this.enterOuterAlt(localctx, 5);
				{
				this.state = 34;
				this.escalationExpr();
				this.state = 35;
				this.match(GravityExpressionParser.EOF);
				}
				break;
			case 9:
				this.enterOuterAlt(localctx, 6);
				{
				this.state = 37;
				this.exceptionExpr();
				this.state = 38;
				this.match(GravityExpressionParser.EOF);
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public constraintExpr(): ConstraintExprContext {
		let localctx: ConstraintExprContext = new ConstraintExprContext(this, this._ctx, this.state);
		this.enterRule(localctx, 2, GravityExpressionParser.RULE_constraintExpr);
		let _la: number;
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 42;
			this.match(GravityExpressionParser.T__0);
			this.state = 44;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la===11) {
				{
				this.state = 43;
				this.targetList();
				}
			}

			this.state = 46;
			this.criterion();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public thresholdExpr(): ThresholdExprContext {
		let localctx: ThresholdExprContext = new ThresholdExprContext(this, this._ctx, this.state);
		this.enterRule(localctx, 4, GravityExpressionParser.RULE_thresholdExpr);
		let _la: number;
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 48;
			this.match(GravityExpressionParser.T__1);
			this.state = 49;
			this.match(GravityExpressionParser.IDENT);
			this.state = 50;
			this.match(GravityExpressionParser.COMPARATOR);
			this.state = 51;
			this.quantity();
			this.state = 53;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la===14) {
				{
				this.state = 52;
				this.criterion();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public evidenceExpr(): EvidenceExprContext {
		let localctx: EvidenceExprContext = new EvidenceExprContext(this, this._ctx, this.state);
		this.enterRule(localctx, 6, GravityExpressionParser.RULE_evidenceExpr);
		let _la: number;
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 55;
			this.match(GravityExpressionParser.T__2);
			this.state = 59;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la===4) {
				{
				this.state = 56;
				this.match(GravityExpressionParser.T__3);
				this.state = 57;
				this.match(GravityExpressionParser.NUMBER);
				this.state = 58;
				this.match(GravityExpressionParser.IDENT);
				}
			}

			this.state = 61;
			this.criterion();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public priorityExpr(): PriorityExprContext {
		let localctx: PriorityExprContext = new PriorityExprContext(this, this._ctx, this.state);
		this.enterRule(localctx, 8, GravityExpressionParser.RULE_priorityExpr);
		let _la: number;
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 63;
			this.match(GravityExpressionParser.T__4);
			this.state = 64;
			this.priorityOrder();
			this.state = 67;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la===6) {
				{
				this.state = 65;
				this.match(GravityExpressionParser.T__5);
				this.state = 66;
				this.match(GravityExpressionParser.IDENT);
				}
			}

			this.state = 70;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la===14) {
				{
				this.state = 69;
				this.criterion();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public escalationExpr(): EscalationExprContext {
		let localctx: EscalationExprContext = new EscalationExprContext(this, this._ctx, this.state);
		this.enterRule(localctx, 10, GravityExpressionParser.RULE_escalationExpr);
		let _la: number;
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 72;
			this.match(GravityExpressionParser.T__6);
			this.state = 73;
			this.match(GravityExpressionParser.T__7);
			this.state = 74;
			this.match(GravityExpressionParser.IDENT);
			this.state = 77;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la===6) {
				{
				this.state = 75;
				this.match(GravityExpressionParser.T__5);
				this.state = 76;
				this.match(GravityExpressionParser.IDENT);
				}
			}

			this.state = 80;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la===14) {
				{
				this.state = 79;
				this.criterion();
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public exceptionExpr(): ExceptionExprContext {
		let localctx: ExceptionExprContext = new ExceptionExprContext(this, this._ctx, this.state);
		this.enterRule(localctx, 12, GravityExpressionParser.RULE_exceptionExpr);
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 82;
			this.match(GravityExpressionParser.T__8);
			this.state = 83;
			this.match(GravityExpressionParser.T__9);
			this.state = 84;
			this.match(GravityExpressionParser.RULE_REF);
			this.state = 85;
			this.criterion();
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public criterion(): CriterionContext {
		let localctx: CriterionContext = new CriterionContext(this, this._ctx, this.state);
		this.enterRule(localctx, 14, GravityExpressionParser.RULE_criterion);
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 87;
			this.match(GravityExpressionParser.CRITERION);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public targetList(): TargetListContext {
		let localctx: TargetListContext = new TargetListContext(this, this._ctx, this.state);
		this.enterRule(localctx, 16, GravityExpressionParser.RULE_targetList);
		let _la: number;
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 89;
			this.match(GravityExpressionParser.T__10);
			this.state = 90;
			this.match(GravityExpressionParser.IDENT);
			this.state = 95;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la===12) {
				{
				{
				this.state = 91;
				this.match(GravityExpressionParser.T__11);
				this.state = 92;
				this.match(GravityExpressionParser.IDENT);
				}
				}
				this.state = 97;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public priorityOrder(): PriorityOrderContext {
		let localctx: PriorityOrderContext = new PriorityOrderContext(this, this._ctx, this.state);
		this.enterRule(localctx, 18, GravityExpressionParser.RULE_priorityOrder);
		let _la: number;
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 98;
			this.match(GravityExpressionParser.IDENT);
			this.state = 99;
			this.match(GravityExpressionParser.T__12);
			this.state = 100;
			this.match(GravityExpressionParser.IDENT);
			this.state = 107;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la===12) {
				{
				{
				this.state = 101;
				this.match(GravityExpressionParser.T__11);
				this.state = 102;
				this.match(GravityExpressionParser.IDENT);
				this.state = 103;
				this.match(GravityExpressionParser.T__12);
				this.state = 104;
				this.match(GravityExpressionParser.IDENT);
				}
				}
				this.state = 109;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public quantity(): QuantityContext {
		let localctx: QuantityContext = new QuantityContext(this, this._ctx, this.state);
		this.enterRule(localctx, 20, GravityExpressionParser.RULE_quantity);
		let _la: number;
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 110;
			this.match(GravityExpressionParser.NUMBER);
			this.state = 112;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			if (_la===18) {
				{
				this.state = 111;
				this.match(GravityExpressionParser.IDENT);
				}
			}

			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}

	public static readonly _serializedATN: number[] = [4,1,19,115,2,0,7,0,2,
	1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,7,6,2,7,7,7,2,8,7,8,2,9,7,9,2,
	10,7,10,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,
	1,0,1,0,3,0,41,8,0,1,1,1,1,3,1,45,8,1,1,1,1,1,1,2,1,2,1,2,1,2,1,2,3,2,54,
	8,2,1,3,1,3,1,3,1,3,3,3,60,8,3,1,3,1,3,1,4,1,4,1,4,1,4,3,4,68,8,4,1,4,3,
	4,71,8,4,1,5,1,5,1,5,1,5,1,5,3,5,78,8,5,1,5,3,5,81,8,5,1,6,1,6,1,6,1,6,
	1,6,1,7,1,7,1,8,1,8,1,8,1,8,5,8,94,8,8,10,8,12,8,97,9,8,1,9,1,9,1,9,1,9,
	1,9,1,9,1,9,5,9,106,8,9,10,9,12,9,109,9,9,1,10,1,10,3,10,113,8,10,1,10,
	0,0,11,0,2,4,6,8,10,12,14,16,18,20,0,0,118,0,40,1,0,0,0,2,42,1,0,0,0,4,
	48,1,0,0,0,6,55,1,0,0,0,8,63,1,0,0,0,10,72,1,0,0,0,12,82,1,0,0,0,14,87,
	1,0,0,0,16,89,1,0,0,0,18,98,1,0,0,0,20,110,1,0,0,0,22,23,3,2,1,0,23,24,
	5,0,0,1,24,41,1,0,0,0,25,26,3,4,2,0,26,27,5,0,0,1,27,41,1,0,0,0,28,29,3,
	6,3,0,29,30,5,0,0,1,30,41,1,0,0,0,31,32,3,8,4,0,32,33,5,0,0,1,33,41,1,0,
	0,0,34,35,3,10,5,0,35,36,5,0,0,1,36,41,1,0,0,0,37,38,3,12,6,0,38,39,5,0,
	0,1,39,41,1,0,0,0,40,22,1,0,0,0,40,25,1,0,0,0,40,28,1,0,0,0,40,31,1,0,0,
	0,40,34,1,0,0,0,40,37,1,0,0,0,41,1,1,0,0,0,42,44,5,1,0,0,43,45,3,16,8,0,
	44,43,1,0,0,0,44,45,1,0,0,0,45,46,1,0,0,0,46,47,3,14,7,0,47,3,1,0,0,0,48,
	49,5,2,0,0,49,50,5,18,0,0,50,51,5,17,0,0,51,53,3,20,10,0,52,54,3,14,7,0,
	53,52,1,0,0,0,53,54,1,0,0,0,54,5,1,0,0,0,55,59,5,3,0,0,56,57,5,4,0,0,57,
	58,5,16,0,0,58,60,5,18,0,0,59,56,1,0,0,0,59,60,1,0,0,0,60,61,1,0,0,0,61,
	62,3,14,7,0,62,7,1,0,0,0,63,64,5,5,0,0,64,67,3,18,9,0,65,66,5,6,0,0,66,
	68,5,18,0,0,67,65,1,0,0,0,67,68,1,0,0,0,68,70,1,0,0,0,69,71,3,14,7,0,70,
	69,1,0,0,0,70,71,1,0,0,0,71,9,1,0,0,0,72,73,5,7,0,0,73,74,5,8,0,0,74,77,
	5,18,0,0,75,76,5,6,0,0,76,78,5,18,0,0,77,75,1,0,0,0,77,78,1,0,0,0,78,80,
	1,0,0,0,79,81,3,14,7,0,80,79,1,0,0,0,80,81,1,0,0,0,81,11,1,0,0,0,82,83,
	5,9,0,0,83,84,5,10,0,0,84,85,5,15,0,0,85,86,3,14,7,0,86,13,1,0,0,0,87,88,
	5,14,0,0,88,15,1,0,0,0,89,90,5,11,0,0,90,95,5,18,0,0,91,92,5,12,0,0,92,
	94,5,18,0,0,93,91,1,0,0,0,94,97,1,0,0,0,95,93,1,0,0,0,95,96,1,0,0,0,96,
	17,1,0,0,0,97,95,1,0,0,0,98,99,5,18,0,0,99,100,5,13,0,0,100,107,5,18,0,
	0,101,102,5,12,0,0,102,103,5,18,0,0,103,104,5,13,0,0,104,106,5,18,0,0,105,
	101,1,0,0,0,106,109,1,0,0,0,107,105,1,0,0,0,107,108,1,0,0,0,108,19,1,0,
	0,0,109,107,1,0,0,0,110,112,5,16,0,0,111,113,5,18,0,0,112,111,1,0,0,0,112,
	113,1,0,0,0,113,21,1,0,0,0,11,40,44,53,59,67,70,77,80,95,107,112];

	private static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!GravityExpressionParser.__ATN) {
			GravityExpressionParser.__ATN = new ATNDeserializer().deserialize(GravityExpressionParser._serializedATN);
		}

		return GravityExpressionParser.__ATN;
	}


	static DecisionsToDFA = GravityExpressionParser._ATN.decisionToState.map( (ds: DecisionState, index: number) => new DFA(ds, index) );

}

export class ExpressionContext extends ParserRuleContext {
	constructor(parser?: GravityExpressionParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public constraintExpr(): ConstraintExprContext {
		return this.getTypedRuleContext(ConstraintExprContext, 0) as ConstraintExprContext;
	}
	public EOF(): TerminalNode {
		return this.getToken(GravityExpressionParser.EOF, 0);
	}
	public thresholdExpr(): ThresholdExprContext {
		return this.getTypedRuleContext(ThresholdExprContext, 0) as ThresholdExprContext;
	}
	public evidenceExpr(): EvidenceExprContext {
		return this.getTypedRuleContext(EvidenceExprContext, 0) as EvidenceExprContext;
	}
	public priorityExpr(): PriorityExprContext {
		return this.getTypedRuleContext(PriorityExprContext, 0) as PriorityExprContext;
	}
	public escalationExpr(): EscalationExprContext {
		return this.getTypedRuleContext(EscalationExprContext, 0) as EscalationExprContext;
	}
	public exceptionExpr(): ExceptionExprContext {
		return this.getTypedRuleContext(ExceptionExprContext, 0) as ExceptionExprContext;
	}
    public get ruleIndex(): number {
    	return GravityExpressionParser.RULE_expression;
	}
	// @Override
	public accept<Result>(visitor: GravityExpressionVisitor<Result>): Result {
		if (visitor.visitExpression) {
			return visitor.visitExpression(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ConstraintExprContext extends ParserRuleContext {
	constructor(parser?: GravityExpressionParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public criterion(): CriterionContext {
		return this.getTypedRuleContext(CriterionContext, 0) as CriterionContext;
	}
	public targetList(): TargetListContext {
		return this.getTypedRuleContext(TargetListContext, 0) as TargetListContext;
	}
    public get ruleIndex(): number {
    	return GravityExpressionParser.RULE_constraintExpr;
	}
	// @Override
	public accept<Result>(visitor: GravityExpressionVisitor<Result>): Result {
		if (visitor.visitConstraintExpr) {
			return visitor.visitConstraintExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ThresholdExprContext extends ParserRuleContext {
	constructor(parser?: GravityExpressionParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public IDENT(): TerminalNode {
		return this.getToken(GravityExpressionParser.IDENT, 0);
	}
	public COMPARATOR(): TerminalNode {
		return this.getToken(GravityExpressionParser.COMPARATOR, 0);
	}
	public quantity(): QuantityContext {
		return this.getTypedRuleContext(QuantityContext, 0) as QuantityContext;
	}
	public criterion(): CriterionContext {
		return this.getTypedRuleContext(CriterionContext, 0) as CriterionContext;
	}
    public get ruleIndex(): number {
    	return GravityExpressionParser.RULE_thresholdExpr;
	}
	// @Override
	public accept<Result>(visitor: GravityExpressionVisitor<Result>): Result {
		if (visitor.visitThresholdExpr) {
			return visitor.visitThresholdExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class EvidenceExprContext extends ParserRuleContext {
	constructor(parser?: GravityExpressionParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public criterion(): CriterionContext {
		return this.getTypedRuleContext(CriterionContext, 0) as CriterionContext;
	}
	public NUMBER(): TerminalNode {
		return this.getToken(GravityExpressionParser.NUMBER, 0);
	}
	public IDENT(): TerminalNode {
		return this.getToken(GravityExpressionParser.IDENT, 0);
	}
    public get ruleIndex(): number {
    	return GravityExpressionParser.RULE_evidenceExpr;
	}
	// @Override
	public accept<Result>(visitor: GravityExpressionVisitor<Result>): Result {
		if (visitor.visitEvidenceExpr) {
			return visitor.visitEvidenceExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class PriorityExprContext extends ParserRuleContext {
	constructor(parser?: GravityExpressionParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public priorityOrder(): PriorityOrderContext {
		return this.getTypedRuleContext(PriorityOrderContext, 0) as PriorityOrderContext;
	}
	public IDENT(): TerminalNode {
		return this.getToken(GravityExpressionParser.IDENT, 0);
	}
	public criterion(): CriterionContext {
		return this.getTypedRuleContext(CriterionContext, 0) as CriterionContext;
	}
    public get ruleIndex(): number {
    	return GravityExpressionParser.RULE_priorityExpr;
	}
	// @Override
	public accept<Result>(visitor: GravityExpressionVisitor<Result>): Result {
		if (visitor.visitPriorityExpr) {
			return visitor.visitPriorityExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class EscalationExprContext extends ParserRuleContext {
	constructor(parser?: GravityExpressionParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public IDENT_list(): TerminalNode[] {
	    	return this.getTokens(GravityExpressionParser.IDENT);
	}
	public IDENT(i: number): TerminalNode {
		return this.getToken(GravityExpressionParser.IDENT, i);
	}
	public criterion(): CriterionContext {
		return this.getTypedRuleContext(CriterionContext, 0) as CriterionContext;
	}
    public get ruleIndex(): number {
    	return GravityExpressionParser.RULE_escalationExpr;
	}
	// @Override
	public accept<Result>(visitor: GravityExpressionVisitor<Result>): Result {
		if (visitor.visitEscalationExpr) {
			return visitor.visitEscalationExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ExceptionExprContext extends ParserRuleContext {
	constructor(parser?: GravityExpressionParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public RULE_REF(): TerminalNode {
		return this.getToken(GravityExpressionParser.RULE_REF, 0);
	}
	public criterion(): CriterionContext {
		return this.getTypedRuleContext(CriterionContext, 0) as CriterionContext;
	}
    public get ruleIndex(): number {
    	return GravityExpressionParser.RULE_exceptionExpr;
	}
	// @Override
	public accept<Result>(visitor: GravityExpressionVisitor<Result>): Result {
		if (visitor.visitExceptionExpr) {
			return visitor.visitExceptionExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class CriterionContext extends ParserRuleContext {
	constructor(parser?: GravityExpressionParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public CRITERION(): TerminalNode {
		return this.getToken(GravityExpressionParser.CRITERION, 0);
	}
    public get ruleIndex(): number {
    	return GravityExpressionParser.RULE_criterion;
	}
	// @Override
	public accept<Result>(visitor: GravityExpressionVisitor<Result>): Result {
		if (visitor.visitCriterion) {
			return visitor.visitCriterion(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class TargetListContext extends ParserRuleContext {
	constructor(parser?: GravityExpressionParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public IDENT_list(): TerminalNode[] {
	    	return this.getTokens(GravityExpressionParser.IDENT);
	}
	public IDENT(i: number): TerminalNode {
		return this.getToken(GravityExpressionParser.IDENT, i);
	}
    public get ruleIndex(): number {
    	return GravityExpressionParser.RULE_targetList;
	}
	// @Override
	public accept<Result>(visitor: GravityExpressionVisitor<Result>): Result {
		if (visitor.visitTargetList) {
			return visitor.visitTargetList(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class PriorityOrderContext extends ParserRuleContext {
	constructor(parser?: GravityExpressionParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public IDENT_list(): TerminalNode[] {
	    	return this.getTokens(GravityExpressionParser.IDENT);
	}
	public IDENT(i: number): TerminalNode {
		return this.getToken(GravityExpressionParser.IDENT, i);
	}
    public get ruleIndex(): number {
    	return GravityExpressionParser.RULE_priorityOrder;
	}
	// @Override
	public accept<Result>(visitor: GravityExpressionVisitor<Result>): Result {
		if (visitor.visitPriorityOrder) {
			return visitor.visitPriorityOrder(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class QuantityContext extends ParserRuleContext {
	constructor(parser?: GravityExpressionParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public NUMBER(): TerminalNode {
		return this.getToken(GravityExpressionParser.NUMBER, 0);
	}
	public IDENT(): TerminalNode {
		return this.getToken(GravityExpressionParser.IDENT, 0);
	}
    public get ruleIndex(): number {
    	return GravityExpressionParser.RULE_quantity;
	}
	// @Override
	public accept<Result>(visitor: GravityExpressionVisitor<Result>): Result {
		if (visitor.visitQuantity) {
			return visitor.visitQuantity(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
