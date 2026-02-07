// File: internal/supervisor/dev_start.go
// Auto-contained command following NUCLEUS master guide v2.0
package supervisor

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"nucleus/internal/core"
	"nucleus/internal/governance"

	"github.com/spf13/cobra"
)

// init auto-registers this command when package is imported
func init() {
	core.RegisterCommand("ORCHESTRATION", createDevStartCommand)
}

// createDevStartCommand is the factory function that creates the dev-start command
func createDevStartCommand(c *core.Core) *cobra.Command {
	var simulation bool
	var skipVault bool
	var outputJSON bool

	cmd := &cobra.Command{
		Use:   "dev-start",
		Short: "Start Nucleus development environment with full boot sequence",
		Long: `Execute the complete Nucleus boot sequence for development:

1. Temporal Core verification
2. Worker initialization check  
3. Heavy infrastructure (Ollama) startup
4. Governance validation
5. Vault unlock verification
6. Control Plane initialization (Node.js bootstrap)

This command orchestrates all services required for a complete
Nucleus development environment with proper health checks and
deterministic startup order.`,

		Args: cobra.NoArgs,

		Example: `  nucleus dev-start
  nucleus dev-start --simulation
  nucleus dev-start --skip-vault`,

		Run: func(cmd *cobra.Command, args []string) {
			// Verify authorization (dev-start requires Master role)
			if err := governance.RequireMaster(c); err != nil {
				c.Logger.Printf("[ERROR] ⛔ dev-start requires Master role: %v", err)
				return
			}

			// Create supervisor instance
			logsDir := getLogsDir(c)
			binDir := getBinDir(c)
			supervisor := NewSupervisor(logsDir, binDir)

			// Execute boot sequence
			ctx := context.Background()
			result, err := executeBootSequence(ctx, supervisor, simulation, skipVault)
			if err != nil {
				c.Logger.Printf("[ERROR] ❌ Boot sequence failed: %v", err)
				
				// JSON output on failure
				if outputJSON {
					outputJSONResult(map[string]interface{}{
						"success": false,
						"error":   err.Error(),
						"stage":   result.FailedStage,
					})
				}
				return
			}

			// JSON output on success
			if outputJSON {
				outputJSONResult(result)
				return
			}

			// Human-readable output
			c.Logger.Printf("[SUCCESS] ✅ Nucleus development environment ready")
			c.Logger.Printf("[INFO]    Boot time: %.2fs", result.BootTime)
			c.Logger.Printf("[INFO]    Temporal: Running (port 7233)")
			c.Logger.Printf("[INFO]    Worker: Connected")
			c.Logger.Printf("[INFO]    Ollama: PID %d (port %d)", result.OllamaPID, result.OllamaPort)
			c.Logger.Printf("[INFO]    Vault: %s", result.VaultState)
			c.Logger.Printf("[INFO]    Control Plane: PID %d", result.ControlPlanePID)
			c.Logger.Printf("[INFO]    WebSocket: ws://localhost:4124")
			c.Logger.Printf("[INFO]    API: http://localhost:48215")
		},
	}

	// Define flags
	cmd.Flags().BoolVar(&simulation, "simulation", false, "Run in simulation mode (use test ownership.json)")
	cmd.Flags().BoolVar(&skipVault, "skip-vault", false, "Skip vault verification (development only)")
	cmd.Flags().BoolVar(&outputJSON, "json", false, "Output result as JSON")

	return cmd
}

// BootSequenceResult represents the result of the boot sequence
type BootSequenceResult struct {
	Success         bool    `json:"success"`
	BootTime        float64 `json:"boot_time_seconds"`
	FailedStage     string  `json:"failed_stage,omitempty"`
	OllamaPID       int     `json:"ollama_pid,omitempty"`
	OllamaPort      int     `json:"ollama_port,omitempty"`
	VaultState      string  `json:"vault_state"`
	ControlPlanePID int     `json:"control_plane_pid,omitempty"`
	Timestamp       int64   `json:"timestamp"`
}

// executeBootSequence runs the complete boot sequence
func executeBootSequence(ctx context.Context, s *Supervisor, simulation, skipVault bool) (*BootSequenceResult, error) {
	startTime := time.Now()
	
	result := &BootSequenceResult{
		Success:   true,
		Timestamp: time.Now().Unix(),
	}

	// Phase 1: Verify Temporal Core
	if err := s.verifyTemporalServer(ctx); err != nil {
		result.Success = false
		result.FailedStage = "temporal_core"
		return result, fmt.Errorf("temporal core verification failed: %w", err)
	}

	// Phase 2: Verify Worker
	if err := s.verifyWorkerRunning(ctx); err != nil {
		result.Success = false
		result.FailedStage = "worker_init"
		return result, fmt.Errorf("worker verification failed: %w", err)
	}

	// Phase 3: Start Ollama
	ollamaResult, err := s.StartOllama(ctx)
	if err != nil {
		result.Success = false
		result.FailedStage = "heavy_infra"
		return result, fmt.Errorf("ollama start failed: %w", err)
	}
	result.OllamaPID = ollamaResult.PID
	result.OllamaPort = ollamaResult.Port

	// Phase 4: Governance validation
	if err := s.bootGovernance(ctx, simulation); err != nil {
		result.Success = false
		result.FailedStage = "governance"
		return result, fmt.Errorf("governance validation failed: %w", err)
	}

	// Phase 5: Vault check (optional)
	if !skipVault {
		vaultResult, err := s.CheckVaultStatus(ctx)
		if err != nil {
			result.Success = false
			result.FailedStage = "vault_check"
			return result, fmt.Errorf("vault check failed: %w", err)
		}
		result.VaultState = vaultResult.VaultState
	} else {
		result.VaultState = "SKIPPED"
	}

	// Phase 6: Control Plane
	proc, err := s.bootControlPlane(ctx, simulation)
	if err != nil {
		result.Success = false
		result.FailedStage = "control_plane"
		return result, fmt.Errorf("control plane start failed: %w", err)
	}
	result.ControlPlanePID = proc.PID

	// Calculate boot time
	result.BootTime = time.Since(startTime).Seconds()

	return result, nil
}

// Helper functions

func getLogsDir(c *core.Core) string {
	if dir := os.Getenv("BLOOM_LOGS_DIR"); dir != "" {
		return dir
	}
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = os.Getenv("HOME")
	}
	return filepath.Join(localAppData, "BloomNucleus", "logs")
}

func getBinDir(c *core.Core) string {
	if dir := os.Getenv("BLOOM_BIN_DIR"); dir != "" {
		return dir
	}
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = os.Getenv("HOME")
	}
	return filepath.Join(localAppData, "BloomNucleus", "bin")
}

func outputJSONResult(v interface{}) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(v)
}