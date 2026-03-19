// File: internal/orchestration/activities/sentinel_activities.go
// Archivo consolidado de activities para Sentinel
// Siguiendo patrón: un archivo auto-contenido con toda la lógica relacionada

package activities

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"go.temporal.io/sdk/activity"

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
// Comando ejecutado: sentinel --json launch <profile_id> [flags...]
func (a *SentinelActivities) LaunchSentinel(ctx context.Context, input types.SentinelLaunchInput) (types.SentinelLaunchResult, error) {
	// Construir comando base: sentinel --json launch <profile_id>
	args := []string{"--json", "launch", input.ProfileID}

	// --mode
	if input.Mode != "" {
		args = append(args, "--mode", input.Mode)
	}

	// --config-file (@ path o - para stdin)
	if input.ConfigOverride != "" {
		args = append(args, "--config-file", input.ConfigOverride)
	}

	// --override-alias
	if input.OverrideAlias != "" {
		args = append(args, "--override-alias", input.OverrideAlias)
	}

	// --override-email
	if input.OverrideEmail != "" {
		args = append(args, "--override-email", input.OverrideEmail)
	}

	// --override-extension
	if input.OverrideExtension != "" {
		args = append(args, "--override-extension", input.OverrideExtension)
	}

	// FIX: --override-heartbeat y --override-register son StringVar en Sentinel,
	// no BoolVar. Pasar el valor como argumento del flag, no como flag de presencia.
	// El código anterior pasaba solo "--override-heartbeat" sin valor, lo que
	// causaba que Cobra emitiera "flag needs an argument" a stderr y Sentinel
	// terminara con exit status 1 sin escribir ningún JSON a stdout.
	if input.OverrideHeartbeat != "" {
		args = append(args, "--override-heartbeat", input.OverrideHeartbeat)
	}

	if input.OverrideRegister != "" {
		args = append(args, "--override-register", input.OverrideRegister)
	}

	// --override-role
	if input.OverrideRole != "" {
		args = append(args, "--override-role", input.OverrideRole)
	}

	// --override-service
	if input.OverrideService != "" {
		args = append(args, "--override-service", input.OverrideService)
	}

	// --override-step
	if input.OverrideStep != "" {
		args = append(args, "--override-step", input.OverrideStep)
	}

	// --save
	if input.Save {
		args = append(args, "--save")
	}

	// --add-account (repetible)
	for _, account := range input.AddAccounts {
		args = append(args, "--add-account", account)
	}

	// Crear comando
	cmd := exec.CommandContext(ctx, a.sentinelPath, args...)

	// Si config-file es "-", pasar ConfigOverride por stdin (contenido JSON directo)
	if input.ConfigOverride == "-" {
		cmd.Stdin = strings.NewReader("")
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

	// Los hooks post_launch son ejecutados por RunPostLaunchHooksActivity
	// en ProfileLifecycleWorkflow. Ejecutarlos también aquí causaba doble
	// ejecución paralela: colisión en nucleus logs synapse → total 1 failed 1.

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
// ACTIVITY: SendOnboardingNavigateActivity
// ═══════════════════════════════════════════════════════════════════════════

// OnboardingNavigateInput parámetros para la activity de navegación de onboarding
type OnboardingNavigateInput struct {
	ProfileID string `json:"profile_id"`
	Step      string `json:"step"`
	RequestID string `json:"request_id"`
}

// OnboardingNavigateResult resultado de la activity de onboarding
type OnboardingNavigateResult struct {
	Success   bool   `json:"success"`
	ProfileID string `json:"profile_id"`
	Step      string `json:"step"`
	RequestID string `json:"request_id"`
	Status    string `json:"status"`
	Error     string `json:"error,omitempty"`
}

// SendOnboardingNavigateActivity envía la señal de navegación de onboarding
// directamente al Brain vía TCP. No usa exec.Command.
//
// Flujo:
//
//	sentinelClientActivity.connect() → REGISTER_CLI → Brain
//	sentinelClientActivity.routeToProfile() → Brain TCP :5678 → bloom-host → background.js
func (a *SentinelActivities) SendOnboardingNavigateActivity(
	ctx context.Context,
	input OnboardingNavigateInput,
) (OnboardingNavigateResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("SendOnboardingNavigateActivity started",
		"profile_id", input.ProfileID,
		"step", input.Step,
		"request_id", input.RequestID,
	)

	activity.RecordHeartbeat(ctx, "connecting_to_brain")

	// Logger simple para el cliente TCP interno
	logDir := filepath.Join(a.logsDir, "sentinel", "onboarding")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return OnboardingNavigateResult{}, fmt.Errorf("failed to create log dir: %w", err)
	}
	dateStr := time.Now().Format("20060102")
	logFile := filepath.Join(logDir, fmt.Sprintf("onboarding_%s_%s.log", input.ProfileID, dateStr))
	scLogger := newSimpleLogger(logFile)
	defer scLogger.close()

	// Crear cliente TCP y conectar al Brain
	const brainAddr = "127.0.0.1:5678"
	sc := newSentinelClientForActivity(brainAddr, scLogger)
	if err := sc.connect(); err != nil {
		return OnboardingNavigateResult{}, fmt.Errorf("failed to connect to Brain: %w", err)
	}
	defer sc.close()

	// Esperar conexión activa (máx 5s)
	if err := sc.waitForConnection(5 * time.Second); err != nil {
		return OnboardingNavigateResult{}, fmt.Errorf("timeout waiting for Brain connection: %w", err)
	}

	activity.RecordHeartbeat(ctx, "routing_to_profile")

	// Construir payload del mensaje onboarding_navigate
	payload := map[string]interface{}{
		"target_profile": input.ProfileID,
		"command":        "onboarding_navigate",
		"step":           input.Step,
		"request_id":     input.RequestID,
		"payload": map[string]interface{}{
			"step": input.Step,
		},
	}

	// Enviar vía routeToProfile con timeout de 10s
	if err := sc.routeToProfile(input.ProfileID, payload, input.RequestID, 10*time.Second); err != nil {
		return OnboardingNavigateResult{
			Success:   false,
			ProfileID: input.ProfileID,
			Step:      input.Step,
			RequestID: input.RequestID,
			Error:     err.Error(),
		}, fmt.Errorf("routing failed: %w", err)
	}

	logger.Info("SendOnboardingNavigateActivity completed",
		"profile_id", input.ProfileID,
		"step", input.Step,
		"request_id", input.RequestID,
	)

	return OnboardingNavigateResult{
		Success:   true,
		ProfileID: input.ProfileID,
		Step:      input.Step,
		RequestID: input.RequestID,
		Status:    "routed",
	}, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENTE TCP INTERNO PARA ACTIVITY
// Implementa el protocolo 4-byte BigEndian idéntico al EventBus de Sentinel.
// Vive aquí para evitar importar sentinel/internal/eventbus desde Nucleus
// (son módulos Go distintos con go.mod propios).
// ═══════════════════════════════════════════════════════════════════════════

// activityEvent es el subconjunto del struct Event de Sentinel necesario aquí
type activityEvent struct {
	Type      string                 `json:"type"`
	ProfileID string                 `json:"profile_id,omitempty"`
	RequestID string                 `json:"request_id,omitempty"`
	Timestamp int64                  `json:"timestamp"`
	Data      map[string]interface{} `json:"data,omitempty"`
	Status    string                 `json:"status,omitempty"`
	Error     string                 `json:"error,omitempty"`
}

type activityEventHandler func(activityEvent)

// sentinelClientActivity gestiona la conexión TCP con Brain para activities
type sentinelClientActivity struct {
	addr       string
	conn       net.Conn
	connMu     sync.RWMutex
	handlers   map[string][]activityEventHandler
	handlersMu sync.RWMutex
	eventChan  chan activityEvent
	stopChan   chan struct{}
	logger     *simpleLogger
	sequence   uint64
	seqMu      sync.Mutex
}

func newSentinelClientForActivity(addr string, logger *simpleLogger) *sentinelClientActivity {
	sc := &sentinelClientActivity{
		addr:      addr,
		handlers:  make(map[string][]activityEventHandler),
		eventChan: make(chan activityEvent, 50),
		stopChan:  make(chan struct{}),
		logger:    logger,
	}
	go sc.dispatcher()
	return sc
}

func (sc *sentinelClientActivity) connect() error {
	conn, err := net.DialTimeout("tcp", sc.addr, 5*time.Second)
	if err != nil {
		return fmt.Errorf("cannot connect to Brain at %s: %w", sc.addr, err)
	}

	sc.connMu.Lock()
	sc.conn = conn
	sc.connMu.Unlock()

	// Enviar REGISTER_CLI para identificarse ante el Brain
	registerEvent := activityEvent{
		Type:      "REGISTER_CLI",
		Timestamp: time.Now().UnixNano(),
		Data: map[string]interface{}{
			"source": "nucleus_activity",
		},
	}
	if err := sc.send(registerEvent); err != nil {
		sc.logger.log("warn", fmt.Sprintf("REGISTER_CLI failed (non-fatal): %v", err))
	}

	go sc.readLoop()
	return nil
}

func (sc *sentinelClientActivity) waitForConnection(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		sc.connMu.RLock()
		connected := sc.conn != nil
		sc.connMu.RUnlock()
		if connected {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("timeout waiting for Brain connection")
}

func (sc *sentinelClientActivity) close() {
	select {
	case <-sc.stopChan:
		// ya cerrado
	default:
		close(sc.stopChan)
	}
	sc.connMu.Lock()
	if sc.conn != nil {
		sc.conn.Close()
		sc.conn = nil
	}
	sc.connMu.Unlock()
}

func (sc *sentinelClientActivity) on(eventType string, handler activityEventHandler) {
	sc.handlersMu.Lock()
	defer sc.handlersMu.Unlock()
	sc.handlers[eventType] = append(sc.handlers[eventType], handler)
}

func (sc *sentinelClientActivity) send(event activityEvent) error {
	sc.connMu.Lock()
	defer sc.connMu.Unlock()

	if sc.conn == nil {
		return fmt.Errorf("no active connection to Brain")
	}

	if event.Timestamp == 0 {
		event.Timestamp = time.Now().UnixNano()
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	// Protocolo 4-byte BigEndian — idéntico a eventbus.go de Sentinel
	header := make([]byte, 4)
	binary.BigEndian.PutUint32(header, uint32(len(payload)))

	if _, err := sc.conn.Write(header); err != nil {
		return fmt.Errorf("failed to write header: %w", err)
	}
	if _, err := sc.conn.Write(payload); err != nil {
		return fmt.Errorf("failed to write payload: %w", err)
	}
	return nil
}

func (sc *sentinelClientActivity) readLoop() {
	for {
		select {
		case <-sc.stopChan:
			return
		default:
			event, err := sc.readEvent()
			if err != nil {
				if err != io.EOF {
					sc.logger.log("warn", fmt.Sprintf("read error: %v", err))
				}
				return
			}
			select {
			case sc.eventChan <- event:
			default:
				sc.logger.log("warn", "event channel full, dropping event")
			}
		}
	}
}

func (sc *sentinelClientActivity) readEvent() (activityEvent, error) {
	sc.connMu.RLock()
	conn := sc.conn
	sc.connMu.RUnlock()

	if conn == nil {
		return activityEvent{}, fmt.Errorf("no connection")
	}

	// Leer header de 4 bytes (BigEndian)
	header := make([]byte, 4)
	if _, err := io.ReadFull(conn, header); err != nil {
		return activityEvent{}, err
	}

	size := binary.BigEndian.Uint32(header)
	if size > 10*1024*1024 {
		return activityEvent{}, fmt.Errorf("payload too large: %d bytes", size)
	}

	buf := make([]byte, size)
	if _, err := io.ReadFull(conn, buf); err != nil {
		return activityEvent{}, err
	}

	var event activityEvent
	if err := json.Unmarshal(buf, &event); err != nil {
		return activityEvent{}, fmt.Errorf("failed to unmarshal event: %w", err)
	}
	return event, nil
}

func (sc *sentinelClientActivity) dispatcher() {
	for {
		select {
		case <-sc.stopChan:
			return
		case event, ok := <-sc.eventChan:
			if !ok {
				return
			}
			sc.handlersMu.RLock()
			handlers := sc.handlers[event.Type]
			wildcards := sc.handlers["*"]
			sc.handlersMu.RUnlock()

			for _, h := range handlers {
				go h(event)
			}
			for _, h := range wildcards {
				go h(event)
			}
		}
	}
}

// routeToProfile envía ROUTE_TO_PROFILE al Brain y espera el ACK correlacionado
// por requestID. Mismo patrón sync que LaunchProfileSyncWithHeartbeat en Sentinel.
func (sc *sentinelClientActivity) routeToProfile(
	profileID string,
	payload map[string]interface{},
	requestID string,
	timeout time.Duration,
) error {
	type result struct{ err error }
	resultCh := make(chan result, 1)
	var once sync.Once

	sc.on("ROUTED", func(event activityEvent) {
		// Correlacionar por request_id — evita race conditions con múltiples perfiles activos
		eventRequestID := ""
		if event.Data != nil {
			eventRequestID, _ = event.Data["request_id"].(string)
		}
		if eventRequestID == "" {
			eventRequestID = event.RequestID
		}
		if eventRequestID != requestID {
			return
		}

		once.Do(func() {
			if event.Status == "routed" || event.Status == "ok" {
				resultCh <- result{nil}
			} else {
				errMsg := event.Error
				if errMsg == "" && event.Data != nil {
					if msg, ok := event.Data["message"].(string); ok {
						errMsg = msg
					}
				}
				if errMsg == "" {
					errMsg = "Brain reported routing error without message"
				}
				resultCh <- result{fmt.Errorf("routing failed: %s", errMsg)}
			}
		})
	})

	routeEvent := activityEvent{
		Type:      "ROUTE_TO_PROFILE",
		ProfileID: profileID,
		RequestID: requestID,
		Timestamp: time.Now().UnixNano(),
		Data:      payload,
	}

	if err := sc.send(routeEvent); err != nil {
		return fmt.Errorf("failed to send ROUTE_TO_PROFILE: %w", err)
	}

	deadline := time.NewTimer(timeout)
	defer deadline.Stop()

	select {
	case res := <-resultCh:
		return res.err
	case <-deadline.C:
		return fmt.Errorf(
			"timeout waiting for routing ACK (request_id=%s, profile=%s, timeout=%s)",
			requestID, profileID, timeout,
		)
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGER SIMPLE PARA ACTIVITY — sin dependencia de core.Logger
// ═══════════════════════════════════════════════════════════════════════════

type simpleLogger struct {
	f *os.File
}

func newSimpleLogger(path string) *simpleLogger {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return &simpleLogger{}
	}
	return &simpleLogger{f: f}
}

func (l *simpleLogger) log(level, msg string) {
	if l.f == nil {
		return
	}
	fmt.Fprintf(l.f, "[%s] [%s] %s\n", time.Now().Format("2006-01-02 15:04:05"), level, msg)
}

func (l *simpleLogger) close() {
	if l.f != nil {
		l.f.Close()
	}
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