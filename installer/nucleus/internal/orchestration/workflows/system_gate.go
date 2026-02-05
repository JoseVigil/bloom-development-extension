package workflows

import (
	"time"

	"go.temporal.io/sdk/workflow"

	"nucleus/internal/orchestration/signals"
	"nucleus/internal/orchestration/types"
)

// SystemGateWorkflow espera a que se cumplan condiciones del sistema
func SystemGateWorkflow(ctx workflow.Context, condition types.SystemCondition) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("SystemGateWorkflow started", "condition_type", condition.Type)

	// Channel para recibir señal de condición cumplida
	conditionChan := workflow.GetSignalChannel(ctx, signals.SignalSystemCondition)

	// Esperar a que se cumpla la condición o timeout
	conditionMet := false
	
	if condition.Timeout > 0 {
		// Con timeout
		selector := workflow.NewSelector(ctx)
		
		selector.AddReceive(conditionChan, func(c workflow.ReceiveChannel, more bool) {
			var conditionType string
			c.Receive(ctx, &conditionType)
			
			if conditionType == condition.Type {
				conditionMet = true
				logger.Info("System condition met", "condition_type", condition.Type)
			}
		})
		
		// Timeout
		timer := workflow.NewTimer(ctx, condition.Timeout)
		selector.AddFuture(timer, func(f workflow.Future) {
			if !conditionMet {
				logger.Warn("System condition timeout", "condition_type", condition.Type)
			}
		})
		
		selector.Select(ctx)
	} else {
		// Sin timeout, esperar indefinidamente
		workflow.Await(ctx, func() bool {
			var conditionType string
			ok := conditionChan.ReceiveAsync(&conditionType)
			if ok && conditionType == condition.Type {
				conditionMet = true
				logger.Info("System condition met", "condition_type", condition.Type)
				return true
			}
			return false
		})
	}

	if !conditionMet {
		logger.Error("System condition not met", "condition_type", condition.Type)
		return workflow.NewApplicationError("system condition not met", "CONDITION_TIMEOUT", nil)
	}

	logger.Info("SystemGateWorkflow completed", "condition_type", condition.Type)
	return nil
}

// WaitForSystemReady espera a que el sistema esté listo (helper function)
func WaitForSystemReady(ctx workflow.Context, timeout time.Duration) error {
	condition := types.SystemCondition{
		Type:    signals.ConditionDependenciesReady,
		Timeout: timeout,
	}
	
	childWorkflowOptions := workflow.ChildWorkflowOptions{
		WorkflowID: "system-gate-" + workflow.GetInfo(ctx).WorkflowExecution.ID,
	}
	childCtx := workflow.WithChildOptions(ctx, childWorkflowOptions)
	
	return workflow.ExecuteChildWorkflow(childCtx, SystemGateWorkflow, condition).Get(ctx, nil)
}