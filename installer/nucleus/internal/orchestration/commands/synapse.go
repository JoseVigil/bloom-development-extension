// File: internal/orchestration/commands/synapse.go
// EXCEPTION: Multi-command file allowed due to tight Temporal coupling
// Following NUCLEUS master guide v2.0 - Section 6: Comandos Especiales: Synapse
package commands

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"nucleus/internal/core"
	"nucleus/internal/orchestration/temporal/workflows"
	temporalclient "nucleus/internal/orchestration/temporal"

	"github.com/spf13/cobra"
	"go.temporal.io/sdk/client"
)

// init auto-registers the synapse parent command
func init() {
	core.RegisterCommand("ORCHESTRATION", createSynapseCommand)
}

// createSynapseCommand creates the synapse parent command with all subcommands
func createSynapseCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "synapse",
		Short: "Temporal workflow orchestration via Sentinel",
		Long: `Execute complex operations through Temporal workflows.

Synapse commands orchestrate services via Temporal, with automatic
retry, state tracking, and JSON responses. All operations follow
the architecture: Nucleus → Synapse → Sentinel → Brain

Available subcommands:
  seed             Create new persistent profile
  launch           Launch Sentinel for a profile
  status           Query profile status
  shutdown         Shutdown profile workflow
  start-ollama     Start Ollama AI service via Temporal workflow
  vault-status     Query Vault lock status via Brain component  
  shutdown-all     Shutdown all orchestrated services gracefully`,
	}

	// Add all synapse subcommands
	cmd.AddCommand(createSeedSubcommand(c))
	cmd.AddCommand(createLaunchSubcommand(c))
	cmd.AddCommand(createStatusSubcommand(c))
	cmd.AddCommand(createShutdownSubcommand(c))
	cmd.AddCommand(createStartOllamaSubcommand(c))
	cmd.AddCommand(createVaultStatusSubcommand(c))
	cmd.AddCommand(createShutdownAllSubcommand(c))

	return cmd
}

// ============================================
// SEED SUBCOMMAND
// ============================================

func createSeedSubcommand(c *core.Core) *cobra.Command {
	var jsonOutput bool
	var isMaster bool

	cmd := &cobra.Command{
		Use:   "seed <alias> [is_master]",
		Short: "Create new persistent profile",
		Long: `Execute seed process to create a new profile.
Profile remains as long-running workflow waiting for commands.`,
		Args: cobra.RangeArgs(1, 2),

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
		},

		Example: `  nucleus synapse seed my-profile
  nucleus synapse seed my-profile --master
  nucleus --json synapse seed my-profile`,

		Run: func(cmd *cobra.Command, args []string) {
			alias := args[0]

			// Si hay segundo arg, usar como is_master
			if len(args) > 1 {
				isMaster = args[1] == "true"
			}

			// Inherit global --json flag from Core if local flag not set
			if c.IsJSON {
				jsonOutput = true
			}

			// Crear logger
			logger, err := core.InitLogger(&c.Paths, "SYNAPSE", jsonOutput)
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			if !jsonOutput {
				logger.Info("Creating profile: %s (master: %v)", alias, isMaster)
			}

			// Crear cliente Temporal
			ctx := context.Background()
			tc, err := temporalclient.NewClient(ctx, &c.Paths, jsonOutput)
			if err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{
						"success": false,
						"error":   fmt.Sprintf("failed to connect to Temporal: %v", err),
					})
				} else {
					logger.Error("Failed to connect to Temporal: %v", err)
				}
				os.Exit(1)
			}
			defer tc.Close()

			// Ejecutar seed workflow
			result, err := tc.ExecuteSeedWorkflow(ctx, logger, alias, isMaster)
			if err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{
						"success": false,
						"error":   err.Error(),
					})
				} else {
					logger.Error("Seed failed: %v", err)
				}
				os.Exit(1)
			}

			// Output
			if jsonOutput {
				outputJSON(result)
			} else {
				logger.Success("✅ Profile created successfully")
				logger.Info("Profile ID: %s", result.ProfileID)
				logger.Info("Alias: %s", result.Alias)
				logger.Info("Workflow ID: %s", result.WorkflowID)
				logger.Info("State: SEEDED (waiting for launch)")
			}
		},
	}

	cmd.Flags().BoolVar(&jsonOutput, "json", false, "Output in JSON format")
	cmd.Flags().BoolVar(&isMaster, "master", false, "Create as master profile")

	return cmd
}

// ============================================
// LAUNCH SUBCOMMAND
// ============================================

func createLaunchSubcommand(c *core.Core) *cobra.Command {
	var jsonOutput bool
	var mode string

	cmd := &cobra.Command{
		Use:   "launch <profile_id>",
		Short: "Launch Sentinel for a profile",
		Long: `Send launch signal to profile workflow.
Sentinel starts Chrome with loaded extension.`,
		Args: cobra.ExactArgs(1),

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
		},

		Example: `  nucleus synapse launch profile-123
  nucleus synapse launch profile-123 --mode discovery
  nucleus --json synapse launch profile-123`,

		Run: func(cmd *cobra.Command, args []string) {
			profileID := args[0]

			// Inherit global --json flag from Core if local flag not set
			if c.IsJSON {
				jsonOutput = true
			}

			// Crear logger
			logger, err := core.InitLogger(&c.Paths, "SYNAPSE", jsonOutput)
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			if !jsonOutput {
				logger.Info("Launching profile: %s (mode: %s)", profileID, mode)
			}

			// Crear cliente Temporal
			ctx := context.Background()
			tc, err := temporalclient.NewClient(ctx, &c.Paths, jsonOutput)
			if err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{
						"success": false,
						"error":   fmt.Sprintf("failed to connect to Temporal: %v", err),
					})
				} else {
					logger.Error("Failed to connect to Temporal: %v", err)
				}
				os.Exit(1)
			}
			defer tc.Close()

			// Ejecutar launch
			result, err := tc.ExecuteLaunchWorkflow(ctx, logger, profileID, mode)
			if err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{
						"success":    false,
						"profile_id": profileID,
						"error":      err.Error(),
						"timestamp":  time.Now().Unix(),
					})
				} else {
					logger.Error("Launch failed: %v", err)
				}
				os.Exit(1)
			}

			// Output
			if jsonOutput {
				outputJSON(result)
			} else {
				logger.Success("✅ Sentinel launched successfully")
				logger.Info("Profile ID: %s", result.ProfileID)
				logger.Info("Chrome PID: %d", result.ChromePID)
				logger.Info("Debug Port: %d", result.DebugPort)
				logger.Info("Extension Loaded: %v", result.ExtensionLoaded)
				logger.Info("State: %s", result.State)
			}
		},
	}

	cmd.Flags().BoolVar(&jsonOutput, "json", false, "Output in JSON format")
	cmd.Flags().StringVar(&mode, "mode", "landing", "Launch mode (landing, discovery)")

	return cmd
}

// ============================================
// STATUS SUBCOMMAND
// ============================================

func createStatusSubcommand(c *core.Core) *cobra.Command {
	var jsonOutput bool

	cmd := &cobra.Command{
		Use:   "status <profile_id>",
		Short: "Query profile status",
		Long:  "Execute query on workflow to get current ProfileStatus",
		Args:  cobra.ExactArgs(1),

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
		},

		Example: `  nucleus synapse status profile-123
  nucleus --json synapse status profile-123`,

		Run: func(cmd *cobra.Command, args []string) {
			profileID := args[0]

			// Inherit global --json flag from Core if local flag not set
			if c.IsJSON {
				jsonOutput = true
			}

			// Crear logger
			logger, err := core.InitLogger(&c.Paths, "SYNAPSE", jsonOutput)
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			// Crear cliente Temporal
			ctx := context.Background()
			tc, err := temporalclient.NewClient(ctx, &c.Paths, jsonOutput)
			if err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{
						"success": false,
						"error":   fmt.Sprintf("failed to connect to Temporal: %v", err),
					})
				} else {
					logger.Error("Failed to connect to Temporal: %v", err)
				}
				os.Exit(1)
			}
			defer tc.Close()

			// Obtener estado
			status, err := tc.GetProfileStatus(ctx, profileID)
			if err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{
						"success":    false,
						"profile_id": profileID,
						"error":      err.Error(),
					})
				} else {
					logger.Error("Failed to query status: %v", err)
				}
				os.Exit(1)
			}

			// Output
			if jsonOutput {
				outputJSON(map[string]interface{}{
					"success": true,
					"status":  status,
				})
			} else {
				logger.Info("╔═══════════════════════════════════╗")
				logger.Info("Profile ID: %s", status.ProfileID)
				logger.Info("State: %s", status.State)
				logger.Info("Sentinel Running: %v", status.SentinelRunning)
				logger.Info("Last Update: %s", status.LastUpdate.Format(time.RFC3339))
				if status.ErrorMessage != "" {
					logger.Warning("Error: %s", status.ErrorMessage)
				}
				logger.Info("╚═══════════════════════════════════╝")
			}
		},
	}

	cmd.Flags().BoolVar(&jsonOutput, "json", false, "Output in JSON format")

	return cmd
}

// ============================================
// SHUTDOWN SUBCOMMAND
// ============================================

func createShutdownSubcommand(c *core.Core) *cobra.Command {
	var jsonOutput bool

	cmd := &cobra.Command{
		Use:   "shutdown <profile_id>",
		Short: "Shutdown profile workflow",
		Long:  "Stop Sentinel and terminate profile workflow",
		Args:  cobra.ExactArgs(1),

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
		},

		Example: `  nucleus synapse shutdown profile-123
  nucleus --json synapse shutdown profile-123`,

		Run: func(cmd *cobra.Command, args []string) {
			profileID := args[0]

			// Inherit global --json flag from Core if local flag not set
			if c.IsJSON {
				jsonOutput = true
			}

			// Crear logger
			logger, err := core.InitLogger(&c.Paths, "SYNAPSE", jsonOutput)
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			if !jsonOutput {
				logger.Info("Shutting down profile: %s", profileID)
			}

			// Crear cliente Temporal
			ctx := context.Background()
			tc, err := temporalclient.NewClient(ctx, &c.Paths, jsonOutput)
			if err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{
						"success": false,
						"error":   fmt.Sprintf("failed to connect to Temporal: %v", err),
					})
				} else {
					logger.Error("Failed to connect to Temporal: %v", err)
				}
				os.Exit(1)
			}
			defer tc.Close()

			// Enviar shutdown
			if err := tc.ShutdownProfile(ctx, logger, profileID); err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{
						"success":    false,
						"profile_id": profileID,
						"error":      err.Error(),
					})
				} else {
					logger.Error("Shutdown failed: %v", err)
				}
				os.Exit(1)
			}

			// Output
			if jsonOutput {
				outputJSON(map[string]interface{}{
					"success":    true,
					"profile_id": profileID,
					"message":    "shutdown signal sent",
				})
			} else {
				logger.Success("✅ Shutdown signal sent successfully")
			}
		},
	}

	cmd.Flags().BoolVar(&jsonOutput, "json", false, "Output in JSON format")

	return cmd
}

// ============================================
// START-OLLAMA SUBCOMMAND
// ============================================

func createStartOllamaSubcommand(c *core.Core) *cobra.Command {
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

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
		},

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

			// JSON output
			if c.IsJSON {
				output, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(output))
				return
			}

			// Human output
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
// VAULT-STATUS SUBCOMMAND
// ============================================

func createVaultStatusSubcommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "vault-status",
		Short: "Query Vault lock status via Brain",
		Long: `Query the current state of the Vault via Brain component.

Returns:
- Vault state (LOCKED/UNLOCKED)
- Master profile activation status
- Overall health state`,

		Args: cobra.NoArgs,

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
		},

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

			// JSON output
			if c.IsJSON {
				output, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(output))
				return
			}

			// Human output
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
// SHUTDOWN-ALL SUBCOMMAND
// ============================================

func createShutdownAllSubcommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "shutdown-all",
		Short: "Shutdown all orchestrated services",
		Long: `Gracefully shutdown all services managed by Nucleus orchestration.

Services shutdown include:
- Ollama AI service
- Temporal workflows (if applicable)
- Other orchestrated components`,

		Args: cobra.NoArgs,

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
		},

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

			// JSON output
			if c.IsJSON {
				output, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(output))
				return
			}

			// Human output
			c.Logger.Printf("[SUCCESS] ✅ Shutdown completed")
			c.Logger.Printf("[INFO]    Services stopped: %v", result.ServicesShutdown)
		},
	}

	return cmd
}

// ============================================
// WORKFLOW EXECUTION HELPERS
// ============================================

func executeStartOllamaWorkflow(ctx context.Context, c *core.Core, simulation bool) (*workflows.StartOllamaResult, error) {
	tc, err := getTemporalClient(ctx)
	if err != nil {
		return nil, err
	}
	defer tc.Close()

	input := workflows.StartOllamaInput{
		SimulationMode: simulation,
	}

	workflowOptions := client.StartWorkflowOptions{
		ID:        fmt.Sprintf("start_ollama_%d", time.Now().Unix()),
		TaskQueue: "nucleus-task-queue",
	}

	we, err := tc.ExecuteWorkflow(ctx, workflowOptions, workflows.StartOllamaWorkflow, input)
	if err != nil {
		return nil, fmt.Errorf("failed to execute workflow: %w", err)
	}

	var result workflows.StartOllamaResult
	err = we.Get(ctx, &result)
	return &result, err
}

func executeVaultStatusWorkflow(ctx context.Context, c *core.Core) (*workflows.VaultStatusResult, error) {
	tc, err := getTemporalClient(ctx)
	if err != nil {
		return nil, err
	}
	defer tc.Close()

	workflowOptions := client.StartWorkflowOptions{
		ID:        fmt.Sprintf("vault_status_%d", time.Now().Unix()),
		TaskQueue: "nucleus-task-queue",
	}

	we, err := tc.ExecuteWorkflow(ctx, workflowOptions, workflows.VaultStatusWorkflow)
	if err != nil {
		return nil, fmt.Errorf("failed to execute workflow: %w", err)
	}

	var result workflows.VaultStatusResult
	err = we.Get(ctx, &result)
	return &result, err
}

func executeShutdownAllWorkflow(ctx context.Context, c *core.Core) (*workflows.ShutdownAllResult, error) {
	tc, err := getTemporalClient(ctx)
	if err != nil {
		return nil, err
	}
	defer tc.Close()

	workflowOptions := client.StartWorkflowOptions{
		ID:        fmt.Sprintf("shutdown_all_%d", time.Now().Unix()),
		TaskQueue: "nucleus-task-queue",
	}

	we, err := tc.ExecuteWorkflow(ctx, workflowOptions, workflows.ShutdownAllWorkflow)
	if err != nil {
		return nil, fmt.Errorf("failed to execute workflow: %w", err)
	}

	var result workflows.ShutdownAllResult
	err = we.Get(ctx, &result)
	return &result, err
}

func getTemporalClient(ctx context.Context) (client.Client, error) {
	return client.Dial(client.Options{
		HostPort: "localhost:7233",
	})
}

// outputJSON helper para imprimir JSON
func outputJSON(v interface{}) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, `{"success":false,"error":"failed to marshal JSON: %v"}`+"\n", err)
		return
	}
	fmt.Println(string(data))
}