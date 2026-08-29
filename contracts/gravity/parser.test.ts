import assert from "node:assert/strict";
import { GravityExpressionParseError, GravityExpressionRejection } from "./ast";
import { parse } from "./parser";

const valid = [
  ["constraint", "constraint on contrato_publico ::\nPreservar el contrato público — no renombrar ni remover campos existentes sin pasar\npor deprecación explícita.", false],
  ["threshold", "threshold coverage_pct >= 80 :: La cobertura de tests del módulo de fallback no debe\nbajar de este piso tras la migración.", true],
  ["evidence", "evidence min 2 patrones_de_fallo_distintos ::\nAdemás de grv_0af5, el fallback debe probarse con al menos dos patrones de fallo\ndistintos: timeout de conexión y respuesta de Redis con error explícito — no alcanza\ncon simular solo uno.", false],
  ["priority", "priority hotfix over refactor for scope_collision ::\nAnte conflicto de scope entre sub-Mandates de refactor y de hotfix, el hotfix tiene\nprecedencia.", true],
  ["escalation", "escalation to organization for signed_contract_change ::\nCualquier modificación a un contrato ya firmado requiere autoridad de Organization,\nsin excepción.", true],
  ["exception", "exception of grv_0af4 ::\nEste sub-Mandate opera en un scope acotado al fallback de Redis y ya cuenta con\nevidencia adicional (grv_2b91); el umbral genérico del padre puede relajarse a un\núnico patrón adicional de timeout, no dos.", false],
] as const;

for (const [primitive, expression, computable] of valid) {
  const ast = parse(expression);
  assert.equal(ast.grammarVersion, "gravity-expr/0.1");
  assert.equal(ast.primitive, primitive);
  assert.equal(ast.raw, expression);
  assert.equal(ast.predicateComputable, computable);
  assert.deepEqual(JSON.parse(JSON.stringify(ast)), ast);
}

for (const expression of [
  "exception of grv-bad :: justification",
  "threshold coverage_pct >= 80 ::   ",
  "constraint on contrato_publico",
  "threshold priority >= 1",
  "priority hotfix over hotfix",
]) {
  assert.throws(() => parse(expression), (error: unknown) => {
    assert.ok(error instanceof GravityExpressionParseError);
    assert.equal(error.errorClass, "syntax");
    assert.equal(error.reasonCode, "GRAVITY_EXPRESSION_SYNTAX_ERROR");
    return true;
  });
}

const semanticRejection: GravityExpressionRejection = {
  errorClass: "semantic",
  reasonCode: "GRAVITY_EXPRESSION_SEMANTIC_ERROR",
  message: "exception target is not inherited",
  violatedRule: "exception_target_not_inherited",
  ruleRef: "grv_9999",
};
assert.equal(semanticRejection.errorClass, "semantic");
assert.equal(semanticRejection.reasonCode, "GRAVITY_EXPRESSION_SEMANTIC_ERROR");
