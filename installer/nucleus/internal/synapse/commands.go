package synapse

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"nucleus/internal/core"
	temporalclient "nucleus/internal/orchestration/temporal"

	"github.com/spf13/cobra"
	"go.temporal.io/sdk/client"
)

// ============================================
// COMMAND REGISTRATION
// ============================================

func init() {
	core.RegisterCommand("ORCHESTRATION", NewSynapseCommand)
}

// NewSynapseCommand creates the root synapse command with subcommands
func NewSynapseCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "synapse",
		Short: "Temporal workflow orchestration and lifecycle management",
		Long:  "High-level orchestration layer over Sentinel using Temporal workflows",
	}

	// Add all subcommands
	cmd.AddCommand(newLaunchCommand(c))
	cmd.AddCommand(newStartOllamaCommand(c))
	cmd.AddCommand(newVaultStatusCommand(c))
	cmd.AddCommand(newShutdownAllCommand(c))

	return cmd
}

// ============================================
// SUBCOMMAND: launch
// ============================================

func newLaunchCommand(c *core.Core) *cobra.Command {
	var (
		account   string
		email     string
		alias     string
		extension string
		mode      string
		role      string
		service   string
		step      string
		heartbeat bool
		register  bool
		configFile string
		save      bool
	)

	cmd := &cobra.Command{
		Use:   "launch [profile_id]",
		Short: "Launch a browser instance for a profile using Sentinel",
		Long: `Launches a browser instance for a profile using Sentinel, while Nucleus handles 
orchestration, lifecycle, retries, and progress tracking via Temporal.

This command abstracts Sentinel complexity and exposes a clean interface.`,
		Args: cobra.MaximumNArgs(1),
		Example: `  nucleus synapse launch profile_001
  nucleus synapse launch profile_001 --email test@mail.com --service google
  nucleus synapse launch profile_001 --mode discovery --save
  nucleus --json synapse launch profile_001 --config launch.json

JSON Output:
  {
    "success": true,
    "profile_id": "profile_001",
    "launch_id": "launch_abc123",
    "chrome_pid": 9876,
    "debug_port": 9222,
    "extension_loaded": true,
    "state": "RUNNING",
    "timestamp": 1707418080
  }`,
		Run: func(cmd *cobra.Command, args []string) {
			profileID := ""
			if len(args) > 0 {
				profileID = args[0]
			}

			// ✅ Inicializar logger con modo JSON correcto
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION", c.IsJSON)
			if err != nil {
				emitError(c, nil, "nucleus", "synapse launch", fmt.Sprintf("Failed to initialize logger: %v", err))
				os.Exit(1)
			}
			defer logger.Close()

			logger.Info("Starting synapse launch for profile: %s", profileID)

			// Build launch config
			config := LaunchConfig{
				ProfileID:  profileID,
				Account:    account,
				Email:      email,
				Alias:      alias,
				Extension:  extension,
				Mode:       mode,
				Role:       role,
				Service:    service,
				Step:       step,
				Heartbeat:  heartbeat,
				Register:   register,
				ConfigFile: configFile,
				Save:       save,
			}

			// Validate config
			if err := validateLaunchConfig(&config); err != nil {
				logger.Error("Invalid configuration: %v", err)
				emitError(c, logger, "nucleus", "synapse launch", err.Error())
				os.Exit(1)
			}

			// Execute launch via Temporal workflow
			result, err := executeLaunch(c, logger, &config)
			if err != nil {
				logger.Error("Launch failed: %v", err)
				emitError(c, logger, "sentinel", "synapse launch", err.Error())
				os.Exit(1)
			}

			// ✅ Emit success usando logger.OutputResult
			logger.Success("Launch completed successfully")
			logger.OutputResult(
				result, // JSON data
				fmt.Sprintf("🚀 Launch complete for profile: %s", profileID), // Interactive message
			)
		},
	}

	// Simplified flags (NO --override-* exposed to user)
	cmd.Flags().StringVar(&account, "account", "", "Account identifier")
	cmd.Flags().StringVar(&email, "email", "", "Email address")
	cmd.Flags().StringVar(&alias, "alias", "", "Profile alias")
	cmd.Flags().StringVar(&extension, "extension", "", "Extension to load")
	cmd.Flags().StringVar(&mode, "mode", "landing", "Launch mode (landing, discovery, etc.)")
	cmd.Flags().StringVar(&role, "role", "", "User role")
	cmd.Flags().StringVar(&service, "service", "", "Service identifier")
	cmd.Flags().StringVar(&step, "step", "", "Execution step")
	cmd.Flags().BoolVar(&heartbeat, "heartbeat", false, "Enable heartbeat tracking")
	cmd.Flags().BoolVar(&register, "register", false, "Register new profile")
	cmd.Flags().StringVar(&configFile, "config", "", "JSON config file path or '-' for stdin")
	cmd.Flags().BoolVar(&save, "save", false, "Save configuration for future use")

	return cmd
}

// ============================================
// SUBCOMMAND: start-ollama
// ============================================

func newStartOllamaCommand(c *core.Core) *cobra.Command {
	var simulation bool

	cmd := &cobra.Command{
		Use:   "start-ollama",
		Short: "Start Ollama service via Temporal workflow",
		Long: `Start the Ollama AI service through Sentinel orchestration.

This command executes a Temporal workflow that:
1. Validates system prerequisites
2. Starts Ollama service via Sentinel
3. Verifies port availability (11434)
4. Returns process ID and status`,
		Args: cobra.NoArgs,
		Example: `  nucleus synapse start-ollama
  nucleus --json synapse start-ollama --simulation

JSON Output:
  {
    "success": true,
    "pid": 12345,
    "port": 11434,
    "state": "RUNNING"
  }`,
		Run: func(cmd *cobra.Command, args []string) {
			// ✅ 1. Inicializar logger con modo JSON correcto
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION", c.IsJSON)
			if err != nil {
				emitError(c, nil, "nucleus", "synapse start-ollama", fmt.Sprintf("Failed to initialize logger: %v", err))
				os.Exit(1)
			}
			defer logger.Close()

			logger.Info("Starting Ollama service via Temporal workflow")

			// ✅ 2. Ejecutar workflow
			ctx := context.Background()
			result, err := executeStartOllamaWorkflow(ctx, c, logger, simulation)
			if err != nil {
				logger.Error("Start Ollama failed: %v", err)
				
				// ✅ Error output según modo
				if err := logger.OutputResult(
					map[string]interface{}{
						"success": false,
						"error":   err.Error(),
						"state":   "FAILED",
					},
					fmt.Sprintf("❌ Start Ollama failed: %v", err),
				); err != nil {
					fmt.Fprintf(os.Stderr, "Failed to output result: %v\n", err)
				}
				os.Exit(1)
			}

			// ✅ 3. Success output según modo
			logger.Success("Ollama started successfully - PID: %d, Port: %d, State: %s", 
				result.PID, result.Port, result.State)
			
			if err := logger.OutputResult(
				result, // JSON data
				fmt.Sprintf("✅ Ollama started successfully\n   PID: %d\n   Port: %d\n   State: %s", 
					result.PID, result.Port, result.State), // Interactive message
			); err != nil {
				fmt.Fprintf(os.Stderr, "Failed to output result: %v\n", err)
			}
		},
	}

	cmd.Flags().BoolVar(&simulation, "simulation", false, "Run in simulation mode")
	return cmd
}

// ============================================
// SUBCOMMAND: vault-status
// ============================================

func newVaultStatusCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "vault-status",
		Short: "Query Vault lock status via Brain",
		Long: `Query the current state of the Vault via Brain component.

Returns:
- Vault state (LOCKED/UNLOCKED)
- Master profile activation status
- Overall health state`,
		Args: cobra.NoArgs,
		Example: `  nucleus synapse vault-status
  nucleus --json synapse vault-status

JSON Output:
  {
    "success": true,
    "vault_state": "UNLOCKED",
    "master_profile_active": true,
    "state": "HEALTHY"
  }`,
		Run: func(cmd *cobra.Command, args []string) {
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION", c.IsJSON)
			if err != nil {
				emitError(c, nil, "nucleus", "synapse vault-status", fmt.Sprintf("Failed to initialize logger: %v", err))
				os.Exit(1)
			}
			defer logger.Close()

			logger.Info("Querying Vault status via Brain workflow")

			ctx := context.Background()
			result, err := executeVaultStatusWorkflow(ctx, c, logger)
			if err != nil {
				logger.Error("Vault status query failed: %v", err)
				
				if err := logger.OutputResult(
					map[string]interface{}{
						"success": false,
						"error":   err.Error(),
						"state":   "FAILED",
					},
					fmt.Sprintf("❌ Vault status query failed: %v", err),
				); err != nil {
					fmt.Fprintf(os.Stderr, "Failed to output result: %v\n", err)
				}
				os.Exit(1)
			}

			logger.Success("Vault status retrieved - State: %s, Master Profile: %v", 
				result.VaultState, result.MasterProfileActive)
			
			if err := logger.OutputResult(
				result,
				fmt.Sprintf("✅ Vault Status\n   State: %s\n   Master Profile Active: %v\n   Overall State: %s", 
					result.VaultState, result.MasterProfileActive, result.State),
			); err != nil {
				fmt.Fprintf(os.Stderr, "Failed to output result: %v\n", err)
			}
		},
	}

	return cmd
}

// ============================================
// SUBCOMMAND: shutdown-all
// ============================================

func newShutdownAllCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "shutdown-all",
		Short: "Gracefully shutdown all running services",
		Long: `Executes a coordinated shutdown of all Nucleus-managed services.

This includes:
- All running Chrome instances
- Ollama service
- Brain component
- Temporal workers`,
		Args: cobra.NoArgs,
		Example: `  nucleus synapse shutdown-all
  nucleus --json synapse shutdown-all

JSON Output:
  {
    "success": true,
    "services_shutdown": ["chrome", "ollama", "brain", "temporal"]
  }`,
		Run: func(cmd *cobra.Command, args []string) {
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION", c.IsJSON)
			if err != nil {
				emitError(c, nil, "nucleus", "synapse shutdown-all", fmt.Sprintf("Failed to initialize logger: %v", err))
				os.Exit(1)
			}
			defer logger.Close()

			logger.Info("Initiating graceful shutdown of all services")

			ctx := context.Background()
			result, err := executeShutdownAllWorkflow(ctx, c, logger)
			if err != nil {
				logger.Error("Shutdown failed: %v", err)
				
				if err := logger.OutputResult(
					map[string]interface{}{
						"success": false,
						"error":   err.Error(),
					},
					fmt.Sprintf("❌ Shutdown failed: %v", err),
				); err != nil {
					fmt.Fprintf(os.Stderr, "Failed to output result: %v\n", err)
				}
				os.Exit(1)
			}

			logger.Success("All services shutdown successfully")
			
			if err := logger.OutputResult(
				result,
				fmt.Sprintf("✅ Shutdown Complete\n   Services: %v", result.ServicesShutdown),
			); err != nil {
				fmt.Fprintf(os.Stderr, "Failed to output result: %v\n", err)
			}
		},
	}

	return cmd
}

// ============================================
// DATA STRUCTURES
// ============================================

// LaunchConfig holds all launch parameters
type LaunchConfig struct {
	ProfileID  string
	Account    string
	Email      string
	Alias      string
	Extension  string
	Mode       string
	Role       string
	Service    string
	Step       string
	Heartbeat  bool
	Register   bool
	ConfigFile string
	Save       bool
}

// LaunchResult represents the final result of a launch operation
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

// CommandError represents a structured error
type CommandError struct {
	Type      string `json:"type"`
	Source    string `json:"source"`
	Command   string `json:"command"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
}

// StartOllamaResult representa el resultado del workflow de Ollama
type StartOllamaResult struct {
	Success bool   `json:"success"`
	PID     int    `json:"pid"`
	Port    int    `json:"port"`
	State   string `json:"state"`
}

// VaultStatusResult representa el resultado del workflow de Vault
type VaultStatusResult struct {
	Success             bool   `json:"success"`
	VaultState          string `json:"vault_state"`
	MasterProfileActive bool   `json:"master_profile_active"`
	State               string `json:"state"`
}

// ShutdownAllResult representa el resultado del workflow de shutdown
type ShutdownAllResult struct {
	Success          bool     `json:"success"`
	ServicesShutdown []string `json:"services_shutdown"`
}

// ============================================
// VALIDATION
// ============================================

func validateLaunchConfig(config *LaunchConfig) error {
	// Basic validation rules
	if config.ProfileID == "" && config.ConfigFile == "" {
		return fmt.Errorf("profile_id is required when --config is not provided")
	}

	// Validate mode
	validModes := map[string]bool{
		"landing":   true,
		"discovery": true,
		"headless":  true,
	}
	if config.Mode != "" && !validModes[config.Mode] {
		return fmt.Errorf("invalid mode: %s (valid: landing, discovery, headless)", config.Mode)
	}

	return nil
}

// ============================================
// EXECUTION LOGIC
// ============================================

func executeLaunch(c *core.Core, logger *core.Logger, config *LaunchConfig) (*LaunchResult, error) {
	logger.Info("Initializing Temporal client")

	// ✅ Initialize Temporal client con PathConfig y modo JSON
	ctx := context.Background()
	tc, err := temporalclient.NewClient(ctx, &c.Paths, c.IsJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize Temporal client: %w", err)
	}
	defer tc.Close()

	logger.Info("Starting launch workflow")

	// Execute workflow usando ExecuteLaunchWorkflow de orchestration/temporal
	result, err := tc.ExecuteLaunchWorkflow(ctx, logger, config.ProfileID, config.Mode)
	if err != nil {
		return nil, fmt.Errorf("workflow execution failed: %w", err)
	}

	// Convertir temporal.LaunchResult a synapse.LaunchResult
	return &LaunchResult{
		Success:         result.Success,
		ProfileID:       result.ProfileID,
		LaunchID:        result.LaunchID,
		ChromePID:       result.ChromePID,
		DebugPort:       result.DebugPort,
		ExtensionLoaded: result.ExtensionLoaded,
		EffectiveConfig: result.EffectiveConfig,
		State:           result.State,
		Error:           result.Error,
		Timestamp:       result.Timestamp,
	}, nil
}

// ============================================
// WORKFLOW EXECUTION HELPERS
// ============================================

func executeStartOllamaWorkflow(ctx context.Context, c *core.Core, logger *core.Logger, simulation bool) (*StartOllamaResult, error) {
	// ✅ Usar temporalclient.NewClient con PathConfig
	temporalClient, err := temporalclient.NewClient(ctx, &c.Paths, c.IsJSON)
	if err != nil {
		return nil, err
	}
	defer temporalClient.Close()
	
	tc := temporalClient.GetClient()

	logger.Info("Executing StartOllamaWorkflow (simulation: %v)", simulation)

	input := map[string]interface{}{
		"simulation_mode": simulation,
	}

	workflowOptions := client.StartWorkflowOptions{
		ID:        fmt.Sprintf("start_ollama_%d", time.Now().Unix()),
		TaskQueue: "nucleus-task-queue",
	}

	// ────────────────────────────────────────────────
	//     IMPORTANTE: Agregamos timeout al contexto
	// ────────────────────────────────────────────────
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	we, err := tc.ExecuteWorkflow(ctx, workflowOptions, "StartOllamaWorkflow", input)
	if err != nil {
		return nil, fmt.Errorf("failed to execute workflow: %w", err)
	}

	var result StartOllamaResult

	// Usamos el mismo ctx con timeout también en Get
	err = we.Get(ctx, &result)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, fmt.Errorf("workflow timeout después de 10s – probablemente no hay workers corriendo. Ejecutá: nucleus worker start")
		}
		
		// Si el error contiene "no poller" o "no worker", también indicarlo
		errStr := err.Error()
		if strings.Contains(errStr, "no worker") || strings.Contains(errStr, "no poller") {
			return nil, fmt.Errorf("no hay workers disponibles. Ejecutá: nucleus worker start")
		}
		
		return nil, fmt.Errorf("failed to get workflow result: %w", err)
	}

	return &result, nil
}

func executeVaultStatusWorkflow(ctx context.Context, c *core.Core, logger *core.Logger) (*VaultStatusResult, error) {
	// ✅ Usar temporalclient.NewClient con PathConfig
	temporalClient, err := temporalclient.NewClient(ctx, &c.Paths, c.IsJSON)
	if err != nil {
		return nil, err
	}
	defer temporalClient.Close()
	
	tc := temporalClient.GetClient()

	logger.Info("Executing VaultStatusWorkflow")

	workflowOptions := client.StartWorkflowOptions{
		ID:        fmt.Sprintf("vault_status_%d", time.Now().Unix()),
		TaskQueue: "nucleus-task-queue",
	}

	we, err := tc.ExecuteWorkflow(ctx, workflowOptions, "VaultStatusWorkflow")
	if err != nil {
		return nil, fmt.Errorf("failed to execute workflow: %w", err)
	}

	var result VaultStatusResult
	err = we.Get(ctx, &result)
	if err != nil {
		return nil, fmt.Errorf("failed to get workflow result: %w", err)
	}
	
	return &result, nil
}

func executeShutdownAllWorkflow(ctx context.Context, c *core.Core, logger *core.Logger) (*ShutdownAllResult, error) {
	// ✅ Usar temporalclient.NewClient con PathConfig
	temporalClient, err := temporalclient.NewClient(ctx, &c.Paths, c.IsJSON)
	if err != nil {
		return nil, err
	}
	defer temporalClient.Close()
	
	tc := temporalClient.GetClient()

	logger.Info("Executing ShutdownAllWorkflow")

	workflowOptions := client.StartWorkflowOptions{
		ID:        fmt.Sprintf("shutdown_all_%d", time.Now().Unix()),
		TaskQueue: "nucleus-task-queue",
	}

	we, err := tc.ExecuteWorkflow(ctx, workflowOptions, "ShutdownAllWorkflow")
	if err != nil {
		return nil, fmt.Errorf("failed to execute workflow: %w", err)
	}

	var result ShutdownAllResult
	err = we.Get(ctx, &result)
	if err != nil {
		return nil, fmt.Errorf("failed to get workflow result: %w", err)
	}
	
	return &result, nil
}

// ============================================
// ERROR HANDLING
// ============================================

func emitError(c *core.Core, logger *core.Logger, source, command, message string) {
	errObj := CommandError{
		Type:      "COMMAND_ERROR",
		Source:    source,
		Command:   command,
		Message:   message,
		Timestamp: time.Now().Unix(),
	}

	// ✅ Usar logger si está disponible
	if logger != nil {
		logger.OutputResult(
			errObj,
			fmt.Sprintf("❌ Error [%s]: %s", source, message),
		)
	} else {
		// Fallback si logger no está disponible
		if c.IsJSON {
			output, _ := json.Marshal(errObj)
			fmt.Println(string(output))
		} else {
			fmt.Fprintf(os.Stderr, "❌ Error [%s]: %s\n", source, message)
		}
	}
}