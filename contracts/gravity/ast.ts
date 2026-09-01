export const GRAVITY_EXPRESSION_GRAMMAR_VERSION = "gravity-expr/0.1" as const;

interface GravityExpressionNodeBase {
  grammarVersion: typeof GRAVITY_EXPRESSION_GRAMMAR_VERSION;
  primitive: "constraint" | "threshold" | "evidence" | "priority" | "escalation" | "exception";
  raw: string;
  criterion: string | null;
  predicateComputable: boolean;
}

export interface ConstraintNode extends GravityExpressionNodeBase {
  primitive: "constraint";
  targets: string[] | null;
  predicateComputable: false;
}

export interface ThresholdNode extends GravityExpressionNodeBase {
  primitive: "threshold";
  metric: string;
  comparator: "<" | "<=" | ">" | ">=" | "==" | "!=";
  quantity: { value: number; unit: string | null };
  predicateComputable: true;
}

export interface EvidenceNode extends GravityExpressionNodeBase {
  primitive: "evidence";
  requirement: { minCount: number; kind: string } | null;
  predicateComputable: false;
}

export interface PriorityNode extends GravityExpressionNodeBase {
  primitive: "priority";
  order: Array<{ higher: string; lower: string }>;
  collisionClass: string | null;
  predicateComputable: true;
}

export interface EscalationNode extends GravityExpressionNodeBase {
  primitive: "escalation";
  escalateTo: string;
  triggerClass: string | null;
  predicateComputable: true;
}

export interface ExceptionNode extends GravityExpressionNodeBase {
  primitive: "exception";
  exceptionOf: string;
  predicateComputable: false;
}

export type GravityExpressionAST =
  | ConstraintNode | ThresholdNode | EvidenceNode
  | PriorityNode | EscalationNode | ExceptionNode;

export interface GravityEvaluationContext {
  postureId: string;
  origin: "nucleus" | "organization" | "project" | "mandate_own" | "mandate_inherited" | "session";
  ast: GravityExpressionAST;
  verifiableDeclared: boolean;
  turn: { intentType: string };
  metrics: Record<string, number>;
}

export type GravityEvaluationOutcome =
  | { status: "not_applicable" }
  | { status: "satisfied" }
  | { status: "breached"; reasonCode: "GRAVITY_THRESHOLD_BREACHED"; postureId: string; postureRef: string }
  | { status: "indeterminate"; reason: string };

export interface GravityEvaluator {
  evaluate(ctx: GravityEvaluationContext): GravityEvaluationOutcome;
}

export type GravityExpressionRejection =
  | { errorClass: "syntax"; reasonCode: "GRAVITY_EXPRESSION_SYNTAX_ERROR"; message: string;
      position: { offset: number; line: number; column: number }; expectedTokens?: string[] }
  | { errorClass: "semantic"; reasonCode: "GRAVITY_EXPRESSION_SEMANTIC_ERROR"; message: string;
      violatedRule: "verifiable_requires_computable_predicate" | "exception_target_not_inherited";
      postureRef?: string };

export class GravityExpressionParseError extends Error {
  readonly errorClass = "syntax" as const;
  readonly reasonCode = "GRAVITY_EXPRESSION_SYNTAX_ERROR" as const;

  constructor(
    message: string,
    readonly position: { offset: number; line: number; column: number },
    readonly expectedTokens?: string[],
  ) {
    super(message);
    this.name = "GravityExpressionParseError";
  }

  toJSON(): GravityExpressionRejection {
    return { errorClass: this.errorClass, reasonCode: this.reasonCode, message: this.message,
      position: this.position, ...(this.expectedTokens ? { expectedTokens: this.expectedTokens } : {}) };
  }
}
