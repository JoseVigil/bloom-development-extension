// internal/orchestration/temporal/workflows/mandate_genesis_build_workflow.go
package workflows

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"nucleus/internal/orchestration/activities"
)

// GenesisBuildInput es el único dueño de este shape — temporal_client.go y
// mandate_watcher.go lo referencian como workflows.GenesisBuildInput, sin
// redeclararlo, para evitar el bug de "dos tipos con el mismo nombre en
// paquetes distintos" que rompía la serialización de Temporal.
type GenesisBuildInput struct {
	MandateID     string
	MandateType   string
	BaseGenesisID string
	Source        string
	Project       string
}

// MandateGenesisBuildWorkflow orquesta: ingest → cluster → validate (Human
// Sync) → sign → execute (child workflow, Fase 4).
func MandateGenesisBuildWorkflow(ctx workflow.Context, input GenesisBuildInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("MandateGenesisBuildWorkflow arrancado", "mandateId", input.MandateID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// ── Fase 1: ingest ──────────────────────────────────────────────────
	if err := workflow.ExecuteActivity(ctx, activities.PublishMandateEventActivity,
		"mandate:phase:ingest", map[string]interface{}{"mandateId": input.MandateID},
	).Get(ctx, nil); err != nil {
		return fmt.Errorf("fase ingest: %w", err)
	}

	// ── Fase 2: cluster ─────────────────────────────────────────────────
	var scaffoldResult activities.ScaffoldDomainResult
	if err := workflow.ExecuteActivity(ctx, activities.ScaffoldDomainActivity, activities.ScaffoldDomainInput{
		MandateID:  input.MandateID,
		ActionID:   "cluster",
		DomainName: input.Project,
	}).Get(ctx, &scaffoldResult); err != nil {
		return fmt.Errorf("fase cluster: %w", err)
	}

	// ── Fase 3: validate (Human Sync Point) ──────────────────────────────
	// Espera indefinidamente una señal externa (UI/CLI) que confirme el
	// resultado del clustering antes de avanzar a la ejecución real.
	// No lleva timeout: es intencional, un humano puede tardar horas en revisar.
	var approved bool
	signalCh := workflow.GetSignalChannel(ctx, "mandate:genesis:validate")
	signalCh.Receive(ctx, &approved)

	if !approved {
		logger.Info("Human Sync rechazó el mandate", "mandateId", input.MandateID)
		return workflow.ExecuteActivity(ctx, activities.PublishMandateEventActivity,
			"mandate:genesis:rejected", map[string]interface{}{"mandateId": input.MandateID},
		).Get(ctx, nil)
	}

	// ── Fase 4: execute (child workflow) ─────────────────────────────────
	// MandateExecutionWorkflow todavía no existe como pieza de negocio real —
	// ver stub en mandate_execution_workflow.go. No inventamos su lógica interna
	// (createStandardMandate) sin ver el resto del subsistema mandates.
	childOpts := workflow.ChildWorkflowOptions{
		WorkflowID: fmt.Sprintf("mandate_execution_%s", input.MandateID),
		TaskQueue:  "mandate-orchestration",
	}
	childCtx := workflow.WithChildOptions(ctx, childOpts)

	var execResult MandateExecutionResult
	err := workflow.ExecuteChildWorkflow(childCtx, MandateExecutionWorkflow, MandateExecutionInput{
		MandateID: input.MandateID,
		Project:   input.Project,
		Domains:   []DomainAction{{DomainName: input.Project}},
	}).Get(ctx, &execResult)
	if err != nil {
		return fmt.Errorf("fase execute: %w", err)
	}

	return workflow.ExecuteActivity(ctx, activities.PublishMandateEventActivity,
		"mandate:genesis:all_complete", map[string]interface{}{
			"mandateId": input.MandateID,
			"result":    execResult,
		},
	).Get(ctx, nil)
}