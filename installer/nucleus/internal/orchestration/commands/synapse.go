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
  start-ollama     Start Ollama AI service via Temporal workflow
  vault-status     Query Vault lock status via Brain component  
  shutdown-all     Shutdown all orchestrated services gracefully`,
	}

	// Add all synapse subcommands
	cmd.AddCommand(createStartOllamaSubcommand(c))
	cmd.AddCommand(createVaultStatusSubcommand(c))
	cmd.AddCommand(createShutdownAllSubcommand(c))

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