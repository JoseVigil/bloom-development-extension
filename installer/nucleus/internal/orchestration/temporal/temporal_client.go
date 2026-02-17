package temporal

import (
	"context"
	"fmt"
	"os"
	"time"

	"go.temporal.io/sdk/client"

	"nucleus/internal/core"
	"nucleus/internal/orchestration/queries"
	"nucleus/internal/orchestration/signals"
	"nucleus/internal/orchestration/types"
)

// Client envuelve el cliente de Temporal
type Client struct {
	client client.Client
}

// NewClient crea un nuevo cliente Temporal
func NewClient(ctx context.Context, paths *core.PathConfig, jsonMode bool) (*Client, error) {
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
	}

	profileWE, err := c.client.ExecuteWorkflow(ctx, profileWorkflowOptions, "ProfileLifecycleWorkflow", profileInput)
	if err != nil {
		return nil, fmt.Errorf("failed to start profile lifecycle workflow: %w", err)
	}

	return &SeedResult{
		Success:      true,
		ProfileID:    seedResult.ProfileID,
		Alias:        seedResult.Alias,
		IsMaster:     seedResult.IsMaster,
		WorkflowID:   profileWE.GetID(),
		WorkflowRunID: profileWE.GetRunID(),
		Timestamp:    time.Now().Unix(),
	}, nil
}

// ExecuteLaunchWorkflow ejecuta el launch de un perfil existente usando señales
func (c *Client) ExecuteLaunchWorkflow(ctx context.Context, logger *core.Logger, profileID string, mode string) (*LaunchResult, error) {
	workflowID := fmt.Sprintf("profile-lifecycle-%s", profileID)

	logger.Info("Executing launch for profile: %s (workflow: %s)", profileID, workflowID)

	// Verificar que el workflow existe y está corriendo
	descResp, err := c.client.DescribeWorkflowExecution(ctx, workflowID, "")
	if err != nil {
		return nil, fmt.Errorf("workflow not found (profile may not exist): %w", err)
	}

	// Verificar que el workflow está en estado RUNNING
	if descResp.WorkflowExecutionInfo.Status != 1 { // 1 = RUNNING
		return nil, fmt.Errorf("workflow is not running (status: %v)", descResp.WorkflowExecutionInfo.Status)
	}

	// Verificar estado actual del perfil
	var currentStatus types.ProfileStatus
	if err := c.QueryWorkflow(ctx, workflowID, "", queries.QueryStatus, &currentStatus); err != nil {
		return nil, fmt.Errorf("failed to query profile status: %w", err)
	}

	// Validar que el perfil está en estado apropiado para launch
	if currentStatus.State != types.StateSeeded && 
	   currentStatus.State != types.StateReady && 
	   currentStatus.State != types.StateIdle {
		return nil, fmt.Errorf("profile cannot be launched in state: %s (must be SEEDED, READY, or IDLE)", currentStatus.State)
	}

	// Si está ya corriendo, retornar error
	if currentStatus.SentinelRunning {
		return nil, fmt.Errorf("sentinel is already running for this profile")
	}

	// Enviar señal de LAUNCH
	launchSignal := types.LaunchSignal{
		Mode:           mode,
		ConfigOverride: "", // TODO: Agregar soporte para config override si es necesario
	}

	if err := c.SignalWorkflow(ctx, workflowID, "", signals.SignalLaunch, launchSignal); err != nil {
		return nil, fmt.Errorf("failed to send launch signal: %w", err)
	}

	logger.Info("Launch signal sent, waiting for Sentinel to start...")

	// Polling para esperar que Sentinel arranque
	maxAttempts := 60
	pollInterval := 1 * time.Second

	for i := 0; i < maxAttempts; i++ {
		time.Sleep(pollInterval)

		// Query estado actual
		var status types.ProfileStatus
		if err := c.QueryWorkflow(ctx, workflowID, "", queries.QueryStatus, &status); err != nil {
			logger.Warning("Query failed (attempt %d/%d): %v", i+1, maxAttempts, err)
			continue
		}

		// Si pasó a FAILED, retornar error
		if status.State == types.StateFailed {
			return &LaunchResult{
				Success:   false,
				ProfileID: profileID,
				State:     string(status.State),
				Error:     status.ErrorMessage,
				Timestamp: time.Now().Unix(),
			}, fmt.Errorf("launch failed: %s", status.ErrorMessage)
		}

		// Si Sentinel está corriendo, obtener detalles
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