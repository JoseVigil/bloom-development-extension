package workflows

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/mock"
	"go.temporal.io/sdk/testsuite"

	"nucleus/internal/orchestration/activities"
)

// ─────────────────────────────────────────────────────────────────────────
// topologicalLayers — función pura, sin necesidad de Temporal test env.
// ─────────────────────────────────────────────────────────────────────────

func TestTopologicalLayersOrdersByDependencyIntoLayers(t *testing.T) {
	domains := []DomainAction{
		{DomainName: "C", DependsOn: []string{"A", "B"}},
		{DomainName: "A"},
		{DomainName: "B", DependsOn: []string{"A"}},
	}
	layers, err := topologicalLayers(domains)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(layers) != 3 {
		t.Fatalf("expected 3 layers (A alone, B alone, C alone — B depends on A, C depends on both), got %d: %+v", len(layers), layers)
	}
	if len(layers[0]) != 1 || layers[0][0].DomainName != "A" {
		t.Fatalf("layer 0 = %+v, want [A]", layers[0])
	}
	if len(layers[1]) != 1 || layers[1][0].DomainName != "B" {
		t.Fatalf("layer 1 = %+v, want [B]", layers[1])
	}
	if len(layers[2]) != 1 || layers[2][0].DomainName != "C" {
		t.Fatalf("layer 2 = %+v, want [C]", layers[2])
	}
}

func TestTopologicalLayersRunsIndependentDomainsInSameLayer(t *testing.T) {
	domains := []DomainAction{
		{DomainName: "X"},
		{DomainName: "Y"},
	}
	layers, err := topologicalLayers(domains)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(layers) != 1 || len(layers[0]) != 2 {
		t.Fatalf("expected a single layer with both independent domains, got %+v", layers)
	}
}

func TestTopologicalLayersDetectsCycle(t *testing.T) {
	domains := []DomainAction{
		{DomainName: "A", DependsOn: []string{"B"}},
		{DomainName: "B", DependsOn: []string{"A"}},
	}
	if _, err := topologicalLayers(domains); err == nil {
		t.Fatal("expected cycle error, got nil")
	}
}

// ─────────────────────────────────────────────────────────────────────────
// MandateExecutionWorkflow — Temporal test env, activities mockeadas.
// ─────────────────────────────────────────────────────────────────────────

// executionWorkflowFixture registra MandateExecutionWorkflow y mockea las
// tres Activities de Gravity (Ensure MANDATE / Create SESSION / Resolve /
// Persist) con una "corrida feliz" por default — cowork nodo SESSION/
// MANDATE (2026-09-02). Sin estos mocks, todos los tests de este archivo
// fallarían con "unable to find activity type" apenas arrancara el
// workflow, porque esas Activities ahora se invocan antes de
// topologicalLayers. Los tests que ejercitan la ejecución de dominios no
// necesitan variar estos mocks — lo que les importa es el comportamiento
// posterior (scaffold/persist), no la espina de Gravity.
func executionWorkflowFixture(t *testing.T) *testsuite.TestWorkflowEnvironment {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(MandateExecutionWorkflow)
	env.OnActivity(activities.EnsureGravityMandateNodeActivity, mock.Anything, mock.Anything).
		Return(activities.EnsureGravityMandateNodeResult{
			NucleusRoot: "fixture-nucleus", OrganizationID: "org-fixture", MandateNodePath: "fixture-mandate-path", Created: true,
		}, nil)
	env.OnActivity(activities.CreateGravitySessionActivity, mock.Anything, mock.Anything).
		Return(activities.CreateGravitySessionResult{SessionNodePath: "fixture-session-path", Created: true}, nil)
	env.OnActivity(activities.ResolveActiveGravityActivity, mock.Anything, mock.Anything).
		Return(activities.ResolveActiveGravityResult{}, nil)
	env.OnActivity(activities.PersistExecutionGravityActivity, mock.Anything, mock.Anything).
		Return(activities.PersistExecutionGravityResult{StateVersion: 1}, nil)
	return env
}

func TestMandateExecutionWorkflowRunsScaffoldInDependencyOrderAndReportsCompleted(t *testing.T) {
	env := executionWorkflowFixture(t)

	var order []string
	env.OnActivity(activities.ScaffoldDomainActivity, mock.Anything, mock.Anything).
		Return(func(input activities.ScaffoldDomainInput) (activities.ScaffoldDomainResult, error) {
			order = append(order, "scaffold:"+input.DomainName)
			if input.Mode != activities.ScaffoldModeReal {
				t.Errorf("ScaffoldDomainActivity invoked with Mode=%q, want %q", input.Mode, activities.ScaffoldModeReal)
			}
			return activities.ScaffoldDomainResult{ResultRef: "scaffold/domain_" + input.DomainName}, nil
		})
	env.OnActivity(activities.PersistExecutionResultActivity, mock.Anything, mock.Anything).
		Return(func(_ context.Context, input activities.PersistExecutionResultInput) (activities.PersistExecutionResultResult, error) {
			order = append(order, "persist:"+input.DomainName+":"+input.Status)
			return activities.PersistExecutionResultResult{StateVersion: 1}, nil
		})

	env.ExecuteWorkflow(MandateExecutionWorkflow, MandateExecutionInput{
		MandateID:    "m1",
		Project:      "fixture",
		MandatesRoot: "fixture-root",
		Domains: []DomainAction{
			{DomainName: "Billing", ActionID: "action-billing"},
			{DomainName: "Invoicing", ActionID: "action-invoicing", DependsOn: []string{"Billing"}},
		},
	})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatalf("workflow error: %v", err)
	}

	var result MandateExecutionResult
	if err := env.GetWorkflowResult(&result); err != nil {
		t.Fatalf("GetWorkflowResult: %v", err)
	}
	if !result.Success {
		t.Fatalf("expected Success=true, got %+v", result)
	}
	if len(result.CompletedDomains) != 2 || result.CompletedDomains[0] != "Billing" || result.CompletedDomains[1] != "Invoicing" {
		t.Fatalf("CompletedDomains = %v, want [Billing Invoicing]", result.CompletedDomains)
	}

	joined := strings.Join(order, "|")
	billingBeforeInvoicing := strings.Index(joined, "scaffold:Billing") < strings.Index(joined, "scaffold:Invoicing")
	if !billingBeforeInvoicing {
		t.Fatalf("expected Billing scaffolded before Invoicing (dependency order), got order=%s", joined)
	}
	if !strings.Contains(joined, "persist:Billing:completed") || !strings.Contains(joined, "persist:Invoicing:completed") {
		t.Fatalf("expected both domains persisted as completed, got order=%s", joined)
	}
}

func TestMandateExecutionWorkflowStopsAtFailedDomainAndSkipsDependents(t *testing.T) {
	env := executionWorkflowFixture(t)

	var scaffolded []string
	env.OnActivity(activities.ScaffoldDomainActivity, mock.Anything, mock.Anything).
		Return(func(input activities.ScaffoldDomainInput) (activities.ScaffoldDomainResult, error) {
			scaffolded = append(scaffolded, input.DomainName)
			if input.DomainName == "Billing" {
				return activities.ScaffoldDomainResult{}, errAssertScaffoldFailure
			}
			return activities.ScaffoldDomainResult{ResultRef: "scaffold/domain_" + input.DomainName}, nil
		})
	var persistedStatuses = map[string]string{}
	env.OnActivity(activities.PersistExecutionResultActivity, mock.Anything, mock.Anything).
		Return(func(_ context.Context, input activities.PersistExecutionResultInput) (activities.PersistExecutionResultResult, error) {
			persistedStatuses[input.DomainName] = input.Status
			return activities.PersistExecutionResultResult{StateVersion: 1}, nil
		})

	env.ExecuteWorkflow(MandateExecutionWorkflow, MandateExecutionInput{
		MandateID:    "m2",
		MandatesRoot: "fixture-root",
		Domains: []DomainAction{
			{DomainName: "Billing"},
			{DomainName: "Invoicing", DependsOn: []string{"Billing"}},
		},
	})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatalf("workflow error: %v", err)
	}

	var result MandateExecutionResult
	if err := env.GetWorkflowResult(&result); err != nil {
		t.Fatalf("GetWorkflowResult: %v", err)
	}
	if result.Success {
		t.Fatalf("expected Success=false after Billing failure, got %+v", result)
	}
	if len(result.CompletedDomains) != 0 {
		t.Fatalf("expected no completed domains, got %v", result.CompletedDomains)
	}
	// La ActivityOptions del workflow fija MaximumAttempts:3, así que
	// Billing (que siempre falla) se reintenta hasta 3 veces — lo que
	// importa acá es que ninguno de esos intentos, ni ningún intento
	// posterior, sea "Invoicing" (su dependencia nunca se resolvió).
	for _, name := range scaffolded {
		if name != "Billing" {
			t.Fatalf("expected only Billing (retried) to be scaffolded, Invoicing should be skipped — got %v", scaffolded)
		}
	}
	if len(scaffolded) == 0 {
		t.Fatal("expected at least one scaffold attempt for Billing")
	}
	if persistedStatuses["Billing"] != "failed" {
		t.Fatalf("expected Billing failure to be persisted, got statuses=%v", persistedStatuses)
	}
	if _, sawInvoicing := persistedStatuses["Invoicing"]; sawInvoicing {
		t.Fatalf("Invoicing should never have been attempted, got statuses=%v", persistedStatuses)
	}
}

var errAssertScaffoldFailure = &scaffoldFailureError{}

type scaffoldFailureError struct{}

func (e *scaffoldFailureError) Error() string { return "scaffold real falló (fixture de test)" }

// ─────────────────────────────────────────────────────────────────────────
// Gravity: la espina/SESSION se garantiza ANTES de cualquier Action —
// cowork nodo SESSION/MANDATE (2026-09-02).
// ─────────────────────────────────────────────────────────────────────────

func TestMandateExecutionWorkflowAbortsBeforeAnyScaffoldWhenGravitySpineFails(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(MandateExecutionWorkflow)

	env.OnActivity(activities.EnsureGravityMandateNodeActivity, mock.Anything, mock.Anything).
		Return(activities.EnsureGravityMandateNodeResult{}, errAssertGravitySpineFailure)

	scaffoldCalls := 0
	env.OnActivity(activities.ScaffoldDomainActivity, mock.Anything, mock.Anything).
		Return(func(input activities.ScaffoldDomainInput) (activities.ScaffoldDomainResult, error) {
			scaffoldCalls++
			return activities.ScaffoldDomainResult{}, nil
		})

	env.ExecuteWorkflow(MandateExecutionWorkflow, MandateExecutionInput{
		MandateID:    "m-gravity-fail",
		MandatesRoot: "fixture-root",
		ProjectID:    "", // vacío a propósito: dispara el fail-closed real de EnsureGravityMandateNodeActivity en producción; acá viene mockeado, el punto es que el Workflow respeta el error.
		Domains: []DomainAction{
			{DomainName: "Billing"},
		},
	})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatalf("workflow error: %v", err)
	}

	var result MandateExecutionResult
	if err := env.GetWorkflowResult(&result); err != nil {
		t.Fatalf("GetWorkflowResult: %v", err)
	}
	if result.Success {
		t.Fatalf("expected Success=false when Gravity spine fails, got %+v", result)
	}
	if result.Error == "" {
		t.Fatal("expected Error populated with the Gravity failure")
	}
	if scaffoldCalls != 0 {
		t.Fatalf("expected zero ScaffoldDomainActivity calls when Gravity spine fails, got %d", scaffoldCalls)
	}
}

var errAssertGravitySpineFailure = &gravitySpineFailureError{}

type gravitySpineFailureError struct{}

func (e *gravitySpineFailureError) Error() string {
	return "EnsureGravityMandateNodeActivity: ProjectID vacío (fixture de test)"
}
