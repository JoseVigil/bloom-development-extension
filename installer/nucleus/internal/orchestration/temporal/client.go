package temporal

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/client"
	
	"nucleus/internal/core"
	"nucleus/internal/orchestration/types"
	"nucleus/internal/orchestration/queries"
	"nucleus/internal/orchestration/signals"
)

// Client envuelve el cliente de Temporal
type Client struct {
	client client.Client
}

// NewClient crea un nuevo cliente Temporal
func NewClient(ctx context.Context) (*Client, error) {
	// Conectar a localhost:7233 (puerto por defecto de Temporal)
	c, err := client.Dial(client.Options{
		HostPort:  "localhost:7233",
		Namespace: "default",
	})
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

// ExecuteLaunchWorkflow ejecuta workflow con polling y retorna resultado completo
func (c *Client) ExecuteLaunchWorkflow(ctx context.Context, logger *core.Logger, profileID string, mode string) (*LaunchResult, error) {
	workflowID := fmt.Sprintf("profile-lifecycle-%s", profileID)
	commandID := fmt.Sprintf("launch_%s_%d", profileID, time.Now().UnixNano())

	logger.Info("Executing workflow: %s", workflowID)

	workflowOptions := client.StartWorkflowOptions{
		ID:        workflowID,
		TaskQueue: "profile-orchestration",
	}

	input := types.ProfileLifecycleInput{
		ProfileID:   profileID,
		Environment: "production",
	}

	we, err := c.client.ExecuteWorkflow(ctx, workflowOptions, "ProfileLifecycleWorkflow", input)
	if err != nil {
		return nil, fmt.Errorf("failed to start workflow: %w", err)
	}

	event := types.BrainEvent{
		Type:      signals.EventOnboardingComplete,
		ProfileID: profileID,
		Timestamp: time.Now().Unix(),
		Data:      make(map[string]interface{}),
	}

	if err := c.SignalWorkflow(ctx, we.GetID(), we.GetRunID(), signals.SignalBrainEvent, event); err != nil {
		return nil, fmt.Errorf("failed to send signal: %w", err)
	}

	for i := 0; i < 60; i++ {
		time.Sleep(1 * time.Second)

		var status types.ProfileStatus
		if err := c.QueryWorkflow(ctx, we.GetID(), we.GetRunID(), queries.QueryStatus, &status); err != nil {
			continue
		}

		if status.SentinelRunning {
			var details types.SentinelLaunchResult
			if err := c.QueryWorkflow(ctx, we.GetID(), we.GetRunID(), "sentinel-details", &details); err == nil {
				return &LaunchResult{
					Success:         details.Success,
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

		if status.State == types.StateFailed {
			return &LaunchResult{
				Success:   false,
				ProfileID: profileID,
				LaunchID:  commandID,
				State:     string(status.State),
				Error:     status.ErrorMessage,
				Timestamp: time.Now().Unix(),
			}, fmt.Errorf("launch failed: %s", status.ErrorMessage)
		}
	}

	return nil, fmt.Errorf("timeout")
}

// LaunchResult contrato Electron
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