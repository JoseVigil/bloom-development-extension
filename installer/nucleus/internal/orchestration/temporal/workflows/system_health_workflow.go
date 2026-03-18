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
//   - StartToCloseTimeout: 90s — presupuesto real:
//       • nucleus health (sin fix):    ~3s  (HEALTH_CHECK_TIMEOUT_S = 15s)
//       • nucleus health --fix:        ~45s (HEALTH_FIX_TIMEOUT_S = 45s)
//       • temporal ensure (peor caso): ~30s dentro del fix
//       • margen:                      ~12s
//     Total worst-case: 45 + 30 + 12 = ~87s → redondeado a 90s.
//     El timeout anterior de 30s mataba la activity mientras --fix corría,
//     causando que el worker muriera en loop cada vez que Temporal se recuperaba.
//   - MaximumAttempts: 1 — sin retry inmediato: si la activity falla, el
//     Schedule la reintenta en el próximo ciclo de 60s. Reintentar de inmediato
//     con --fix activo duplica la carga sobre un sistema ya degradado.
//   - El workflow en sí no hace retry (eso lo maneja el Schedule con overlap SKIP)
func SystemHealthWorkflow(ctx workflow.Context) error {
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 90 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 1,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)
	return workflow.ExecuteActivity(ctx, mandates.RunSystemHealthActivity).Get(ctx, nil)
}