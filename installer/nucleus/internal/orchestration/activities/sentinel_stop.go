package activities

import (
	"context"
	"fmt"
	"time"

	"nucleus/internal/orchestration/types"
)

// StopSentinel activity para detener Sentinel de forma idempotente
func (a *SentinelActivities) StopSentinel(ctx context.Context, input types.SentinelStopInput) (types.SentinelStopResult, error) {
	// Generar event ID único
	eventID := fmt.Sprintf("sentinel_stop_%s_%d", input.ProfileID, time.Now().UnixNano())
	
	// Log de inicio
	a.logEvent(eventID, "sentinel_stop", "started", map[string]interface{}{
		"profile_id": input.ProfileID,
		"command_id": input.CommandID,
		"process_id": input.ProcessID,
	})

	// TODO: Implementar detención real de Sentinel
	// Por ahora, simulamos éxito
	result := types.SentinelStopResult{
		Success: true,
	}

	// Log de completado
	a.logEvent(eventID, "sentinel_stop", "completed", map[string]interface{}{
		"profile_id": input.ProfileID,
		"command_id": input.CommandID,
		"success":    result.Success,
	})

	return result, nil
}