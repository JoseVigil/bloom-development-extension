import { CharStreams, CommonTokenStream, ErrorListener, Recognizer, RecognitionException, Token } from "antlr4";
import GravityExpressionLexer from "./generated/GravityExpressionLexer.js";
import GravityExpressionParser, {
  CriterionContext, ExpressionContext, PriorityOrderContext,
} from "./generated/GravityExpressionParser.js";
import {
  GRAVITY_EXPRESSION_GRAMMAR_VERSION, GravityExpressionAST, GravityExpressionParseError,
} from "./ast";

class CollectingErrorListener<T> extends ErrorListener<T> {
  readonly errors: GravityExpressionParseError[] = [];

  syntaxError(_recognizer: Recognizer<T>, offendingSymbol: T, line: number, column: number, msg: string, _e: RecognitionException | undefined): void {
    const candidate = offendingSymbol as unknown as Partial<Token>;
    const offset = typeof candidate.start === "number" ? candidate.start : 0;
    this.errors.push(new GravityExpressionParseError(msg, { offset, line, column }));
  }
}

export function parse(expression: string): GravityExpressionAST {
  const chars = CharStreams.fromString(expression);
  const lexer = new GravityExpressionLexer(chars);
  const lexerErrors = new CollectingErrorListener<number>();
  lexer.removeErrorListeners();
  lexer.addErrorListener(lexerErrors);
  const parser = new GravityExpressionParser(new CommonTokenStream(lexer));
  const parserErrors = new CollectingErrorListener<Token>();
  parser.removeErrorListeners();
  parser.addErrorListener(parserErrors);
  const tree = parser.expression();
  const error = lexerErrors.errors[0] ?? parserErrors.errors[0];
  if (error) throw error;
  return buildAST(expression, tree);
}

function buildAST(raw: string, tree: ExpressionContext): GravityExpressionAST {
  const constraint = tree.constraintExpr();
  if (constraint) {
    const targets = constraint.targetList()?.IDENT_list().map(token => token.getText()) ?? null;
    return { ...base("constraint", raw, requiredCriterion(constraint.criterion(), raw), false),
      primitive: "constraint", predicateComputable: false, targets };
  }
  const threshold = tree.thresholdExpr();
  if (threshold) {
    const quantity = threshold.quantity();
    return { ...base("threshold", raw, optionalCriterion(threshold.criterion()), true),
      primitive: "threshold", predicateComputable: true, metric: threshold.IDENT().getText(),
      comparator: threshold.COMPARATOR().getText() as "<" | "<=" | ">" | ">=" | "==" | "!=",
      quantity: { value: Number(quantity.NUMBER().getText()), unit: quantity.IDENT()?.getText() ?? null } };
  }
  const evidence = tree.evidenceExpr();
  if (evidence) {
    const number = evidence.NUMBER();
    return { ...base("evidence", raw, requiredCriterion(evidence.criterion(), raw), false),
      primitive: "evidence", predicateComputable: false,
      requirement: number ? { minCount: Number(number.getText()), kind: evidence.IDENT().getText() } : null };
  }
  const priority = tree.priorityExpr();
  if (priority) {
    const orderContext = priority.priorityOrder() as PriorityOrderContext;
    const identifiers = orderContext.IDENT_list().map(token => token.getText());
    const order: Array<{ higher: string; lower: string }> = [];
    for (let index = 0; index < identifiers.length; index += 2) {
      if (identifiers[index] === identifiers[index + 1]) {
        const token = orderContext.IDENT(index).symbol;
        throw new GravityExpressionParseError("WF-5: priority pair must declare distinct higher and lower identifiers",
          { offset: token.start, line: token.line, column: token.column });
      }
      order.push({ higher: identifiers[index], lower: identifiers[index + 1] });
    }
    return { ...base("priority", raw, optionalCriterion(priority.criterion()), true),
      primitive: "priority", predicateComputable: true, order,
      collisionClass: priority.IDENT()?.getText() ?? null };
  }
  const escalation = tree.escalationExpr();
  if (escalation) {
    const identifiers = escalation.IDENT_list().map(token => token.getText());
    return { ...base("escalation", raw, optionalCriterion(escalation.criterion()), true),
      primitive: "escalation", predicateComputable: true, escalateTo: identifiers[0],
      triggerClass: identifiers[1] ?? null };
  }
  const exception = tree.exceptionExpr();
  if (exception) {
    return { ...base("exception", raw, requiredCriterion(exception.criterion(), raw), false),
      primitive: "exception", predicateComputable: false, exceptionOf: exception.POSTURE_REF().getText() };
  }
  throw new GravityExpressionParseError("expression does not match a Gravity primitive", { offset: 0, line: 1, column: 0 });
}

function base(primitive: GravityExpressionAST["primitive"], raw: string, criterion: string | null, predicateComputable: boolean) {
  return { grammarVersion: GRAVITY_EXPRESSION_GRAMMAR_VERSION, primitive, raw, criterion, predicateComputable };
}

function optionalCriterion(context: CriterionContext | undefined): string | null {
  if (!context) return null;
  const criterion = context.CRITERION().getText().slice(2).trim();
  if (!criterion) {
    const token = context.CRITERION().symbol;
    throw new GravityExpressionParseError("WF-2: criterion must contain non-whitespace text",
      { offset: token.start, line: token.line, column: token.column });
  }
  return criterion;
}

function requiredCriterion(context: CriterionContext | undefined, raw: string): string {
  const criterion = optionalCriterion(context);
  if (!criterion) {
    const delimiter = raw.indexOf("::");
    const offset = delimiter < 0 ? raw.length : delimiter;
    throw new GravityExpressionParseError("WF-2/WF-3: non-empty criterion is required",
      { offset, line: 1, column: offset }, [":: <criterion>"]);
  }
  return criterion;
}
