package mandates

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"go.temporal.io/sdk/activity"
)

// RunSystemHealthActivity ejecuta todos los hooks registrados bajo system_health.
//
// Contrato:
//   - No retorna error al workflow — es best-effort
//   - El hook 00_health_check.py decide si llamar --fix y qué loguear
//   - Parsea metadata extendida del HookResult.Stdout para exponer
//     health_state, fix_attempted, fix_applied y components en el resultado
func RunSystemHealthActivity(ctx context.Context) (SystemHealthActivityResult, error) {
	logger := activity.GetLogger(ctx)

	// Crear directorio de hooks si no existe — no depender del installer
	hooksDir := filepath.Join(HooksBaseDir(), "system_health")
	os.MkdirAll(hooksDir, 0755) //nolint:errcheck

	hctx := HookContext{
		LaunchID:   "", // no aplica para system_health
		ProfileID:  "", // no aplica para system_health
		LogBaseDir: logBaseDir(),
		NucleusBin: nucleusBin(),
	}

	scripts, _ := DiscoverHooks("system_health")
	if len(scripts) == 0 {
		logger.Info("No system_health hooks registered, skipping")
		return SystemHealthActivityResult{
			HealthState: "UNKNOWN",
			Timestamp:   time.Now().UTC().Unix(),
		}, nil
	}

	logger.Info("Running system_health hooks", "count", len(scripts))

	result := RunEvent(ctx, "system_health", hctx)

	// Construir resultado base
	actResult := SystemHealthActivityResult{
		HealthState:  "UNKNOWN",
		FixAttempted: false,
		Timestamp:    time.Now().UTC().Unix(),
	}

	// Capturar primer HookResult para trazabilidad en Temporal UI
	if len(result.Hooks) > 0 {
		actResult.HookResult = result.Hooks[0]

		// Intentar parsear metadata extendida del HookResult.Stdout.
		// El hook 00_health_check.py escribe en Stdout un JSON con:
		//   {"health_state":"DEGRADED","fix_attempted":true,"fix_applied":false,"components":{...}}
		var meta struct {
			HealthState  string            `json:"health_state"`
			FixAttempted bool              `json:"fix_attempted"`
			FixApplied   bool              `json:"fix_applied"`
			Components   map[string]string `json:"components"`
		}
		if err := json.Unmarshal([]byte(result.Hooks[0].Stdout), &meta); err == nil {
			actResult.HealthState  = meta.HealthState
			actResult.FixAttempted = meta.FixAttempted
			actResult.FixApplied   = meta.FixApplied
			actResult.Components   = meta.Components
		}
	}

	if result.Failed > 0 {
		logger.Warn("system_health hook failed",
			"total", result.Total,
			"failed", result.Failed,
		)
	} else {
		logger.Info("system_health hooks completed",
			"total", result.Total,
			"health_state", actResult.HealthState,
		)
	}

	// Nunca retornar error — los hooks no bloquean el workflow
	return actResult, nil
}

// SystemHealthActivityResult es el resultado de un ciclo de health check.
// Definido aquí para que mandates sea el único paquete que lo declara;
// el paquete temporalworkflows importa este tipo desde mandates.
type SystemHealthActivityResult struct {
	HealthState  string            `json:"health_state"`  // "HEALTHY" | "DEGRADED" | "FAILED" | "UNKNOWN"
	FixAttempted bool              `json:"fix_attempted"`
	FixApplied   bool              `json:"fix_applied"`
	Components   map[string]string `json:"components"` // nombre → estado
	HookResult   HookResult        `json:"hook_result"`
	Timestamp    int64             `json:"timestamp"`
}