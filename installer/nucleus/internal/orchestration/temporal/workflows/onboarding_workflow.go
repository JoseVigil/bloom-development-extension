// File: internal/orchestration/temporal/workflows/onboarding_workflow.go
// v1.1.0 — Paso 1 github_auth
// Cambios: Step ya era string — sin cambios de lógica requeridos. El archivo
// original ya usa Step string en OnboardingNavigateInput y OnboardingNavigateResult.
// Verificado compatible con step "github_auth" y todos los steps string del nuevo flujo.
//
// Workflow de Temporal para ejecutar la activity de navegación de onboarding.
//
// Workflow ID convención: onboarding_{profile_id}_{timestamp_unix_nano}
// Request ID convención: onb_nav_{timestamp_unix}_{prefix_3chars}
//
// El workflow arranca una instancia del Worker que ejecuta:
//   SendOnboardingNavigateActivity → SentinelClient TCP → Brain → bloom-host → Chrome
//
// No modifica estado del ProfileLifecycleWorkflow. Es un workflow de corta duración
// (fire-and-confirm): retorna cuando Brain ACK el routing, no cuando Chrome procesa.

package workflows

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"nucleus/internal/orchestration/activities"
)

// OnboardingNavigateInput son los parámetros de entrada del workflow
type OnboardingNavigateInput struct {
	ProfileID string `json:"profile_id"`
	Step      string `json:"step"`
	RequestID string `json:"request_id"`
}

// OnboardingNavigateResult es el resultado del workflow
type OnboardingNavigateResult struct {
	Success   bool   `json:"success"`
	ProfileID string `json:"profile_id"`
	Step      string `json:"step"`
	RequestID string `json:"request_id"`
	Status    string `json:"status"`
	Error     string `json:"error,omitempty"`
}

// OnboardingWorkflow ejecuta la activity de navegación de onboarding y retorna
// el ACK de routing de Brain. Workflow de corta duración — típicamente < 15s.
func OnboardingWorkflow(ctx workflow.Context, input OnboardingNavigateInput) (OnboardingNavigateResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("OnboardingWorkflow started",
		"profile_id", input.ProfileID,
		"step", input.Step,
		"request_id", input.RequestID,
	)

	// Opciones de la activity:
	// - StartToCloseTimeout: 30s — suficiente para TCP + Brain ACK (timeout interno: 10s)
	// - RetryPolicy: 2 intentos máximo — la operación es idempotente (Brain ignora duplicados)
	activityOptions := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		HeartbeatTimeout:    15 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts:        2,
			InitialInterval:        1 * time.Second,
			BackoffCoefficient:     2.0,
			MaximumInterval:        5 * time.Second,
			NonRetryableErrorTypes: []string{"routing_failed"},
		},
	}
	actCtx := workflow.WithActivityOptions(ctx, activityOptions)

	actInput := activities.OnboardingNavigateInput{
		ProfileID: input.ProfileID,
		Step:      input.Step,
		RequestID: input.RequestID,
	}

	var actResult activities.OnboardingNavigateResult
	err := workflow.ExecuteActivity(actCtx, "sentinel.SendOnboardingNavigate", actInput).Get(ctx, &actResult)
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
		"status", actResult.Status,
	)

	return OnboardingNavigateResult{
		Success:   actResult.Success,
		ProfileID: actResult.ProfileID,
		Step:      actResult.Step,
		RequestID: actResult.RequestID,
		Status:    actResult.Status,
		Error:     actResult.Error,
	}, nil
}