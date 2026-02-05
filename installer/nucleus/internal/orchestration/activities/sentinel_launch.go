package activities

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"nucleus/internal/orchestration/types"
)

// SentinelActivities contiene las activities para Sentinel
type SentinelActivities struct {
	logsDir       string
	telemetryPath string
}

// NewSentinelActivities crea una nueva instancia de SentinelActivities
func NewSentinelActivities(logsDir, telemetryPath string) *SentinelActivities {
	return &SentinelActivities{
		logsDir:       logsDir,
		telemetryPath: telemetryPath,
	}
}

// LaunchSentinel activity para lanzar Sentinel de forma idempotente
func (a *SentinelActivities) LaunchSentinel(ctx context.Context, input types.SentinelLaunchInput) (types.SentinelLaunchResult, error) {
	// Generar event ID único
	eventID := fmt.Sprintf("sentinel_launch_%s_%d", input.ProfileID, time.Now().UnixNano())
	
	// Log de inicio
	a.logEvent(eventID, "sentinel_launch", "started", map[string]interface{}{
		"profile_id":  input.ProfileID,
		"command_id":  input.CommandID,
		"environment": input.Environment,
	})

	// TODO: Implementar lanzamiento real de Sentinel
	// Por ahora, simulamos éxito
	result := types.SentinelLaunchResult{
		Success:   true,
		ProcessID: os.Getpid(), // Placeholder
	}

	// Log de completado
	a.logEvent(eventID, "sentinel_launch", "completed", map[string]interface{}{
		"profile_id": input.ProfileID,
		"command_id": input.CommandID,
		"success":    result.Success,
		"process_id": result.ProcessID,
	})

	return result, nil
}

// logEvent registra un evento de telemetría
func (a *SentinelActivities) logEvent(eventID, eventType, status string, payload map[string]interface{}) {
	event := map[string]interface{}{
		"timestamp":  time.Now().UnixNano(),
		"event_id":   eventID,
		"category":   "orchestration",
		"event_type": eventType,
		"status":     status,
	}

	// Merge payload
	for k, v := range payload {
		event[k] = v
	}

	// Escribir a telemetry.json (JSON Lines)
	if a.telemetryPath != "" {
		a.appendTelemetry(event)
	}
}

// appendTelemetry agrega una línea al archivo de telemetría
func (a *SentinelActivities) appendTelemetry(event map[string]interface{}) {
	// Crear directorio si no existe
	dir := filepath.Dir(a.telemetryPath)
	os.MkdirAll(dir, 0755)

	// Abrir archivo en modo append
	f, err := os.OpenFile(a.telemetryPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		// Log a stderr si falla
		fmt.Fprintf(os.Stderr, "[ERROR] Failed to open telemetry file: %v\n", err)
		return
	}
	defer f.Close()

	// Serializar evento
	data, err := json.Marshal(event)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[ERROR] Failed to marshal telemetry event: %v\n", err)
		return
	}

	// Escribir línea
	f.Write(data)
	f.WriteString("\n")
}