package gravity

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestParseValidExamplesForEveryPrimitive(t *testing.T) {
	tests := []struct {
		name       string
		expression string
		primitive  string
		computable bool
	}{
		{"constraint", "constraint on contrato_publico ::\nPreservar el contrato público — no renombrar ni remover campos existentes sin pasar\npor deprecación explícita.", "constraint", false},
		{"threshold", "threshold coverage_pct >= 80 :: La cobertura de tests del módulo de fallback no debe\nbajar de este piso tras la migración.", "threshold", true},
		{"evidence grv_2b91", "evidence min 2 patrones_de_fallo_distintos ::\nAdemás de grv_0af5, el fallback debe probarse con al menos dos patrones de fallo\ndistintos: timeout de conexión y respuesta de Redis con error explícito — no alcanza\ncon simular solo uno.", "evidence", false},
		{"priority", "priority hotfix over refactor for scope_collision ::\nAnte conflicto de scope entre sub-Mandates de refactor y de hotfix, el hotfix tiene\nprecedencia.", "priority", true},
		{"escalation", "escalation to organization for signed_contract_change ::\nCualquier modificación a un contrato ya firmado requiere autoridad de Organization,\nsin excepción.", "escalation", true},
		{"exception", "exception of grv_0af4 ::\nEste sub-Mandate opera en un scope acotado al fallback de Redis y ya cuenta con\nevidencia adicional (grv_2b91); el umbral genérico del padre puede relajarse a un\núnico patrón adicional de timeout, no dos.", "exception", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ast, err := Parse(tt.expression)
			if err != nil {
				t.Fatal(err)
			}
			encoded, err := json.Marshal(ast)
			if err != nil {
				t.Fatal(err)
			}
			var shape map[string]interface{}
			if err := json.Unmarshal(encoded, &shape); err != nil {
				t.Fatal(err)
			}
			if shape["grammarVersion"] != GravityExpressionGrammarVersion || shape["primitive"] != tt.primitive || shape["raw"] != tt.expression || shape["predicateComputable"] != tt.computable {
				t.Fatalf("unexpected AST: %s", encoded)
			}
		})
	}
}

func TestParseProducesCanonicalFields(t *testing.T) {
	threshold, err := Parse("threshold latency_ms <= 125.5 ms")
	if err != nil {
		t.Fatal(err)
	}
	tNode := threshold.(ThresholdNode)
	if tNode.Metric != "latency_ms" || tNode.Comparator != "<=" || tNode.Quantity.Value != 125.5 || tNode.Quantity.Unit == nil || *tNode.Quantity.Unit != "ms" || tNode.Criterion != nil {
		t.Fatalf("unexpected threshold: %+v", tNode)
	}
	priority, err := Parse("priority hotfix over refactor, security over cleanup for scope_collision")
	if err != nil {
		t.Fatal(err)
	}
	pNode := priority.(PriorityNode)
	if len(pNode.Order) != 2 || pNode.CollisionClass == nil || *pNode.CollisionClass != "scope_collision" {
		t.Fatalf("unexpected priority: %+v", pNode)
	}
}

func TestParseRejectsWF1ThroughWF5AsSyntax(t *testing.T) {
	tests := []struct{ name, expression string }{
		{"WF-1 malformed POSTURE_REF", "exception of grv-bad :: justification"},
		{"WF-2 empty criterion", "threshold coverage_pct >= 80 ::   "},
		{"WF-3 required criterion absent", "constraint on contrato_publico"},
		{"WF-4 reserved IDENT", "threshold priority >= 1"},
		{"WF-5 self priority", "priority hotfix over hotfix"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Parse(tt.expression)
			if err == nil {
				t.Fatal("expected error")
			}
			var rejection *GravityExpressionError
			if !errors.As(err, &rejection) {
				t.Fatalf("unexpected error type %T", err)
			}
			if rejection.ErrorClass != "syntax" || rejection.ReasonCode != "GRAVITY_EXPRESSION_SYNTAX_ERROR" || rejection.Position == nil {
				t.Fatalf("unexpected rejection: %+v", rejection)
			}
		})
	}
}

func TestSemanticErrorContractIsDistinctFromParserErrors(t *testing.T) {
	err := NewSemanticGravityExpressionError("exception target is not inherited", "exception_target_not_inherited", "grv_9999")
	if err.ErrorClass != "semantic" || err.ReasonCode != "GRAVITY_EXPRESSION_SEMANTIC_ERROR" || err.Position != nil || err.ViolatedRule != "exception_target_not_inherited" || err.PostureRef != "grv_9999" {
		t.Fatalf("unexpected semantic error: %+v", err)
	}
}
