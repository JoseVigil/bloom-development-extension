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

	"nucleus/internal/mandates"
	"nucleus/internal/orchestration/types"
)

// SentinelActivities contiene las activities para interactuar con Sentinel
type SentinelActivities struct {
	logsDir      string
	nucleusPath  string // Path al binario de nucleus.exe (para telemetry register)
	sentinelPath string // Path al binario de sentinel.exe
}

// NewSentinelActivities crea una nueva instancia de SentinelActivities
// CAMBIO: telemetryPath eliminado — nucleus.exe es el único writer de telemetry.json
func NewSentinelActivities(logsDir, nucleusPath, sentinelPath string) *SentinelActivities {
	return &SentinelActivities{
		logsDir:      logsDir,
		nucleusPath:  nucleusPath,
		sentinelPath: sentinelPath,
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY: LaunchSentinel
// ═══════════════════════════════════════════════════════════════════════════

// LaunchSentinel activity para lanzar Sentinel de forma idempotente
// Comando ejecutado: sentinel --json launch <profile_id> [--mode <mode>] [--config-file -]
func (a *SentinelActivities) LaunchSentinel(ctx context.Context, input types.SentinelLaunchInput) (types.SentinelLaunchResult, error) {
	// Construir comando: sentinel --json launch <profile_id>
	args := []string{"--json", "launch", input.ProfileID}

	// Agregar flags opcionales
	if input.Mode != "" {
		args = append(args, "--mode", input.Mode)
	}
	if input.ConfigOverride != "" {
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
		return types.SentinelLaunchResult{
			Success: false,
			Error:   fmt.Sprintf("failed to start sentinel: %v", err),
		}, fmt.Errorf("failed to start sentinel: %w", err)
	}

	// Leer stderr en goroutine
	stderrDone := make(chan struct{})
	go func() {
		defer close(stderrDone)
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			line := scanner.Text()
			stderrBuf.WriteString(line + "\n")
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
		return types.SentinelLaunchResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
	}

	// Si parseamos JSON pero indica error
	if parseErr == nil && !sentinelResult.Success {
		// Preferir el launch_id que Sentinel generó; si no viene, usar CommandID de Temporal
		launchID := sentinelResult.LaunchID
		if launchID == "" {
			launchID = input.CommandID
		}
		return types.SentinelLaunchResult{
			Success:   false,
			ProfileID: sentinelResult.ProfileID,
			Error:     sentinelResult.Error,
			LaunchID:  launchID,
		}, fmt.Errorf("sentinel launch failed: %s", sentinelResult.Error)
	}

	// Validar que recibimos campos mínimos esperados
	if sentinelResult.ProfileID == "" || sentinelResult.ChromePID == 0 {
		errorMsg := "sentinel returned incomplete JSON response (missing profile_id or chrome_pid)"
		return types.SentinelLaunchResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
	}

	// Mapear resultado
	// Preferir el launch_id que Sentinel generó (formato corto: "001_a3c93b51_153056").
	// Si Sentinel no lo devuelve en el JSON, usar el CommandID de Temporal como fallback
	// para no romper el flujo existente.
	effectiveLaunchID := sentinelResult.LaunchID
	if effectiveLaunchID == "" {
		effectiveLaunchID = input.CommandID
	}
	result := types.SentinelLaunchResult{
		Success:         sentinelResult.Success,
		ProfileID:       sentinelResult.ProfileID,
		ChromePID:       sentinelResult.ChromePID,
		DebugPort:       sentinelResult.DebugPort,
		ExtensionLoaded: sentinelResult.ExtensionLoaded,
		EffectiveConfig: sentinelResult.EffectiveConfig,
		Error:           sentinelResult.Error,
		LaunchID:        effectiveLaunchID,
	}

	// Encadenar hooks post_launch de forma best-effort.
	// Corre en goroutine para no bloquear el retorno del launch —
	// los hooks pueden esperar hasta 120s los logs de Chrome.
	go func() {
		hctx := mandates.NewHookContext(result.LaunchID, result.ProfileID)
		mandates.RunEvent(context.Background(), "post_launch", hctx)
	}()

	return result, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY: StopSentinel
// ═══════════════════════════════════════════════════════════════════════════

// StopSentinel activity para detener Sentinel
func (a *SentinelActivities) StopSentinel(ctx context.Context, input types.SentinelStopInput) (types.SentinelStopResult, error) {
	// Por ahora retornamos éxito simulado
	// En producción: sentinel --json stop <profile_id>
	result := types.SentinelStopResult{
		Success:   true,
		ProfileID: input.ProfileID,
		Stopped:   true,
	}

	return result, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY: StartOllama
// ═══════════════════════════════════════════════════════════════════════════

// StartOllama activity para iniciar Ollama vía Sentinel
func (a *SentinelActivities) StartOllama(ctx context.Context, input types.OllamaStartInput) (types.OllamaStartResult, error) {
	args := []string{"--json", "ollama", "start"}
	cmd := exec.CommandContext(ctx, a.sentinelPath, args...)

	output, err := cmd.CombinedOutput()
	if err != nil {
		errorMsg := fmt.Sprintf("failed to start ollama: %v", err)
		return types.OllamaStartResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
	}

	var sentinelResult SentinelCommandResult
	if err := json.Unmarshal(output, &sentinelResult); err != nil {
		errorMsg := fmt.Sprintf("failed to parse ollama start response: %v", err)
		return types.OllamaStartResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
	}

	return types.OllamaStartResult{
		Success: sentinelResult.Success,
		Error:   sentinelResult.Error,
	}, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY: SeedProfile
// ═══════════════════════════════════════════════════════════════════════════

// SeedProfile activity para crear un nuevo perfil vía Sentinel
func (a *SentinelActivities) SeedProfile(ctx context.Context, input types.SeedProfileInput) (types.SeedProfileResult, error) {
	isMasterStr := "false"
	if input.IsMaster {
		isMasterStr = "true"
	}

	args := []string{"--json", "seed", input.Alias, isMasterStr}
	cmd := exec.CommandContext(ctx, a.sentinelPath, args...)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	stdoutStr := strings.TrimSpace(stdout.String())
	stderrStr := stderr.String()

	if stderrStr != "" {
		a.logSentinelOutput("seed", "stderr", stderrStr)
	}

	var sentinelResult SentinelCommandResult
	parseErr := json.Unmarshal([]byte(stdoutStr), &sentinelResult)

	if err != nil && parseErr != nil {
		errorMsg := fmt.Sprintf("failed to seed profile: %v, stdout: %s, stderr: %s", err, stdoutStr, stderrStr)
		return types.SeedProfileResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
	}

	if parseErr != nil {
		errorMsg := fmt.Sprintf("failed to parse seed response: %v, stdout: %s", parseErr, stdoutStr)
		return types.SeedProfileResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
	}

	if !sentinelResult.Success {
		return types.SeedProfileResult{
			Success: false,
			Error:   sentinelResult.Error,
		}, fmt.Errorf("seed failed: %s", sentinelResult.Error)
	}

	// Extraer UUID
	var profileUUID string
	if sentinelResult.ProfileID != "" {
		profileUUID = sentinelResult.ProfileID
	} else if sentinelResult.Data != nil {
		if uuid, ok := sentinelResult.Data["uuid"].(string); ok {
			profileUUID = uuid
		}
	}

	if profileUUID == "" {
		errorMsg := fmt.Sprintf("seed failed: no UUID returned in response (data: %v)", sentinelResult.Data)
		return types.SeedProfileResult{
			Success: false,
			Error:   errorMsg,
		}, fmt.Errorf(errorMsg)
	}

	return types.SeedProfileResult{
		Success:   true,
		ProfileID: profileUUID,
		Alias:     input.Alias,
		IsMaster:  input.IsMaster,
	}, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS INTERNOS
// ═══════════════════════════════════════════════════════════════════════════

// SentinelCommandResult es el contrato EXACTO que devuelve Sentinel por stdout
type SentinelCommandResult struct {
	Success         bool                   `json:"success"`
	ProfileID       string                 `json:"profile_id,omitempty"`
	LaunchID        string                 `json:"launch_id,omitempty"` // ID corto generado por Sentinel, e.g. "001_a3c93b51_153056"
	ChromePID       int                    `json:"chrome_pid,omitempty"`
	DebugPort       int                    `json:"debug_port,omitempty"`
	ExtensionLoaded bool                   `json:"extension_loaded,omitempty"`
	EffectiveConfig map[string]interface{} `json:"effective_config,omitempty"`
	Error           string                 `json:"error,omitempty"`
	Data            map[string]interface{} `json:"data,omitempty"`
}

// extractJSONFromOutput extrae el JSON válido de la salida de Sentinel
func (a *SentinelActivities) extractJSONFromOutput(output string) (SentinelCommandResult, error) {
	var result SentinelCommandResult
	var lastValidJSON string

	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, "{") {
			continue
		}
		var temp SentinelCommandResult
		if err := json.Unmarshal([]byte(line), &temp); err == nil {
			lastValidJSON = line
			result = temp
		}
	}

	if lastValidJSON == "" {
		if err := json.Unmarshal([]byte(output), &result); err != nil {
			return result, fmt.Errorf("no valid JSON found in output")
		}
	}

	return result, nil
}

// logSentinelOutput escribe la salida de Sentinel a su archivo de log
// y registra el stream en telemetry.json via nucleus telemetry register
// Path: logs/sentinel/profiles/sentinel_<profileID>_<date>.log
func (a *SentinelActivities) logSentinelOutput(profileID, stream, line string) {
	if a.logsDir == "" {
		return
	}

	// FIX: subcarpeta sentinel/profiles/ según spec
	logDir := filepath.Join(a.logsDir, "sentinel", "profiles")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return
	}

	// Nombre de archivo con fecha según naming convention de la spec
	dateStr := time.Now().Format("20060102")
	logFile := filepath.Join(logDir, fmt.Sprintf("sentinel_%s_%s.log", profileID, dateStr))

	f, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return
	}
	defer f.Close()

	timestamp := time.Now().Format("2006-01-02 15:04:05")
	fmt.Fprintf(f, "[%s] [%s] %s\n", timestamp, stream, line)

	// Registrar en telemetry.json via nucleus CLI (único writer permitido)
	// Idempotente: se puede llamar múltiples veces sin problema
	if a.nucleusPath != "" {
		streamID := fmt.Sprintf("sentinel_%s", profileID[:8])
		label := fmt.Sprintf("🔥 SENTINEL %s", profileID[:8])
		exec.Command(a.nucleusPath,
			"telemetry", "register",
			"--stream", streamID,
			"--label", label,
			"--path", filepath.ToSlash(logFile),
			"--priority", "1",
		).Run()
	}
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}