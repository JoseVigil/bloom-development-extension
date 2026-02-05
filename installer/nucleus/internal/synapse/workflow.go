package synapse

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ============================================
// WORKFLOW: LaunchWorkflow
// ============================================

// LaunchWorkflow orchestrates the complete launch lifecycle
func LaunchWorkflow(ctx workflow.Context, config *LaunchConfig) (*LaunchResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("LaunchWorkflow started", "profile_id", config.ProfileID)

	// Workflow configuration
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
		HeartbeatTimeout:    30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    time.Minute,
			MaximumAttempts:    3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Validate Sentinel binary exists
	logger.Info("Step 1: Validating Sentinel binary")
	var validationResult bool
	err := workflow.ExecuteActivity(ctx, ValidateSentinelBinary).Get(ctx, &validationResult)
	if err != nil {
		logger.Error("Sentinel binary validation failed", "error", err)
		return nil, fmt.Errorf("sentinel binary not found: %w", err)
	}

	// Step 2: Prepare Sentinel command
	logger.Info("Step 2: Preparing Sentinel command")
	var sentinelCmd string
	err = workflow.ExecuteActivity(ctx, PrepareSentinelCommand, config).Get(ctx, &sentinelCmd)
	if err != nil {
		logger.Error("Failed to prepare Sentinel command", "error", err)
		return nil, fmt.Errorf("command preparation failed: %w", err)
	}

	// Step 3: Execute Sentinel
	logger.Info("Step 3: Executing Sentinel")
	var execResult SentinelExecutionResult
	err = workflow.ExecuteActivity(ctx, ExecuteSentinel, sentinelCmd, config).Get(ctx, &execResult)
	if err != nil {
		logger.Error("Sentinel execution failed", "error", err)
		return nil, fmt.Errorf("sentinel execution failed: %w", err)
	}

	// Step 4: Validate execution result
	if !execResult.Success {
		logger.Error("Sentinel reported failure", "message", execResult.Message)
		return nil, fmt.Errorf("sentinel execution unsuccessful: %s", execResult.Message)
	}

	// Step 5: Track lifecycle events (non-blocking)
	logger.Info("Step 5: Tracking lifecycle events")
	workflow.ExecuteActivity(ctx, TrackLifecycleEvent, config.ProfileID, "LAUNCH_COMPLETE")

	// Build final result
	result := &LaunchResult{
		Type:      "LAUNCH_COMPLETE",
		ProfileID: config.ProfileID,
		Status:    "success",
		Timestamp: workflow.Now(ctx).Unix(),
	}

	logger.Info("LaunchWorkflow completed successfully", "profile_id", config.ProfileID)

	return result, nil
}

// ============================================
// SUPPORTING STRUCTURES
// ============================================

// SentinelExecutionResult holds the result of Sentinel execution
type SentinelExecutionResult struct {
	Success   bool   `json:"success"`
	Message   string `json:"message"`
	ExitCode  int    `json:"exit_code"`
	ProfileID string `json:"profile_id"`
}