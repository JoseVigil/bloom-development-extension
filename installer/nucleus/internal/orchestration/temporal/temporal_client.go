package temporal

import (
	"context"
	"fmt"
	"os"
	"time"

	"go.temporal.io/api/enums/v1"
	"go.temporal.io/sdk/client"

	"nucleus/internal/core"
	"nucleus/internal/orchestration/queries"
	"nucleus/internal/orchestration/signals"
	"nucleus/internal/orchestration/temporal/workflows"
	"nucleus/internal/orchestration/types"
)

// Client envuelve el cliente de Temporal
type Client struct {
	client client.Client
}

// NewClient crea un nuevo cliente Temporal
func NewClient(ctx context.Context, paths *core.Paths, jsonMode bool) (*Client, error) {
	// Crear logger específico para Temporal
	temporalLogger, err := core.InitTemporalLogger(paths, jsonMode)
	if err != nil {
		return nil, fmt.Errorf("failed to create temporal logger: %w", err)
	}

	opts := client.Options{
		HostPort:  "localhost:7233",
		Namespace: "default",
		Logger:    temporalLogger,
	}

	c, err := client.Dial(opts)
	if err != nil {
		return nil, fmt.Errorf("failed to create temporal client: %w", err)
	}

	return &Client{client: c}, nil
}

// GetClient retorna el cliente nativo de Temporal
func (c *Client) GetClient() client.Client {
	return c.client
}

// Close cierra el cliente
func (c *Client) Close() {
	if c.client != nil {
		c.client.Close()
	}
}

// ExecuteWorkflow inicia un workflow
func (c *Client) ExecuteWorkflow(ctx context.Context, options client.StartWorkflowOptions, workflow interface{}, args ...interface{}) (client.WorkflowRun, error) {
	return c.client.ExecuteWorkflow(ctx, options, workflow, args...)
}

// SignalWorkflow envía una señal a un workflow
func (c *Client) SignalWorkflow(ctx context.Context, workflowID string, runID string, signalName string, arg interface{}) error {
	return c.client.SignalWorkflow(ctx, workflowID, runID, signalName, arg)
}

// QueryWorkflow consulta el estado de un workflow
func (c *Client) QueryWorkflow(ctx context.Context, workflowID string, runID string, queryType string, result interface{}) error {
	resp, err := c.client.QueryWorkflow(ctx, workflowID, runID, queryType)
	if err != nil {
		return err
	}
	return resp.Get(result)
}

// CancelWorkflow cancela un workflow
func (c *Client) CancelWorkflow(ctx context.Context, workflowID string, runID string) error {
	return c.client.CancelWorkflow(ctx, workflowID, runID)
}

// ExecuteSeedWorkflow ejecuta el proceso completo de seed y retorna el UUID del perfil
func (c *Client) ExecuteSeedWorkflow(ctx context.Context, logger *core.Logger, alias string, isMaster bool) (*SeedResult, error) {
	workflowID := fmt.Sprintf("seed-%s-%d", alias, time.Now().UnixNano())

	fmt.Fprintf(os.Stderr, "[INFO] Executing seed workflow: %s\n", workflowID)

	workflowOptions := client.StartWorkflowOptions{
		ID:        workflowID,
		TaskQueue: "profile-orchestration",
	}

	input := types.SeedProfileInput{
		Alias:    alias,
		IsMaster: isMaster,
	}

	we, err := c.client.ExecuteWorkflow(ctx, workflowOptions, "SeedWorkflow", input)
	if err != nil {
		return nil, fmt.Errorf("failed to start seed workflow: %w", err)
	}

	// Esperar resultado del workflow
	var seedResult types.SeedProfileResult
	if err := we.Get(ctx, &seedResult); err != nil {
		return nil, fmt.Errorf("seed workflow failed: %w", err)
	}

	if !seedResult.Success {
		return nil, fmt.Errorf("seed failed: %s", seedResult.Error)
	}

	// Ahora crear el workflow de lifecycle del perfil
	profileWorkflowID := fmt.Sprintf("profile-lifecycle-%s", seedResult.ProfileID)
	profileWorkflowOptions := client.StartWorkflowOptions{
		ID:        profileWorkflowID,
		TaskQueue: "profile-orchestration",
	}

	profileInput := types.ProfileLifecycleInput{
		ProfileID:   seedResult.ProfileID,
		Environment: "production",
		LaunchCount: 0,
	}

	profileWE, err := c.client.ExecuteWorkflow(ctx, profileWorkflowOptions, "ProfileLifecycleWorkflow", profileInput)
	if err != nil {
		return nil, fmt.Errorf("failed to start profile lifecycle workflow: %w", err)
	}

	return &SeedResult{
		Success:       true,
		ProfileID:     seedResult.ProfileID,
		Alias:         seedResult.Alias,
		IsMaster:      seedResult.IsMaster,
		WorkflowID:    profileWE.GetID(),
		WorkflowRunID: profileWE.GetRunID(),
		Timestamp:     time.Now().Unix(),
	}, nil
}

// LaunchOverrides agrupa todos los flags opcionales de override para el comando launch
type LaunchOverrides struct {
	ConfigFile        string
	OverrideAlias     string
	OverrideEmail     string
	OverrideExtension string
	OverrideHeartbeat string
	OverrideRegister  string
	OverrideRole      string
	OverrideService   string
	OverrideStep      string
	Save              bool
	AddAccounts       []string
}

// ExecuteLaunchWorkflow ejecuta el launch de un perfil existente usando SignalWithStart.
// SignalWithStart garantiza atomicidad: crea el workflow si no existe, o le envía
// la señal si ya está corriendo — sin race condition entre ambas operaciones.
// Elimina la necesidad de DescribeWorkflowExecution + restart manual previos.
func (c *Client) ExecuteLaunchWorkflow(ctx context.Context, logger *core.Logger, profileID string, mode string, overrides LaunchOverrides) (*LaunchResult, error) {
	workflowID := fmt.Sprintf("profile-lifecycle-%s", profileID)

	logger.Info("Executing launch for profile: %s (workflow: %s)", profileID, workflowID)

	launchSignal := types.LaunchSignal{
		Mode:              mode,
		ConfigOverride:    overrides.ConfigFile,
		OverrideAlias:     overrides.OverrideAlias,
		OverrideEmail:     overrides.OverrideEmail,
		OverrideExtension: overrides.OverrideExtension,
		OverrideHeartbeat: overrides.OverrideHeartbeat,
		OverrideRegister:  overrides.OverrideRegister,
		OverrideRole:      overrides.OverrideRole,
		OverrideService:   overrides.OverrideService,
		OverrideStep:      overrides.OverrideStep,
		Save:              overrides.Save,
		AddAccounts:       overrides.AddAccounts,
	}

	profileInput := types.ProfileLifecycleInput{
		ProfileID:   profileID,
		Environment: "production",
		LaunchCount: 0, // El workflow lo preserva internamente vía ContinueAsNew
	}

	workflowOptions := client.StartWorkflowOptions{
		ID:        workflowID,
		TaskQueue: "profile-orchestration",
		// ALLOW_DUPLICATE permite que SignalWithStart cree un nuevo run si el workflow
		// terminó (ej: reinicio del servidor, crash). Si ya está RUNNING, solo envía la señal.
		WorkflowIDReusePolicy: enums.WORKFLOW_ID_REUSE_POLICY_ALLOW_DUPLICATE,
	}

	// SignalWithStart es atómico: no hay ventana entre "verificar si existe" y "señalizar/crear".
	// Si el workflow está RUNNING  → envía la señal al run activo.
	// Si el workflow no existe     → lo crea con profileInput y entrega la señal al arrancar.
	// Si el workflow está COMPLETED/FAILED → crea un nuevo run (ALLOW_DUPLICATE).
	if _, err := c.client.SignalWithStartWorkflow(
		ctx,
		workflowID,
		signals.SignalLaunch,
		launchSignal,
		workflowOptions,
		"ProfileLifecycleWorkflow",
		profileInput,
	); err != nil {
		return nil, fmt.Errorf("failed to signal-with-start lifecycle workflow: %w", err)
	}

	logger.Info("Launch signal sent via SignalWithStart, waiting for Sentinel to start...")

	// Polling para esperar que Sentinel arranque.
	// Los primeros queries pueden fallar si el workflow fue recién creado y aún no registró
	// el query handler — el retry cubre esa ventana sin sleep fijo previo.
	maxAttempts := 60
	pollInterval := 1 * time.Second

	for i := 0; i < maxAttempts; i++ {
		time.Sleep(pollInterval)

		var status types.ProfileStatus
		if err := c.QueryWorkflow(ctx, workflowID, "", queries.QueryStatus, &status); err != nil {
			logger.Warning("Query failed (attempt %d/%d): %v", i+1, maxAttempts, err)
			continue
		}

		// En el primer query con estado conocido, validar que el perfil puede lanzarse.
		// Se chequea aquí (post-señal) en lugar de antes para evitar el DescribeWorkflow previo.
		if i == 0 || status.State == types.StateLaunching {
			if status.SentinelRunning {
				return nil, fmt.Errorf("sentinel is already running for this profile")
			}
			if status.State != types.StateSeeded &&
				status.State != types.StateReady &&
				status.State != types.StateIdle &&
				status.State != types.StateLaunching {
				return nil, fmt.Errorf("profile cannot be launched in state: %s (must be SEEDED, READY, IDLE, or LAUNCHING)", status.State)
			}
		}

		// Si pasó a FAILED, retornar error inmediatamente
		if status.State == types.StateFailed {
			return &LaunchResult{
				Success:   false,
				ProfileID: profileID,
				State:     string(status.State),
				Error:     status.ErrorMessage,
				Timestamp: time.Now().Unix(),
			}, fmt.Errorf("launch failed: %s", status.ErrorMessage)
		}

		// Sentinel corriendo y estado RUNNING — obtener detalles completos
		if status.SentinelRunning && status.State == types.StateRunning {
			var details types.SentinelLaunchResult
			if err := c.QueryWorkflow(ctx, workflowID, "", queries.QuerySentinelDetails, &details); err == nil {
				return &LaunchResult{
					Success:         true,
					ProfileID:       details.ProfileID,
					LaunchID:        details.LaunchID,
					ChromePID:       details.ChromePID,
					DebugPort:       details.DebugPort,
					ExtensionLoaded: details.ExtensionLoaded,
					EffectiveConfig: details.EffectiveConfig,
					State:           string(status.State),
					Timestamp:       time.Now().Unix(),
				}, nil
			}
		}

		logger.Debug("Waiting for launch (attempt %d/%d, state: %s)", i+1, maxAttempts, status.State)
	}

	return nil, fmt.Errorf("timeout waiting for Sentinel to start")
}

// ShutdownProfile envía señal de shutdown a un perfil
func (c *Client) ShutdownProfile(ctx context.Context, logger *core.Logger, profileID string) error {
	workflowID := fmt.Sprintf("profile-lifecycle-%s", profileID)

	logger.Info("Sending shutdown signal to profile: %s", profileID)

	if err := c.SignalWorkflow(ctx, workflowID, "", signals.SignalShutdown, nil); err != nil {
		return fmt.Errorf("failed to send shutdown signal: %w", err)
	}

	logger.Success("Shutdown signal sent successfully")
	return nil
}

// GetProfileStatus obtiene el estado actual de un perfil
func (c *Client) GetProfileStatus(ctx context.Context, profileID string) (*types.ProfileStatus, error) {
	workflowID := fmt.Sprintf("profile-lifecycle-%s", profileID)

	var status types.ProfileStatus
	if err := c.QueryWorkflow(ctx, workflowID, "", queries.QueryStatus, &status); err != nil {
		return nil, fmt.Errorf("failed to query profile status: %w", err)
	}

	return &status, nil
}

// ExecuteOnboardingWorkflow ejecuta el workflow de navegación de onboarding
// y bloquea hasta obtener el ACK de routing del Brain.
//
// El workflowID sigue la convención: onboarding_{profile_id}_{timestamp_unix_nano}
// El requestID sigue el formato BTIPS: onb_nav_{timestamp_unix}_{prefix}
func (c *Client) ExecuteOnboardingWorkflow(
	ctx context.Context,
	logger *core.Logger,
	profileID string,
	step string,
) (*OnboardingResult, error) {
	// Generar requestID único con formato especificado en BTIPS v4.0
	prefix := profileID
	if len(prefix) > 3 {
		prefix = prefix[:3]
	}
	requestID := fmt.Sprintf("onb_nav_%d_%s", time.Now().Unix(), prefix)

	workflowID := fmt.Sprintf("onboarding_%s_%d", profileID, time.Now().UnixNano())

	logger.Info("Executing onboarding workflow: %s (step: %s, request_id: %s)", workflowID, step, requestID)

	workflowOptions := client.StartWorkflowOptions{
		ID:        workflowID,
		TaskQueue: "profile-orchestration",
	}

	input := workflows.OnboardingNavigateInput{
		ProfileID: profileID,
		Step:      step,
		RequestID: requestID,
	}

	we, err := c.client.ExecuteWorkflow(ctx, workflowOptions, "OnboardingWorkflow", input)
	if err != nil {
		return nil, fmt.Errorf("failed to start onboarding workflow: %w", err)
	}

	// Bloquear hasta resultado
	var wfResult workflows.OnboardingNavigateResult
	if err := we.Get(ctx, &wfResult); err != nil {
		return nil, fmt.Errorf("onboarding workflow failed: %w", err)
	}

	if !wfResult.Success {
		return nil, fmt.Errorf("onboarding routing failed: %s", wfResult.Error)
	}

	return &OnboardingResult{
		Success:   true,
		ProfileID: wfResult.ProfileID,
		Step:      wfResult.Step,
		RequestID: wfResult.RequestID,
		Status:    wfResult.Status,
		Timestamp: time.Now().Unix(),
	}, nil
}

// LaunchResult contrato para Electron (respuesta de launch)
type LaunchResult struct {
	Success         bool                   `json:"success"`
	ProfileID       string                 `json:"profile_id"`
	LaunchID        string                 `json:"launch_id,omitempty"`
	ChromePID       int                    `json:"chrome_pid,omitempty"`
	DebugPort       int                    `json:"debug_port,omitempty"`
	ExtensionLoaded bool                   `json:"extension_loaded,omitempty"`
	EffectiveConfig map[string]interface{} `json:"effective_config,omitempty"`
	State           string                 `json:"state,omitempty"`
	Error           string                 `json:"error,omitempty"`
	Timestamp       int64                  `json:"timestamp"`
}

// SeedResult contrato para Electron (respuesta de seed)
type SeedResult struct {
	Success       bool   `json:"success"`
	ProfileID     string `json:"profile_id"`
	Alias         string `json:"alias"`
	IsMaster      bool   `json:"is_master"`
	WorkflowID    string `json:"workflow_id"`
	WorkflowRunID string `json:"workflow_run_id"`
	Error         string `json:"error,omitempty"`
	Timestamp     int64  `json:"timestamp"`
}

// OnboardingResult contrato para Electron (respuesta de onboarding navigate)
type OnboardingResult struct {
	Success   bool   `json:"success"`
	ProfileID string `json:"profile_id"`
	Step      string `json:"step"`
	RequestID string `json:"request_id"`
	Status    string `json:"status"`
	Error     string `json:"error,omitempty"`
	Timestamp int64  `json:"timestamp"`
}