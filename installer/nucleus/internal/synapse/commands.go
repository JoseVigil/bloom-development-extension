package synapse

import (
	"encoding/json"
	"fmt"
	"os"
	"time"

	"nucleus/internal/core"

	"github.com/spf13/cobra"
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

	// Add subcommands
	cmd.AddCommand(newLaunchCommand(c))
	// Future subcommands:
	// cmd.AddCommand(newSubmitCommand(c))
	// cmd.AddCommand(newStopCommand(c))
	// cmd.AddCommand(newStatusCommand(c))

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
	Type      string `json:"type"`
	ProfileID string `json:"profile_id"`
	Status    string `json:"status"`
	Timestamp int64  `json:"timestamp"`
}

// CommandError represents a structured error
type CommandError struct {
	Type      string `json:"type"`
	Source    string `json:"source"`
	Command   string `json:"command"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
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

	// Initialize Temporal client
	tc, err := NewTemporalClient(c, logger)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize Temporal client: %w", err)
	}
	defer tc.Close()

	logger.Info("Starting launch workflow")

	// Execute workflow
	result, err := tc.ExecuteLaunchWorkflow(config)
	if err != nil {
		return nil, fmt.Errorf("workflow execution failed: %w", err)
	}

	return result, nil
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