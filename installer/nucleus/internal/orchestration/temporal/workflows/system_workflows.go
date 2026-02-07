// File: internal/orchestration/temporal/workflows/system_workflows.go
// Auto-contained workflows - NO COMMAND REGISTRATION (commands are in cmd layer)
// Business logic for Temporal system workflows
package workflows

import (
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ============================================
// START OLLAMA WORKFLOW
// ============================================

// StartOllamaInput represents input for starting Ollama
type StartOllamaInput struct {
	ProfileID      string `json:"profile_id,omitempty"`
	SimulationMode bool   `json:"simulation_mode"`
}

// StartOllamaResult represents the result of starting Ollama
type StartOllamaResult struct {
	Success   bool   `json:"success"`
	PID       int    `json:"pid,omitempty"`
	Port      int    `json:"port"`
	State     string `json:"state"`
	Error     string `json:"error,omitempty"`
	Timestamp int64  `json:"timestamp"`
}

// StartOllamaWorkflow starts Ollama via Sentinel
func StartOllamaWorkflow(ctx workflow.Context, input StartOllamaInput) (*StartOllamaResult, error) {
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	var result StartOllamaResult
	err := workflow.ExecuteActivity(ctx, "sentinel.StartOllama", input).Get(ctx, &result)

	if err != nil {
		return &StartOllamaResult{
			Success:   false,
			State:     "FAILED",
			Error:     err.Error(),
			Timestamp: time.Now().Unix(),
		}, err
	}

	return &result, nil
}

// ============================================
// VAULT STATUS WORKFLOW
// ============================================

// VaultStatusResult represents vault status query result
type VaultStatusResult struct {
	Success             bool   `json:"success"`
	VaultState          string `json:"vault_state"`
	MasterProfileActive bool   `json:"master_profile_active"`
	State               string `json:"state"`
	Error               string `json:"error,omitempty"`
	Timestamp           int64  `json:"timestamp"`
}

// VaultStatusWorkflow queries vault status via Brain
func VaultStatusWorkflow(ctx workflow.Context) (*VaultStatusResult, error) {
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	var result VaultStatusResult
	err := workflow.ExecuteActivity(ctx, "brain.QueryVaultStatus").Get(ctx, &result)

	if err != nil {
		return &VaultStatusResult{
			Success:   false,
			State:     "FAILED",
			Error:     err.Error(),
			Timestamp: time.Now().Unix(),
		}, err
	}

	return &result, nil
}

// ============================================
// SHUTDOWN ALL WORKFLOW
// ============================================

// ShutdownAllResult represents the result of shutdown operation
type ShutdownAllResult struct {
	Success          bool     `json:"success"`
	ServicesShutdown []string `json:"services_shutdown"`
	Error            string   `json:"error,omitempty"`
	Timestamp        int64    `json:"timestamp"`
}

// ShutdownAllWorkflow stops all orchestrated services
func ShutdownAllWorkflow(ctx workflow.Context) (*ShutdownAllResult, error) {
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 2 * time.Minute,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	result := &ShutdownAllResult{
		Success:          true,
		ServicesShutdown: []string{},
		Timestamp:        time.Now().Unix(),
	}

	// Stop Ollama
	err := workflow.ExecuteActivity(ctx, "sentinel.StopOllama").Get(ctx, nil)
	if err != nil {
		workflow.GetLogger(ctx).Error("Failed to stop Ollama", "error", err)
		result.Error = err.Error()
		result.Success = false
	} else {
		result.ServicesShutdown = append(result.ServicesShutdown, "ollama")
	}

	return result, nil
}