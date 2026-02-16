// File: internal/orchestration/activities/sentinel_activities.go
// Archivo consolidado de activities para Sentinel
// Siguiendo patrón: un archivo auto-contenido con toda la lógica relacionada

package activities

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"nucleus/internal/orchestration/types"
)

// SentinelActivities contiene las activities para interactuar con Sentinel
type SentinelActivities struct {
	logsDir       string
	telemetryPath string
	sentinelPath  string // Path al binario de sentinel.exe
}

// NewSentinelActivities crea una nueva instancia de SentinelActivities
func NewSentinelActivities(logsDir, telemetryPath, sentinelPath string) *SentinelActivities {
	return &SentinelActivities{
		logsDir:       logsDir,
		telemetryPath: telemetryPath,
		sentinelPath:  sentinelPath,
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY: LaunchSentinel
// ═══════════════════════════════════════════════════════════════════════════

// LaunchSentinel activity para lanzar Sentinel de forma idempotente
// Comando ejecutado: sentinel --json launch <profile_id> [--mode <mode>] [--config-file -]
func (a *SentinelActivities) LaunchSentinel(ctx context.Context, input types.SentinelLaunchInput) (types.SentinelLaunchResult, error) {
	// Generar event ID único para telemetría
	eventID := fmt.Sprintf("sentinel_launch_%s_%d", input.ProfileID, time.Now().UnixNano())

	// Log de inicio
	a.logEvent(eventID, "sentinel_launch", "started", map[string]interface{}{
		"profile_id":  input.ProfileID,
		"command_id":  input.CommandID,
		"environment": input.Environment,
		"mode":        input.Mode,
	})

	// Construir comando: sentinel --json launch <profile_id>
	args := []string{"--json", "launch", input.ProfileID}

	// Agregar flags opcionales
	if input.Mode != "" {
		args = append(args, "--mode", input.Mode)
	}
	if input.ConfigOverride != "" {
		// Pasar config como JSON por stdin
		args = append(args, "--config-file", "-")
	}

	// Crear comando
	cmd := exec.CommandContext(ctx, a.sentinelPath, args...)

	// Si hay config override, pasarlo por stdin
	if input.ConfigOverride != "" {
		cmd.Stdin = strings.NewReader(input.ConfigOverride)
	}

	// Buffers para capturar salida
	var stdoutBuf bytes.Buffer
	var stderrBuf bytes.Buffer

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
		a.logEvent(eventID, "sentinel_launch", "failed", map[string]interface{}{
			"error": err.Error(),
		})
		return types.SentinelLaunchResult{
			Success: false,
			Error:   fmt.Sprintf("failed to start sentinel: %v", err),
		}, fmt.Errorf("failed to start sentinel: %w", err)
	}

	// Leer stderr en goroutine (para logging)
	stderrDone := make(chan struct{})
	go func() {
		defer close(stderrDone)
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			stderrBuf.WriteString(line + "\n")
			// Log stderr a archivo
			a.logSentinelOutput(input.ProfileID, "stderr", line)
		}
	}()

	// Leer stdout
	stdoutDone := make(chan struct{})
	go func() {
		defer close(stdoutDone)
		scanner := bufio.NewScanner(stdoutPipe)
		for scanner.Scan() {
			line := scanner.Text()
			stdoutBuf.WriteString(line + "\n")
			// Log stdout a archivo
			a.logSentinelOutput(input.ProfileID, "stdout", line)
		}
	}()

	// Esperar a que terminen las goroutines de lectura
	<-stdoutDone
	<-stderrDone

	// Esperar a que termine el proceso
	err = cmd.Wait()

	// Extraer JSON de la salida
	sentinelResult, parseErr := a.extractJSONFromOutput(stdoutBuf.String())

	// Si el proceso falló Y no logramos parsear JSON válido
	if err != nil && parseErr != nil {
		errorMsg := fmt.Sprintf("sentinel process failed: %v, parse error: %v", err, parseErr)
		a.logEvent(eventID, "sentinel_launch", "failed", map[string]interface{}{
			"error":  errorMsg,
			"stdout": stdoutBuf.String(),
			"stderr": stderrBuf.String(),
		})
		return types.SentinelLaunchResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
	}

	// Si parseamos JSON pero indica error
	if parseErr == nil && !sentinelResult.Success {
		a.logEvent(eventID, "sentinel_launch", "failed", map[string]interface{}{
			"error":      sentinelResult.Error,
			"profile_id": sentinelResult.ProfileID,
		})
		return types.SentinelLaunchResult{
			Success:   false,
			ProfileID: sentinelResult.ProfileID,
			Error:     sentinelResult.Error,
			LaunchID:  input.CommandID,
		}, fmt.Errorf("sentinel launch failed: %s", sentinelResult.Error)
	}

	// Validar que recibimos campos mínimos esperados
	if sentinelResult.ProfileID == "" || sentinelResult.ChromePID == 0 {
		errorMsg := "sentinel returned incomplete JSON response (missing profile_id or chrome_pid)"
		a.logEvent(eventID, "sentinel_launch", "failed", map[string]interface{}{
			"error":  errorMsg,
			"result": sentinelResult,
		})
		return types.SentinelLaunchResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
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
		LaunchID:        input.CommandID,
	}

	// Log de completado exitoso
	a.logEvent(eventID, "sentinel_launch", "completed", map[string]interface{}{
		"profile_id":        result.ProfileID,
		"command_id":        input.CommandID,
		"success":           result.Success,
		"chrome_pid":        result.ChromePID,
		"debug_port":        result.DebugPort,
		"extension_loaded":  result.ExtensionLoaded,
	})

	return result, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY: StopSentinel
// ═══════════════════════════════════════════════════════════════════════════

// StopSentinel activity para detener Sentinel
// TODO: Implementar cuando Sentinel soporte: sentinel --json stop <profile_id>
func (a *SentinelActivities) StopSentinel(ctx context.Context, input types.SentinelStopInput) (types.SentinelStopResult, error) {
	eventID := fmt.Sprintf("sentinel_stop_%s_%d", input.ProfileID, time.Now().UnixNano())

	a.logEvent(eventID, "sentinel_stop", "started", map[string]interface{}{
		"profile_id": input.ProfileID,
		"command_id": input.CommandID,
		"process_id": input.ProcessID,
	})

	// Por ahora retornamos éxito simulado
	// En producción, aquí iría:
	// args := []string{"--json", "stop", input.ProfileID}
	// cmd := exec.CommandContext(ctx, a.sentinelPath, args...)
	// ... ejecutar y parsear respuesta

	result := types.SentinelStopResult{
		Success:   true,
		ProfileID: input.ProfileID,
		Stopped:   true,
	}

	a.logEvent(eventID, "sentinel_stop", "completed", map[string]interface{}{
		"profile_id": input.ProfileID,
		"success":    result.Success,
	})

	return result, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY: StartOllama
// ═══════════════════════════════════════════════════════════════════════════

// StartOllama activity para iniciar Ollama vía Sentinel
// Comando ejecutado: sentinel --json ollama start
func (a *SentinelActivities) StartOllama(ctx context.Context, input types.OllamaStartInput) (types.OllamaStartResult, error) {
	eventID := fmt.Sprintf("ollama_start_%d", time.Now().UnixNano())

	a.logEvent(eventID, "ollama_start", "started", map[string]interface{}{
		"model": input.Model,
	})

	// Ejecutar: sentinel --json ollama start
	args := []string{"--json", "ollama", "start"}
	cmd := exec.CommandContext(ctx, a.sentinelPath, args...)

	output, err := cmd.CombinedOutput()
	outputStr := string(output)
	if err != nil {
		errorMsg := fmt.Sprintf("failed to start ollama: %v", err)
		a.logEvent(eventID, "ollama_start", "failed", map[string]interface{}{
			"error":  errorMsg,
			"output": string(output),
		})
		return types.OllamaStartResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
	}

	// Parsear respuesta JSON
	var sentinelResult SentinelCommandResult
	if err := json.Unmarshal(output, &sentinelResult); err != nil {
		errorMsg := fmt.Sprintf("failed to parse ollama start response: %v", err)
		return types.OllamaStartResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
	}

	result := types.OllamaStartResult{
		Success: sentinelResult.Success,
		Error:   sentinelResult.Error,
	}

	a.logEvent(eventID, "ollama_start", "completed", map[string]interface{}{
		"success": result.Success,
	})

	return result, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY: SeedProfile
// ═══════════════════════════════════════════════════════════════════════════

// SeedProfile activity para crear un nuevo perfil vía Sentinel
// Comando ejecutado: sentinel --json seed <alias> <is_master>
func (a *SentinelActivities) SeedProfile(ctx context.Context, input types.SeedProfileInput) (types.SeedProfileResult, error) {
	eventID := fmt.Sprintf("seed_profile_%d", time.Now().UnixNano())

	a.logEvent(eventID, "seed_profile", "started", map[string]interface{}{
		"alias":     input.Alias,
		"is_master": input.IsMaster,
	})

	// Ejecutar: sentinel --json seed <alias> <is_master>
	isMasterStr := "false"
	if input.IsMaster {
		isMasterStr = "true"
	}

	args := []string{"--json", "seed", input.Alias, isMasterStr}
	cmd := exec.CommandContext(ctx, a.sentinelPath, args...)

	// ✅ FIX: Separar stdout (JSON) de stderr (logs)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Ejecutar comando
	err := cmd.Run()
	
	// ✅ Capturar outputs separados
	stdoutStr := stdout.String()
	stderrStr := stderr.String()
	
	// Loggear stderr para debugging (logs de Sentinel)
	if stderrStr != "" {
		a.logSentinelOutput("seed", "stderr", stderrStr)
	}
	
	// ✅ Parsear SOLO stdout (JSON limpio)
	var sentinelResult SentinelCommandResult
	parseErr := json.Unmarshal([]byte(stdoutStr), &sentinelResult)
	
	// Si el proceso falló Y no logramos parsear JSON válido
	if err != nil && parseErr != nil {
		errorMsg := fmt.Sprintf("failed to seed profile: %v, stdout: %s, stderr: %s", err, stdoutStr, stderrStr)
		a.logEvent(eventID, "seed_profile", "failed", map[string]interface{}{
			"error":  errorMsg,
			"stderr": stderrStr,
		})
		return types.SeedProfileResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
	}
	
	// Si hubo error de parse pero no error del proceso
	if parseErr != nil {
		errorMsg := fmt.Sprintf("failed to parse seed response: %v, stdout: %s", parseErr, stdoutStr)
		return types.SeedProfileResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
	}

	if !sentinelResult.Success {
		a.logEvent(eventID, "seed_profile", "failed", map[string]interface{}{
			"error": sentinelResult.Error,
		})
		return types.SeedProfileResult{
			Success: false,
			Error:   sentinelResult.Error,
		}, fmt.Errorf("seed failed: %s", sentinelResult.Error)
	}

	// Extraer UUID del campo data
	var profileUUID string
	if sentinelResult.Data != nil {
		if uuid, ok := sentinelResult.Data["uuid"].(string); ok {
			profileUUID = uuid
		}
	}
	
	// Validar que recibimos el UUID
	if profileUUID == "" {
		errorMsg := fmt.Sprintf("seed failed: no UUID returned in response (data: %v)", sentinelResult.Data)
		a.logEvent(eventID, "seed_profile", "failed", map[string]interface{}{
			"error":          errorMsg,
			"sentinel_data":  sentinelResult.Data,
			"full_response":  sentinelResult,
		})
		return types.SeedProfileResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
	}

	result := types.SeedProfileResult{
		Success:   true,
		ProfileID: profileUUID,
		Alias:     input.Alias,
		IsMaster:  input.IsMaster,
	}

	a.logEvent(eventID, "seed_profile", "completed", map[string]interface{}{
		"profile_id": result.ProfileID,
		"alias":      result.Alias,
	})

	return result, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ═══════════════════════════════════════════════════════════════════════════

// SentinelCommandResult es el contrato EXACTO que devuelve Sentinel por stdout
type SentinelCommandResult struct {
	Success         bool                   `json:"success"`
	ProfileID       string                 `json:"profile_id,omitempty"`
	ChromePID       int                    `json:"chrome_pid,omitempty"`
	DebugPort       int                    `json:"debug_port,omitempty"`
	ExtensionLoaded bool                   `json:"extension_loaded,omitempty"`
	EffectiveConfig map[string]interface{} `json:"effective_config,omitempty"`
	Error           string                 `json:"error,omitempty"`
	Data            map[string]interface{} `json:"data,omitempty"` // Para respuestas genéricas (seed)
}

// extractJSONFromOutput extrae el JSON válido de la salida de Sentinel
// Sentinel puede imprimir logs y luego el JSON final
func (a *SentinelActivities) extractJSONFromOutput(output string) (SentinelCommandResult, error) {
	var result SentinelCommandResult
	var lastValidJSON string

	// Intentar parsear línea por línea, guardando el último JSON válido
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Verificar si la línea parece JSON
		if !strings.HasPrefix(line, "{") {
			continue
		}

		// Intentar parsear
		var temp SentinelCommandResult
		if err := json.Unmarshal([]byte(line), &temp); err == nil {
			// Es JSON válido
			lastValidJSON = line
			result = temp
		}
	}

	if lastValidJSON == "" {
		// No encontramos ningún JSON válido, intentar parsear todo el output
		if err := json.Unmarshal([]byte(output), &result); err != nil {
			return result, fmt.Errorf("no valid JSON found in output")
		}
	}

	return result, nil
}

// logSentinelOutput guarda la salida de Sentinel a archivo de logs
func (a *SentinelActivities) logSentinelOutput(profileID, stream, line string) {
	if a.logsDir == "" {
		return
	}

	// Crear directorio de logs si no existe
	os.MkdirAll(a.logsDir, 0755)

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