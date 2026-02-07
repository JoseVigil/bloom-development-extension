package activities

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"nucleus/internal/orchestration/types"
)

// SentinelActivities contiene las activities para Sentinel
type SentinelActivities struct {
	logsDir       string
	telemetryPath string
	sentinelPath  string // Path al binario de sentinel
}

// NewSentinelActivities crea una nueva instancia de SentinelActivities
func NewSentinelActivities(logsDir, telemetryPath, sentinelPath string) *SentinelActivities {
	return &SentinelActivities{
		logsDir:       logsDir,
		telemetryPath: telemetryPath,
		sentinelPath:  sentinelPath,
	}
}

// SentinelCommandResult es el contrato EXACTO que devuelve Sentinel por stdout
type SentinelCommandResult struct {
	Success         bool                   `json:"success"`
	ProfileID       string                 `json:"profile_id,omitempty"`
	ChromePID       int                    `json:"chrome_pid,omitempty"`
	DebugPort       int                    `json:"debug_port,omitempty"`
	ExtensionLoaded bool                   `json:"extension_loaded,omitempty"`
	EffectiveConfig map[string]interface{} `json:"effective_config,omitempty"`
	Error           string                 `json:"error,omitempty"`
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

	// Construir comando de Sentinel
	args := []string{"launch", input.ProfileID}

	// Agregar flags desde LaunchConfig si existen
	if input.Mode != "" {
		args = append(args, "--mode", input.Mode)
	}
	if input.ConfigOverride != "" {
		// Pasar config como JSON inline
		args = append(args, "--config-file", "-") // stdin
	}

	// Crear comando
	cmd := exec.CommandContext(ctx, a.sentinelPath, args...)

	// Si hay config override, pasarlo por stdin
	if input.ConfigOverride != "" {
		cmd.Stdin = strings.NewReader(input.ConfigOverride)
	}

	// Capturar stdout y stderr
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return types.SentinelLaunchResult{
			Success: false,
			Error:   fmt.Sprintf("failed to create stdout pipe: %v", err),
		}, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return types.SentinelLaunchResult{
			Success: false,
			Error:   fmt.Sprintf("failed to create stderr pipe: %v", err),
		}, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	// Iniciar proceso
	if err := cmd.Start(); err != nil {
		return types.SentinelLaunchResult{
			Success: false,
			Error:   fmt.Sprintf("failed to start sentinel: %v", err),
		}, fmt.Errorf("failed to start sentinel: %w", err)
	}

	// Leer stderr en goroutine (para logging)
	go func() {
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			// Log stderr a archivo de logs
			a.logSentinelOutput(input.ProfileID, "stderr", line)
		}
	}()

	// Leer stdout buscando el JSON final
	var sentinelResult SentinelCommandResult
	var lastLine string
	
	scanner := bufio.NewScanner(stdoutPipe)
	for scanner.Scan() {
		line := scanner.Text()
		lastLine = line
		
		// Log stdout a archivo de logs
		a.logSentinelOutput(input.ProfileID, "stdout", line)
		
		// Intentar parsear cada línea como JSON (por si hay output intermedio)
		// Solo nos interesa el último JSON válido
		var temp SentinelCommandResult
		if err := json.Unmarshal([]byte(line), &temp); err == nil {
			// Es JSON válido, guardarlo
			sentinelResult = temp
		}
	}

	// Esperar a que termine el proceso
	err = cmd.Wait()

	// Si el proceso falló y no parseamos ningún JSON válido, construir error
	if err != nil && !sentinelResult.Success && sentinelResult.Error == "" {
		return types.SentinelLaunchResult{
			Success: false,
			Error:   fmt.Sprintf("sentinel process failed: %v (last output: %s)", err, lastLine),
		}, fmt.Errorf("sentinel process failed: %w", err)
	}

	// Validar que recibimos un resultado válido
	if sentinelResult.ProfileID == "" && sentinelResult.Error == "" {
		return types.SentinelLaunchResult{
			Success: false,
			Error:   "sentinel returned invalid/empty JSON response",
		}, fmt.Errorf("sentinel returned invalid response")
	}

	// Mapear resultado de Sentinel a SentinelLaunchResult
	result := types.SentinelLaunchResult{
		Success:         sentinelResult.Success,
		ProfileID:       sentinelResult.ProfileID,
		ChromePID:       sentinelResult.ChromePID,
		DebugPort:       sentinelResult.DebugPort,
		ExtensionLoaded: sentinelResult.ExtensionLoaded,
		EffectiveConfig: sentinelResult.EffectiveConfig,
		Error:           sentinelResult.Error,
		LaunchID:        input.CommandID, // Usar CommandID como LaunchID
	}

	// Log de completado
	a.logEvent(eventID, "sentinel_launch", "completed", map[string]interface{}{
		"profile_id":        input.ProfileID,
		"command_id":        input.CommandID,
		"success":           result.Success,
		"chrome_pid":        result.ChromePID,
		"debug_port":        result.DebugPort,
		"extension_loaded":  result.ExtensionLoaded,
		"error":             result.Error,
	})

	// Si falló, retornar error
	if !result.Success {
		return result, fmt.Errorf("sentinel launch failed: %s", result.Error)
	}

	return result, nil
}

// logSentinelOutput guarda la salida de Sentinel a archivo de logs
func (a *SentinelActivities) logSentinelOutput(profileID, stream, line string) {
	if a.logsDir == "" {
		return
	}

	// Crear directorio de logs si no existe
	logFile := filepath.Join(a.logsDir, fmt.Sprintf("sentinel_%s.log", profileID))
	
	f, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return
	}
	defer f.Close()

	timestamp := time.Now().Format("2006-01-02 15:04:05")
	fmt.Fprintf(f, "[%s] [%s] %s\n", timestamp, stream, line)
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