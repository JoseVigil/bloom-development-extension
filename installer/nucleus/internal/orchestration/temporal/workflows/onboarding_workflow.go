// File: internal/orchestration/temporal/workflows/onboarding_workflow.go
package workflows

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// OnboardingNavigateInput parámetros del workflow de onboarding
type OnboardingNavigateInput struct {
	ProfileID string `json:"profile_id"`
	Step      string `json:"step"`
	RequestID string `json:"request_id"`
}

// OnboardingNavigateResult resultado del workflow de onboarding
type OnboardingNavigateResult struct {
	Success   bool   `json:"success"`
	ProfileID string `json:"profile_id"`
	Step      string `json:"step"`
	RequestID string `json:"request_id"`
	Status    string `json:"status"`
	Error     string `json:"error,omitempty"`
}

// OnboardingWorkflow orquesta el envío de una señal de navegación de onboarding
// a un perfil Chrome activo a través del Brain TCP.
//
// Este workflow es de corta duración: envía la señal y retorna el ACK de routing.
// NO espera que Chrome procese la señal — eso se confirma vía ONBOARDING_COMPLETE
// en el EventBus de Sentinel (sentinel listen --filter ONBOARDING_COMPLETE).
//
// Flujo:
//
//	nucleus CLI → Temporal → OnboardingWorkflow
//	  → SendOnboardingNavigate activity
//	    → SentinelClient.RouteToProfile()
//	      → Brain TCP :5678
//	        → bloom-host → background.js → discovery.js → showScreen(step)
func OnboardingWorkflow(ctx workflow.Context, input OnboardingNavigateInput) (OnboardingNavigateResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("OnboardingWorkflow started",
		"profile_id", input.ProfileID,
		"step", input.Step,
		"request_id", input.RequestID,
	)

	// Activity options: timeout corto, 3 reintentos con backoff exponencial.
	// El timeout de 30s es suficiente para Brain TCP local; la activity interna
	// usa un timeout más ajustado de 10s en RouteToProfile.
	activityOptions := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		HeartbeatTimeout:    15 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts:    3,
			InitialInterval:    time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    10 * time.Second,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, activityOptions)

	var result OnboardingNavigateResult
	err := workflow.ExecuteActivity(
		ctx,
		"sentinel.SendOnboardingNavigate",
		input,
	).Get(ctx, &result)

	if err != nil {
		logger.Error("OnboardingWorkflow activity failed",
			"profile_id", input.ProfileID,
			"step", input.Step,
			"error", err,
		)
		return OnboardingNavigateResult{
			Success:   false,
			ProfileID: input.ProfileID,
			Step:      input.Step,
			RequestID: input.RequestID,
			Error:     fmt.Sprintf("activity failed: %v", err),
		}, err
	}

	logger.Info("OnboardingWorkflow completed",
		"profile_id", input.ProfileID,
		"step", input.Step,
		"status", result.Status,
	)

	return result, nil
}