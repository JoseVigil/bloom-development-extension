package workflows

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/workflow"

	"nucleus/internal/orchestration/activities"
	"nucleus/internal/orchestration/types"
)

// RecoveryFlowWorkflow maneja la recuperación de errores
func RecoveryFlowWorkflow(ctx workflow.Context, input types.RecoveryFlowInput) (types.RecoveryFlowResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("RecoveryFlowWorkflow started", "profile_id", input.ProfileID, "failure_type", input.FailureType)

	result := types.RecoveryFlowResult{
		Success: false,
		NewState: types.StateFailed,
	}

	// Activity options con retry más agresivo
	activityOptions := workflow.ActivityOptions{
		StartToCloseTimeout: 3 * time.Minute,
		HeartbeatTimeout:    30 * time.Second,
		RetryPolicy: &workflow.RetryPolicy{
			MaximumAttempts:    5,
			InitialInterval:    time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    time.Minute,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, activityOptions)

	// Estrategia de recovery según tipo de falla
	switch input.FailureType {
	case "HEARTBEAT_FAILED":
		// Intentar reiniciar Sentinel
		logger.Info("Attempting to restart Sentinel")
		
		// 1. Detener Sentinel actual (si está corriendo)
		stopInput := types.SentinelStopInput{
			ProfileID: input.ProfileID,
			CommandID: fmt.Sprintf("recovery_stop_%d", workflow.Now(ctx).UnixNano()),
		}
		
		var stopResult types.SentinelStopResult
		if err := workflow.ExecuteActivity(ctx, activities.SentinelActivities.StopSentinel, stopInput).Get(ctx, &stopResult); err != nil {
			logger.Error("Failed to stop Sentinel during recovery", "error", err)
			result.ErrorMessage = fmt.Sprintf("stop failed: %v", err)
			return result, nil
		}

		// 2. Esperar un momento antes de reiniciar
		if err := workflow.Sleep(ctx, 5*time.Second); err != nil {
			return result, err
		}

		// 3. Lanzar Sentinel nuevamente
		launchInput := types.SentinelLaunchInput{
			ProfileID: input.ProfileID,
			CommandID: fmt.Sprintf("recovery_launch_%d", workflow.Now(ctx).UnixNano()),
		}
		
		var launchResult types.SentinelLaunchResult
		if err := workflow.ExecuteActivity(ctx, activities.SentinelActivities.LaunchSentinel, launchInput).Get(ctx, &launchResult); err != nil {
			logger.Error("Failed to launch Sentinel during recovery", "error", err)
			result.ErrorMessage = fmt.Sprintf("launch failed: %v", err)
			return result, nil
		}

		if launchResult.Success {
			result.Success = true
			result.NewState = types.StateReady
			logger.Info("Sentinel restarted successfully")
		} else {
			result.ErrorMessage = launchResult.Error
			logger.Error("Sentinel restart failed", "error", launchResult.Error)
		}

	case "EXTENSION_ERROR":
		// Para errores de extensión, intentar re-ejecutar intent
		logger.Info("Attempting to recover from extension error")
		
		intentInput := activities.SentinelIntentInput{
			ProfileID:  input.ProfileID,
			CommandID:  fmt.Sprintf("recovery_intent_%d", workflow.Now(ctx).UnixNano()),
			IntentType: "RECOVERY_PING",
		}
		
		var intentResult activities.SentinelIntentResult
		if err := workflow.ExecuteActivity(ctx, activities.SentinelActivities.ExecuteSentinelIntent, intentInput).Get(ctx, &intentResult); err != nil {
			logger.Error("Failed to execute recovery intent", "error", err)
			result.ErrorMessage = fmt.Sprintf("intent failed: %v", err)
			return result, nil
		}

		if intentResult.Success {
			result.Success = true
			result.NewState = types.StateReady
			logger.Info("Recovery intent executed successfully")
		} else {
			result.ErrorMessage = intentResult.Error
			logger.Error("Recovery intent failed", "error", intentResult.Error)
		}

	default:
		logger.Warn("Unknown failure type, no recovery action taken", "failure_type", input.FailureType)
		result.ErrorMessage = fmt.Sprintf("unknown failure type: %s", input.FailureType)
	}

	logger.Info("RecoveryFlowWorkflow completed", "success", result.Success, "new_state", result.NewState)
	return result, nil
}