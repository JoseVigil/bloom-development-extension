package workflows

import (
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"nucleus/internal/mandates"
)

// SystemHealthActivityResult es el resultado de un ciclo de health check.
// Guardado como output del workflow para trazabilidad en Temporal UI.
type SystemHealthActivityResult struct {
	HealthState  string            `json:"health_state"`  // "HEALTHY" | "DEGRADED" | "FAILED" | "UNKNOWN"
	FixAttempted bool              `json:"fix_attempted"`
	FixApplied   bool              `json:"fix_applied"`
	Components   map[string]string `json:"components"` // nombre → estado
	HookResult   mandates.HookResult `json:"hook_result"`
	Timestamp    int64             `json:"timestamp"`
}

// SystemHealthWorkflow es un workflow de ciclo único diseñado para ser
// invocado por un Temporal Schedule cada 60 segundos.
//
// Ejecuta la Activity RunSystemHealthActivity con retry limitado
// y no bloquea al scheduler si la Activity tarda.
//
// Diseño:
//   - StartToCloseTimeout: 30s — nucleus health tarda < 3s; 30s es holgado
//   - MaximumAttempts: 2 — reintentar una vez en caso de fallo transitorio
//   - El workflow en sí no hace retry (eso lo maneja el Schedule con overlap SKIP)
func SystemHealthWorkflow(ctx workflow.Context) error {
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 2,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)
	return workflow.ExecuteActivity(ctx, mandates.RunSystemHealthActivity).Get(ctx, nil)
}