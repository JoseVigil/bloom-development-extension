package synapse

import (
	"context"
	"fmt"
	"time"

	"nucleus/internal/core"

	"go.temporal.io/sdk/client"
)

// TemporalClient wraps Temporal SDK client
type TemporalClient struct {
	client client.Client
	logger *core.Logger
	core   *core.Core
}

// TemporalConfig holds Temporal connection configuration
type TemporalConfig struct {
	HostPort  string
	Namespace string
	TaskQueue string
}

// DefaultTemporalConfig returns default configuration for Temporal OSS
func DefaultTemporalConfig() TemporalConfig {
	return TemporalConfig{
		HostPort:  "localhost:7233", // Default Temporal OSS port
		Namespace: "default",
		TaskQueue: "nucleus-orchestration",
	}
}

// NewTemporalClient initializes a new Temporal client
func NewTemporalClient(c *core.Core, logger *core.Logger) (*TemporalClient, error) {
	cfg := DefaultTemporalConfig()

	logger.Info("Connecting to Temporal at %s", cfg.HostPort)

	// Create Temporal client
	tc, err := client.Dial(client.Options{
		HostPort:  cfg.HostPort,
		Namespace: cfg.Namespace,
		Logger:    newTemporalLogger(logger),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create Temporal client: %w", err)
	}

	logger.Info("Successfully connected to Temporal namespace: %s", cfg.Namespace)

	return &TemporalClient{
		client: tc,
		logger: logger,
		core:   c,
	}, nil
}

// ExecuteLaunchWorkflow executes the launch workflow via Temporal
func (tc *TemporalClient) ExecuteLaunchWorkflow(config *LaunchConfig) (*LaunchResult, error) {
	cfg := DefaultTemporalConfig()

	// Workflow options
	workflowOptions := client.StartWorkflowOptions{
		ID:        fmt.Sprintf("launch-%s-%d", config.ProfileID, time.Now().Unix()),
		TaskQueue: cfg.TaskQueue,
		// Long-running execution support
		WorkflowExecutionTimeout: 30 * time.Minute,
		WorkflowTaskTimeout:      10 * time.Second,
	}

	tc.logger.Info("Starting workflow: %s", workflowOptions.ID)

	// Start workflow
	we, err := tc.client.ExecuteWorkflow(
		context.Background(),
		workflowOptions,
		LaunchWorkflow,
		config,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to start workflow: %w", err)
	}

	tc.logger.Info("Workflow started. WorkflowID: %s, RunID: %s", we.GetID(), we.GetRunID())

	// Wait for workflow completion
	var result LaunchResult
	err = we.Get(context.Background(), &result)
	if err != nil {
		return nil, fmt.Errorf("workflow execution failed: %w", err)
	}

	tc.logger.Info("Workflow completed successfully")

	return &result, nil
}

// Close closes the Temporal client
func (tc *TemporalClient) Close() {
	if tc.client != nil {
		tc.client.Close()
		tc.logger.Info("Temporal client closed")
	}
}

// temporalLogger adapter for Temporal SDK logging
type temporalLogger struct {
	logger *core.Logger
}

func newTemporalLogger(logger *core.Logger) *temporalLogger {
	return &temporalLogger{logger: logger}
}

func (tl *temporalLogger) Debug(msg string, keyvals ...interface{}) {
	tl.logger.Info("[TEMPORAL DEBUG] %s %v", msg, keyvals)
}

func (tl *temporalLogger) Info(msg string, keyvals ...interface{}) {
	tl.logger.Info("[TEMPORAL] %s %v", msg, keyvals)
}

func (tl *temporalLogger) Warn(msg string, keyvals ...interface{}) {
	tl.logger.Warning("[TEMPORAL] %s %v", msg, keyvals)
}

func (tl *temporalLogger) Error(msg string, keyvals ...interface{}) {
	tl.logger.Error("[TEMPORAL] %s %v", msg, keyvals)
}