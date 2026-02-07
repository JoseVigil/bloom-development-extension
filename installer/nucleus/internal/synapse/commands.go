package synapse

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
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
  nucleus --json synapse launch profile_001 --config launch.json`,
		Run: func(cmd *cobra.Command, args []string) {
			profileID := ""
			if len(args) > 0 {
				profileID = args[0]
			}

			// Initialize logger for orchestration
			logger, err := core.InitLogger(&c.Paths, "orchestration")
			if err != nil {
				emitError(c, "nucleus", "synapse launch", fmt.Sprintf("Failed to initialize logger: %v", err))
				os.Exit(1)
			}
			defer logger.Close()

			if c.IsJSON {
				logger.SetJSONMode(true)
			}

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
				emitError(c, "nucleus", "synapse launch", err.Error())
				os.Exit(1)
			}

			// Execute launch via Temporal workflow
			result, err := executeLaunch(c, logger, &config)
			if err != nil {
				logger.Error("Launch failed: %v", err)
				emitError(c, "sentinel", "synapse launch", err.Error())
				os.Exit(1)
			}

			// Emit success
			logger.Success("Launch completed successfully")
			if c.IsJSON {
				output, _ := json.Marshal(result)
				fmt.Println(string(output))
			} else {
				fmt.Printf("🚀 Launch complete for profile: %s\n", profileID)
			}
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
		Example: `  nucleus --json synapse start-ollama
  nucleus synapse start-ollama --simulation`,
		Run: func(cmd *cobra.Command, args []string) {
			ctx := context.Background()
			result, err := executeStartOllamaWorkflow(ctx, c, simulation)
			if err != nil {
				if c.IsJSON {
					output, _ := json.Marshal(map[string]interface{}{
						"success": false,
						"error":   err.Error(),
						"state":   "FAILED",
					})
					fmt.Println(string(output))
				} else {
					c.Logger.Printf("[ERROR] ❌ Start Ollama failed: %v", err)
				}
				os.Exit(1)
			}

			if c.IsJSON {
				output, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(output))
				return
			}

			c.Logger.Printf("[SUCCESS] ✅ Ollama started successfully")
			c.Logger.Printf("[INFO]    PID: %d", result.PID)
			c.Logger.Printf("[INFO]    Port: %d", result.Port)
			c.Logger.Printf("[INFO]    State: %s", result.State)
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
		Example: `  nucleus --json synapse vault-status
  nucleus synapse vault-status`,
		Run: func(cmd *cobra.Command, args []string) {
			ctx := context.Background()
			result, err := executeVaultStatusWorkflow(ctx, c)
			if err != nil {
				if c.IsJSON {
					output, _ := json.Marshal(map[string]interface{}{
						"success": false,
						"error":   err.Error(),
						"state":   "FAILED",
					})
					fmt.Println(string(output))
				} else {
					c.Logger.Printf("[ERROR] ❌ Vault status query failed: %v", err)
				}
				os.Exit(1)
			}

			if c.IsJSON {
				output, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(output))
				return
			}

			c.Logger.Printf("[INFO] Vault Status:")
			c.Logger.Printf("[INFO]    State: %s", result.VaultState)
			c.Logger.Printf("[INFO]    Master Profile Active: %v", result.MasterProfileActive)
			c.Logger.Printf("[INFO]    Overall State: %s", result.State)

			if result.VaultState == "LOCKED" {
				c.Logger.Printf("[WARNING] ⚠️  Vault is locked - some operations may be restricted")
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
		Short: "Shutdown all orchestrated services",
		Long: `Gracefully shutdown all services managed by Nucleus orchestration.

Services shutdown include:
- Ollama AI service
- Temporal workflows (if applicable)
- Other orchestrated components`,
		Args: cobra.NoArgs,
		Example: `  nucleus --json synapse shutdown-all
  nucleus synapse shutdown-all`,
		Run: func(cmd *cobra.Command, args []string) {
			ctx := context.Background()
			result, err := executeShutdownAllWorkflow(ctx, c)
			if err != nil {
				if c.IsJSON {
					output, _ := json.Marshal(map[string]interface{}{
						"success": false,
						"error":   err.Error(),
					})
					fmt.Println(string(output))
				} else {
					c.Logger.Printf("[ERROR] ❌ Shutdown failed: %v", err)
				}
				os.Exit(1)
			}

			if c.IsJSON {
				output, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(output))
				return
			}

			c.Logger.Printf("[SUCCESS] ✅ Shutdown completed")
			c.Logger.Printf("[INFO]    Services stopped: %v", result.ServicesShutdown)
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

	// Initialize Temporal client (orchestration/temporal)
	ctx := context.Background()
	tc, err := temporalclient.NewClient(ctx)
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

func getTemporalClient(ctx context.Context) (client.Client, error) {
	return client.Dial(client.Options{
		HostPort: "localhost:7233",
	})
}

func executeStartOllamaWorkflow(ctx context.Context, c *core.Core, simulation bool) (*StartOllamaResult, error) {
	tc, err := getTemporalClient(ctx)
	if err != nil {
		return nil, err
	}
	defer tc.Close()

	// Por ahora, implementación simulada - deberás conectar con tus workflows reales
	// cuando los tengas implementados
	input := map[string]interface{}{
		"simulation_mode": simulation,
	}

	workflowOptions := client.StartWorkflowOptions{
		ID:        fmt.Sprintf("start_ollama_%d", time.Now().Unix()),
		TaskQueue: "nucleus-task-queue",
	}

	we, err := tc.ExecuteWorkflow(ctx, workflowOptions, "StartOllamaWorkflow", input)
	if err != nil {
		return nil, fmt.Errorf("failed to execute workflow: %w", err)
	}

	var result StartOllamaResult
	err = we.Get(ctx, &result)
	return &result, err
}

func executeVaultStatusWorkflow(ctx context.Context, c *core.Core) (*VaultStatusResult, error) {
	tc, err := getTemporalClient(ctx)
	if err != nil {
		return nil, err
	}
	defer tc.Close()

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
	return &result, err
}

func executeShutdownAllWorkflow(ctx context.Context, c *core.Core) (*ShutdownAllResult, error) {
	tc, err := getTemporalClient(ctx)
	if err != nil {
		return nil, err
	}
	defer tc.Close()

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
	return &result, err
}

// ============================================
// ERROR HANDLING
// ============================================

func emitError(c *core.Core, source, command, message string) {
	errObj := CommandError{
		Type:      "COMMAND_ERROR",
		Source:    source,
		Command:   command,
		Message:   message,
		Timestamp: time.Now().Unix(),
	}

	if c.IsJSON {
		output, _ := json.Marshal(errObj)
		fmt.Println(string(output))
	} else {
		fmt.Fprintf(os.Stderr, "❌ Error [%s]: %s\n", source, message)
	}
}