// File: internal/orchestration/commands/synapse.go
// EXCEPTION: Multi-command file — allowed per NUCLEUS guide v2.0 §6 (strong Temporal coupling)
// Categoría: ORCHESTRATION
// Sigue Guía Maestra de Implementación Comandos NUCLEUS v2.0
package commands

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"time"

	"nucleus/internal/core"
	temporalclient "nucleus/internal/orchestration/temporal"
	"nucleus/internal/orchestration/temporal/workflows"

	"github.com/spf13/cobra"
	"go.temporal.io/sdk/client"
)

func init() {
	// Solo el padre se registra — guía §6 / §9 reglas subcomandos
	core.RegisterCommand("ORCHESTRATION", createSynapseCommand)
}

// ── Parent command ────────────────────────────────────────────────────────────

func createSynapseCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "synapse",
		Short: "Temporal workflow orchestration via Sentinel",
		Long: `Execute complex operations through Temporal workflows.

All synapse commands follow the architecture:
  Nucleus → Temporal → Worker → Sentinel → Brain → Chrome

Available subcommands:
  seed          Create new persistent profile workflow
  launch        Launch Sentinel for a profile (with pre-flight check)
  status        Query current profile status
  shutdown      Shutdown a profile workflow
  start-ollama  Start Ollama AI service via Temporal workflow
  vault-status  Query Vault lock state via Brain
  shutdown-all  Shutdown all orchestrated services gracefully
  onboarding    Send onboarding navigation signal to a running profile`,

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
		},
	}

	cmd.AddCommand(createSeedSubcommand(c))
	cmd.AddCommand(createLaunchSubcommand(c))
	cmd.AddCommand(createStatusSubcommand(c))
	cmd.AddCommand(createShutdownSubcommand(c))
	cmd.AddCommand(createStartOllamaSubcommand(c))
	cmd.AddCommand(createVaultStatusSubcommand(c))
	cmd.AddCommand(createShutdownAllSubcommand(c))
	cmd.AddCommand(createOnboardingSubcommand(c))

	return cmd
}

// ── PRE-FLIGHT CHECK ──────────────────────────────────────────────────────────

// PreflightResult agrupa el resultado del pre-flight check
type PreflightResult struct {
	BrainOK bool
	Error   string
}

// runPreflightCheck verifica Brain TCP server antes de enviar cualquier señal
// a Temporal. Peor caso: ~10s (timeout NSSM). Si Brain está up, tarda <500ms.
func runPreflightCheck() *PreflightResult {
	result := &PreflightResult{}

	// ── Brain TCP server (port 5678) ──────────────────────────────────────
	if checkBrainTCP() {
		result.BrainOK = true
	} else {
		if err := nssmStartService("BloomBrain", 10*time.Second); err != nil {
			result.Error = fmt.Sprintf(
				"Brain service no está corriendo. Corré: nucleus health --fix\n(NSSM: %v)", err)
			return result
		}
		if !checkBrainTCP() {
			result.Error = "Brain service no está corriendo. Corré: nucleus health --fix"
			return result
		}
		result.BrainOK = true
	}

	return result
}

func checkBrainTCP() bool {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 500*time.Millisecond)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

func nssmStartService(name string, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, "nssm", "start", name).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v — %s", err, string(out))
	}
	return nil
}

// ── SEED ──────────────────────────────────────────────────────────────────────

func createSeedSubcommand(c *core.Core) *cobra.Command {
	var jsonOutput bool
	var isMaster bool

	cmd := &cobra.Command{
		Use:   "seed <alias>",
		Short: "Create new persistent profile workflow",
		Long: `Execute the seed process to create a new Bloom profile.

The profile remains as a long-running Temporal workflow waiting for commands.
Once seeded, use 'nucleus synapse launch <profile_id>' to start Chrome.

Requires: No special role
Effects:  Creates a new Temporal workflow and profile record`,

		Args: cobra.RangeArgs(1, 2),

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
			"json_response": `{
  "success": true,
  "profile_id": "prf_a1b2c3d4",
  "alias": "my-profile",
  "workflow_id": "seed_my-profile_1740000000",
  "state": "SEEDED"
}`,
		},

		Example: `  nucleus synapse seed my-profile
  nucleus synapse seed my-profile --master
  nucleus --json synapse seed my-profile`,

		Run: func(cmd *cobra.Command, args []string) {
			alias := args[0]
			if len(args) > 1 {
				isMaster = args[1] == "true"
			}
			if c.IsJSON {
				jsonOutput = true
			}

			logger, err := core.InitLogger(&c.Paths, "SYNAPSE", jsonOutput, "synapse")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			if !jsonOutput {
				logger.Info("Creating profile: %s (master: %v)", alias, isMaster)
			}

			ctx := context.Background()
			tc, err := temporalclient.NewClient(ctx, &c.Paths, jsonOutput)
			if err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{"success": false, "error": fmt.Sprintf("failed to connect to Temporal: %v", err)})
				} else {
					logger.Error("Failed to connect to Temporal: %v", err)
				}
				os.Exit(1)
			}
			defer tc.Close()

			result, err := tc.ExecuteSeedWorkflow(ctx, logger, alias, isMaster)
			if err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{"success": false, "error": err.Error()})
				} else {
					logger.Error("Seed failed: %v", err)
				}
				os.Exit(1)
			}

			if jsonOutput {
				outputJSON(result)
				return
			}
			logger.Success("✅ Profile created successfully")
			logger.Info("Profile ID: %s", result.ProfileID)
			logger.Info("Alias: %s", result.Alias)
			logger.Info("Workflow ID: %s", result.WorkflowID)
			logger.Info("State: SEEDED (waiting for launch)")
		},
	}

	cmd.Flags().BoolVar(&jsonOutput, "json", false, "Output in JSON format")
	cmd.Flags().BoolVar(&isMaster, "master", false, "Create as master profile")
	return cmd
}

// ── LAUNCH ────────────────────────────────────────────────────────────────────

func createLaunchSubcommand(c *core.Core) *cobra.Command {
	var jsonOutput bool
	var mode string
	var skipPreflight bool

	// Override flags
	var overrideAlias string
	var overrideEmail string
	var overrideExtension string
	var overrideHeartbeat string
	var overrideRegister string
	var overrideRole string
	var overrideService string
	var overrideStep string
	var save bool
	var configFile string
	var addAccounts []string

	cmd := &cobra.Command{
		Use:   "launch <profile_id>",
		Short: "Launch Sentinel for a profile (with pre-flight check)",
		Long: `Send a launch signal to a profile workflow, starting Sentinel and Chrome.

Before contacting Temporal, a pre-flight check verifies:
  1. Brain TCP server (port 5678) is responding
     → If not: attempts nssm start BloomBrain (10s timeout)

If the check fails after retry, the command aborts with a clear error
message before any workflow is triggered.

Use --skip-preflight to bypass this check.

Override flags allow modifying profile attributes for this session without
persisting changes (unless --save is specified). All overrides are forwarded
directly to Sentinel at launch time.

Requires: No special role
Effects:  Starts Chrome via Sentinel; creates Temporal workflow signals`,

		Args: cobra.ExactArgs(1),

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
			"json_response": `{
  "success": true,
  "profile_id": "prf_a1b2c3d4",
  "chrome_pid": 14832,
  "debug_port": 9222,
  "extension_loaded": true,
  "state": "RUNNING"
}`,
		},

		Example: `  nucleus synapse launch prf_a1b2c3d4
  nucleus synapse launch prf_a1b2c3d4 --mode discovery
  nucleus synapse launch prf_a1b2c3d4 --skip-preflight
  nucleus synapse launch prf_a1b2c3d4 --override-email user@example.com --override-service google
  nucleus synapse launch prf_a1b2c3d4 --override-role sovereign --override-register true --save
  nucleus synapse launch prf_a1b2c3d4 --add-account google,user@gmail.com,active --add-account twitter,@user,active
  nucleus synapse launch prf_a1b2c3d4 --config-file overrides.json
  nucleus synapse launch prf_a1b2c3d4 --config-file @/path/to/config.json
  nucleus --json synapse launch prf_a1b2c3d4`,

		Run: func(cmd *cobra.Command, args []string) {
			profileID := args[0]
			if c.IsJSON {
				jsonOutput = true
			}

			logger, err := core.InitLogger(&c.Paths, "SYNAPSE", jsonOutput, "synapse")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			// ── Pre-flight check ──────────────────────────────────────────
			if !skipPreflight {
				if !jsonOutput {
					logger.Info("Running pre-flight check…")
				}

				pf := runPreflightCheck()
				if pf.Error != "" {
					if jsonOutput {
						outputJSON(map[string]interface{}{
							"success":    false,
							"profile_id": profileID,
							"error":      pf.Error,
							"stage":      "preflight",
							"timestamp":  time.Now().Unix(),
						})
					} else {
						logger.Error("❌ Pre-flight failed:\n%s", pf.Error)
					}
					os.Exit(1)
				}

				if !jsonOutput {
					logger.Success("✅ Pre-flight OK (Brain: up)")
				}
			}
			// ── End pre-flight ────────────────────────────────────────────

			if !jsonOutput {
				logger.Info("Launching profile: %s (mode: %s)", profileID, mode)
			}

			ctx := context.Background()
			tc, err := temporalclient.NewClient(ctx, &c.Paths, jsonOutput)
			if err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{"success": false, "error": fmt.Sprintf("failed to connect to Temporal: %v", err)})
				} else {
					logger.Error("Failed to connect to Temporal: %v", err)
				}
				os.Exit(1)
			}
			defer tc.Close()

			result, err := tc.ExecuteLaunchWorkflow(ctx, logger, profileID, mode, temporalclient.LaunchOverrides{
				ConfigFile:        configFile,
				OverrideAlias:     overrideAlias,
				OverrideEmail:     overrideEmail,
				OverrideExtension: overrideExtension,
				OverrideHeartbeat: overrideHeartbeat,
				OverrideRegister:  overrideRegister,
				OverrideRole:      overrideRole,
				OverrideService:   overrideService,
				OverrideStep:      overrideStep,
				Save:              save,
				AddAccounts:       addAccounts,
			})
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

			if jsonOutput {
				outputJSON(result)
				return
			}
			logger.Success("✅ Sentinel launched successfully")
			logger.Info("Profile ID: %s", result.ProfileID)
			logger.Info("Chrome PID: %d", result.ChromePID)
			logger.Info("Debug Port: %d", result.DebugPort)
			logger.Info("Extension Loaded: %v", result.ExtensionLoaded)
			logger.Info("State: %s", result.State)
		},
	}

	cmd.Flags().BoolVar(&jsonOutput, "json", false, "Output in JSON format")
	cmd.Flags().StringVar(&mode, "mode", "landing", "Launch mode (landing, discovery)")
	cmd.Flags().BoolVar(&skipPreflight, "skip-preflight", false, "Skip Brain/launcher pre-flight check")

	// Config file
	cmd.Flags().StringVar(&configFile, "config-file", "", "Load overrides from JSON file (@file path or - for stdin)")

	// Override flags
	cmd.Flags().StringVar(&overrideAlias, "override-alias", "", "Override profile alias")
	cmd.Flags().StringVar(&overrideEmail, "override-email", "", "Override profile email")
	cmd.Flags().StringVar(&overrideExtension, "override-extension", "", "Override extension ID")
	cmd.Flags().StringVar(&overrideHeartbeat, "override-heartbeat", "", "Override heartbeat flag (true/false)")
	cmd.Flags().StringVar(&overrideRegister, "override-register", "", "Override register flag (true/false)")
	cmd.Flags().StringVar(&overrideRole, "override-role", "", "Override profile role")
	cmd.Flags().StringVar(&overrideService, "override-service", "", "Override registration service (google, twitter, github, etc)")
	cmd.Flags().StringVar(&overrideStep, "override-step", "", "Override current step (default: 0)")
	cmd.Flags().BoolVar(&save, "save", false, "Persist overrides in profiles.json")

	// Linked accounts — repetible
	cmd.Flags().StringArrayVar(&addAccounts, "add-account", []string{}, "Add linked account (provider,email_or_username,status). Repeatable")

	return cmd
}

// ── STATUS ────────────────────────────────────────────────────────────────────

func createStatusSubcommand(c *core.Core) *cobra.Command {
	var jsonOutput bool

	cmd := &cobra.Command{
		Use:   "status <profile_id>",
		Short: "Query current profile workflow status",
		Long: `Execute a Temporal query to get the current ProfileStatus.

Returns the live state of the profile workflow including Chrome PID,
extension status, and any active automation state.

Requires: No special role
Effects:  Read-only`,

		Args: cobra.ExactArgs(1),

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
			"json_response": `{
  "success": true,
  "status": {
    "profile_id": "prf_a1b2c3d4",
    "state": "RUNNING",
    "sentinel_running": true,
    "last_update": "2026-02-21T19:51:07Z",
    "error_message": ""
  }
}`,
		},

		Example: `  nucleus synapse status prf_a1b2c3d4
  nucleus --json synapse status prf_a1b2c3d4`,

		Run: func(cmd *cobra.Command, args []string) {
			profileID := args[0]
			if c.IsJSON {
				jsonOutput = true
			}

			logger, err := core.InitLogger(&c.Paths, "SYNAPSE", jsonOutput, "synapse")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			ctx := context.Background()
			tc, err := temporalclient.NewClient(ctx, &c.Paths, jsonOutput)
			if err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{"success": false, "error": fmt.Sprintf("failed to connect to Temporal: %v", err)})
				} else {
					logger.Error("Failed to connect to Temporal: %v", err)
				}
				os.Exit(1)
			}
			defer tc.Close()

			status, err := tc.GetProfileStatus(ctx, profileID)
			if err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{"success": false, "profile_id": profileID, "error": err.Error()})
				} else {
					logger.Error("Failed to query status: %v", err)
				}
				os.Exit(1)
			}

			if jsonOutput {
				outputJSON(map[string]interface{}{"success": true, "status": status})
				return
			}
			logger.Info("╔═══════════════════════════════════╗")
			logger.Info("Profile ID: %s", status.ProfileID)
			logger.Info("State: %s", status.State)
			logger.Info("Sentinel Running: %v", status.SentinelRunning)
			logger.Info("Last Update: %s", status.LastUpdate.Format(time.RFC3339))
			if status.ErrorMessage != "" {
				logger.Warning("Error: %s", status.ErrorMessage)
			}
			logger.Info("╚═══════════════════════════════════╝")
		},
	}

	cmd.Flags().BoolVar(&jsonOutput, "json", false, "Output in JSON format")
	return cmd
}

// ── SHUTDOWN ──────────────────────────────────────────────────────────────────

func createShutdownSubcommand(c *core.Core) *cobra.Command {
	var jsonOutput bool

	cmd := &cobra.Command{
		Use:   "shutdown <profile_id>",
		Short: "Shutdown a profile workflow gracefully",
		Long: `Send a shutdown signal to a running profile workflow.

Sentinel will close Chrome and clean up all associated resources.
The workflow transitions to STOPPED state.

Requires: No special role
Effects:  Terminates Chrome process and stops the Temporal workflow`,

		Args: cobra.ExactArgs(1),

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
			"json_response": `{
  "success": true,
  "profile_id": "prf_a1b2c3d4",
  "message": "shutdown signal sent"
}`,
		},

		Example: `  nucleus synapse shutdown prf_a1b2c3d4
  nucleus --json synapse shutdown prf_a1b2c3d4`,

		Run: func(cmd *cobra.Command, args []string) {
			profileID := args[0]
			if c.IsJSON {
				jsonOutput = true
			}

			logger, err := core.InitLogger(&c.Paths, "SYNAPSE", jsonOutput, "synapse")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			if !jsonOutput {
				logger.Info("Shutting down profile: %s", profileID)
			}

			ctx := context.Background()
			tc, err := temporalclient.NewClient(ctx, &c.Paths, jsonOutput)
			if err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{"success": false, "error": fmt.Sprintf("failed to connect to Temporal: %v", err)})
				} else {
					logger.Error("Failed to connect to Temporal: %v", err)
				}
				os.Exit(1)
			}
			defer tc.Close()

			if err := tc.ShutdownProfile(ctx, logger, profileID); err != nil {
				if jsonOutput {
					outputJSON(map[string]interface{}{"success": false, "profile_id": profileID, "error": err.Error()})
				} else {
					logger.Error("Shutdown failed: %v", err)
				}
				os.Exit(1)
			}

			if jsonOutput {
				outputJSON(map[string]interface{}{
					"success":    true,
					"profile_id": profileID,
					"message":    "shutdown signal sent",
				})
				return
			}
			logger.Success("✅ Shutdown signal sent successfully")
		},
	}

	cmd.Flags().BoolVar(&jsonOutput, "json", false, "Output in JSON format")
	return cmd
}

// ── START-OLLAMA ──────────────────────────────────────────────────────────────

func createStartOllamaSubcommand(c *core.Core) *cobra.Command {
	var simulation bool

	cmd := &cobra.Command{
		Use:   "start-ollama",
		Short: "Start Ollama AI service via Temporal workflow",
		Long: `Start the Ollama AI service through Sentinel orchestration.

The Temporal workflow:
  1. Validates system prerequisites
  2. Starts Ollama service via Sentinel
  3. Verifies port availability (11434)
  4. Returns process ID and status

Requires: No special role
Effects:  Starts the Ollama process`,

		Args: cobra.NoArgs,

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
			"json_response": `{
  "success": true,
  "pid": 18340,
  "port": 11434,
  "state": "RUNNING"
}`,
		},

		Example: `  nucleus synapse start-ollama
  nucleus synapse start-ollama --simulation
  nucleus --json synapse start-ollama`,

		Run: func(cmd *cobra.Command, args []string) {
			ctx := context.Background()
			result, err := executeStartOllamaWorkflow(ctx, c, simulation)
			if err != nil {
				if c.IsJSON {
					outputJSON(map[string]interface{}{"success": false, "error": err.Error(), "state": "FAILED"})
				} else {
					c.Logger.Printf("[ERROR] ❌ Start Ollama failed: %v", err)
				}
				os.Exit(1)
			}

			if c.IsJSON {
				outputJSON(result)
				return
			}
			c.Logger.Printf("[SUCCESS] ✅ Ollama started successfully")
			c.Logger.Printf("[INFO]    PID: %d", result.PID)
			c.Logger.Printf("[INFO]    Port: %d", result.Port)
			c.Logger.Printf("[INFO]    State: %s", result.State)
		},
	}

	cmd.Flags().BoolVar(&simulation, "simulation", false, "Run in simulation mode (no real process)")
	return cmd
}

// ── VAULT-STATUS ──────────────────────────────────────────────────────────────

func createVaultStatusSubcommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "vault-status",
		Short: "Query Vault lock state via Brain",
		Long: `Query the current state of the Vault via the Brain component.

Returns:
  - Vault state (LOCKED / UNLOCKED)
  - Master profile activation status
  - Overall health state

Requires: No special role
Effects:  Read-only`,

		Args: cobra.NoArgs,

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
			"json_response": `{
  "success": true,
  "vault_state": "UNLOCKED",
  "master_profile_active": true,
  "state": "HEALTHY",
  "timestamp": 1740000000
}`,
		},

		Example: `  nucleus synapse vault-status
  nucleus --json synapse vault-status`,

		Run: func(cmd *cobra.Command, args []string) {
			ctx := context.Background()
			result, err := executeVaultStatusWorkflow(ctx, c)
			if err != nil {
				if c.IsJSON {
					outputJSON(map[string]interface{}{"success": false, "error": err.Error(), "state": "FAILED"})
				} else {
					c.Logger.Printf("[ERROR] ❌ Vault status query failed: %v", err)
				}
				os.Exit(1)
			}

			if c.IsJSON {
				outputJSON(result)
				return
			}
			c.Logger.Printf("[INFO] Vault Status:")
			c.Logger.Printf("[INFO]   State: %s", result.VaultState)
			c.Logger.Printf("[INFO]   Master Profile Active: %v", result.MasterProfileActive)
			c.Logger.Printf("[INFO]   Overall State: %s", result.State)
			if result.VaultState == "LOCKED" {
				c.Logger.Printf("[WARNING] ⚠️  Vault is locked - some operations may be restricted")
			}
		},
	}

	return cmd
}

// ── SHUTDOWN-ALL ──────────────────────────────────────────────────────────────

func createShutdownAllSubcommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "shutdown-all",
		Short: "Shutdown all orchestrated services gracefully",
		Long: `Gracefully shutdown all services managed by Nucleus orchestration.

Services included in shutdown:
  - All active profile Chrome instances
  - Ollama AI service
  - Other orchestrated Temporal workflows

Requires: No special role
Effects:  Terminates all active Chrome processes and orchestration workflows`,

		Args: cobra.NoArgs,

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
			"json_response": `{
  "success": true,
  "services_shutdown": ["ollama", "profile_prf_a1b2c3d4"],
  "count": 2
}`,
		},

		Example: `  nucleus synapse shutdown-all
  nucleus --json synapse shutdown-all`,

		Run: func(cmd *cobra.Command, args []string) {
			ctx := context.Background()
			result, err := executeShutdownAllWorkflow(ctx, c)
			if err != nil {
				if c.IsJSON {
					outputJSON(map[string]interface{}{"success": false, "error": err.Error()})
				} else {
					c.Logger.Printf("[ERROR] ❌ Shutdown failed: %v", err)
				}
				os.Exit(1)
			}

			if c.IsJSON {
				outputJSON(result)
				return
			}
			c.Logger.Printf("[SUCCESS] ✅ Shutdown completed")
			c.Logger.Printf("[INFO]    Services stopped: %v", result.ServicesShutdown)
		},
	}

	return cmd
}

// ── ONBOARDING ────────────────────────────────────────────────────────────────

func createOnboardingSubcommand(c *core.Core) *cobra.Command {
	var step string

	cmd := &cobra.Command{
		Use:   "onboarding <profile_id>",
		Short: "Send onboarding navigation signal to a running profile",

		Long: `Send an onboarding navigation signal to a running Chrome profile via Brain TCP routing.

This command signals the Cortex extension running in the target profile to advance
to a specific onboarding screen. The signal travels:
  Temporal Activity → SentinelClient → Brain TCP → bloom-host → background.js → discovery.js

The command confirms Brain has routed the message (status: routed) but does not
wait for Chrome to process it. Use ONBOARDING_COMPLETE event (sentinel listen) to
confirm the user completed the flow.

Requires: Active profile with Chrome running and Cortex extension connected.
Effects: None on Brain state. Triggers showScreen() in the target Chrome profile.`,

		Args: cobra.ExactArgs(1),

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
			"json_response": `{
  "success": true,
  "profile_id": "profile_001",
  "step": "account_setup",
  "request_id": "onb_nav_1741234567_abc",
  "status": "routed"
}`,
		},

		Example: `  nucleus synapse onboarding profile_001 --step account_setup
  nucleus --json synapse onboarding profile_001 --step account_setup`,

		Run: func(cmd *cobra.Command, args []string) {
			profileID := args[0]

			logger, err := core.InitLogger(&c.Paths, "SYNAPSE", c.IsJSON, "synapse")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			if !c.IsJSON {
				logger.Info("Sending onboarding signal to profile: %s (step: %s)", profileID, step)
			}

			ctx := context.Background()
			tc, err := temporalclient.NewClient(ctx, &c.Paths, c.IsJSON)
			if err != nil {
				if c.IsJSON {
					outputJSON(map[string]interface{}{"success": false, "error": fmt.Sprintf("failed to connect to Temporal: %v", err)})
				} else {
					logger.Error("Failed to connect to Temporal: %v", err)
				}
				os.Exit(1)
			}
			defer tc.Close()

			result, err := tc.ExecuteOnboardingWorkflow(ctx, logger, profileID, step)
			if err != nil {
				if c.IsJSON {
					outputJSON(map[string]interface{}{
						"success":    false,
						"profile_id": profileID,
						"step":       step,
						"error":      err.Error(),
					})
				} else {
					logger.Error("❌ Onboarding signal failed: %v", err)
				}
				os.Exit(1)
			}

			if c.IsJSON {
				outputJSON(result)
				return
			}

			logger.Success("✅ Onboarding signal routed to profile %s", profileID)
			logger.Info("   Step:       %s", result.Step)
			logger.Info("   Request ID: %s", result.RequestID)
			logger.Info("   Status:     %s", result.Status)
		},
	}

	cmd.Flags().StringVar(&step, "step", "", "Onboarding screen to navigate to (required)")
	cmd.MarkFlagRequired("step")

	return cmd
}

// ── Workflow execution helpers ────────────────────────────────────────────────

func executeStartOllamaWorkflow(ctx context.Context, c *core.Core, simulation bool) (*workflows.StartOllamaResult, error) {
	tc, err := getTemporalClient(ctx)
	if err != nil {
		return nil, err
	}
	defer tc.Close()

	we, err := tc.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
		ID:        fmt.Sprintf("start_ollama_%d", time.Now().Unix()),
		TaskQueue: "nucleus-task-queue",
	}, workflows.StartOllamaWorkflow, workflows.StartOllamaInput{SimulationMode: simulation})
	if err != nil {
		return nil, fmt.Errorf("failed to execute workflow: %w", err)
	}
	var result workflows.StartOllamaResult
	return &result, we.Get(ctx, &result)
}

func executeVaultStatusWorkflow(ctx context.Context, c *core.Core) (*workflows.VaultStatusResult, error) {
	tc, err := getTemporalClient(ctx)
	if err != nil {
		return nil, err
	}
	defer tc.Close()

	we, err := tc.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
		ID:        fmt.Sprintf("vault_status_%d", time.Now().Unix()),
		TaskQueue: "nucleus-task-queue",
	}, workflows.VaultStatusWorkflow)
	if err != nil {
		return nil, fmt.Errorf("failed to execute workflow: %w", err)
	}
	var result workflows.VaultStatusResult
	return &result, we.Get(ctx, &result)
}

func executeShutdownAllWorkflow(ctx context.Context, c *core.Core) (*workflows.ShutdownAllResult, error) {
	tc, err := getTemporalClient(ctx)
	if err != nil {
		return nil, err
	}
	defer tc.Close()

	we, err := tc.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
		ID:        fmt.Sprintf("shutdown_all_%d", time.Now().Unix()),
		TaskQueue: "nucleus-task-queue",
	}, workflows.ShutdownAllWorkflow)
	if err != nil {
		return nil, fmt.Errorf("failed to execute workflow: %w", err)
	}
	var result workflows.ShutdownAllResult
	return &result, we.Get(ctx, &result)
}

func getTemporalClient(ctx context.Context) (client.Client, error) {
	return client.Dial(client.Options{HostPort: "localhost:7233"})
}

// outputJSON imprime v como JSON indentado a stdout
func outputJSON(v interface{}) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, `{"success":false,"error":"marshal failed"}`+"\n")
		return
	}
	fmt.Println(string(data))
}