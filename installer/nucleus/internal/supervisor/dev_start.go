// File: internal/supervisor/dev_start.go
// Auto-contained command following NUCLEUS master guide v2.0
package supervisor

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
	var skipControlPlane bool
	var enableSynapseSimulatorOnboarding bool
	var outputJSON bool

	cmd := &cobra.Command{
		Use:   "dev-start",
		Short: "Start Nucleus development environment with full boot sequence",
		Long: `Execute the complete Nucleus boot sequence for development:

1. Temporal Core verification
2. Worker initialization check  
3. Brain Server startup
4. Heavy infrastructure (Ollama) startup
5. Governance validation
6. Vault unlock verification
7. Control Plane initialization (Node.js bootstrap)

This command orchestrates all services required for a complete
Nucleus development environment with proper health checks and
deterministic startup order.`,

		Args: cobra.NoArgs,

		Example: `  nucleus dev-start
  nucleus dev-start --simulation
  nucleus dev-start --skip-vault
  nucleus dev-start --enable-synapse-simulator-onboarding`,

		Run: func(cmd *cobra.Command, args []string) {
			// Inherit global --json flag (same pattern as all other nucleus commands)
			if c.IsJSON {
				outputJSON = true
			}

			// Verify authorization (dev-start requires Master role).
			// EXCEPCIÓN: --enable-synapse-simulator-onboarding bypassa el Master check para que
			// SynapseSimulator sea usable antes del registro de GitHub (fase de onboarding).
			if !enableSynapseSimulatorOnboarding {
				if err := governance.RequireMaster(c); err != nil {
					c.Logger.Printf("[ERROR] ⛔ dev-start requires Master role: %v", err)
					return
				}
			} else {
				c.Logger.Printf("[INFO] 🛠  --enable-synapse-simulator-onboarding: skipping Master role check")
			}

			// Create supervisor instance
			logsDir := getLogsDir(c)
			binDir := getBinDir(c)
			supervisor := NewSupervisor(logsDir, binDir)

			// En modo --json los logs de progreso van a stderr para no contaminar stdout.
			var logW io.Writer = os.Stdout
			if outputJSON {
				logW = os.Stderr
			}

			// Execute boot sequence
			ctx := context.Background()
			result, err := executeBootSequence(ctx, supervisor, simulation, skipVault, skipControlPlane, enableSynapseSimulatorOnboarding, logW)
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
			c.Logger.Printf("[INFO]    Brain Server: Running (port 5678)")
			c.Logger.Printf("[INFO]    Ollama: starting in background (port %d)", result.OllamaPort)
			c.Logger.Printf("[INFO]    Vault: %s", result.VaultState)
			c.Logger.Printf("[INFO]    Control Plane: PID %d", result.ControlPlanePID)
			c.Logger.Printf("[INFO]    WebSocket: ws://localhost:4124")
			c.Logger.Printf("[INFO]    API: http://localhost:48215")
		},
	}

	// Define flags
	cmd.Flags().BoolVar(&simulation, "simulation", false, "Run in simulation mode (use test ownership.json)")
	cmd.Flags().BoolVar(&skipVault, "skip-vault", false, "Skip vault verification (development only)")
	cmd.Flags().BoolVar(&skipControlPlane, "skip-control-plane", false, "Skip Control Plane startup (pre-onboarding mode)")
	cmd.Flags().BoolVar(&enableSynapseSimulatorOnboarding, "enable-synapse-simulator-onboarding", false, "Enable SynapseSimulator in onboarding mode (skips Master role check)")
	cmd.Flags().BoolVar(&outputJSON, "json", false, "Output result as JSON")

	return cmd
}

// BootSequenceResult represents the result of the boot sequence
type BootSequenceResult struct {
	Success         bool    `json:"success"`
	BootTime        float64 `json:"boot_time_seconds"`
	FailedStage     string  `json:"failed_stage,omitempty"`
	BrainPID        int     `json:"brain_pid,omitempty"`
	OllamaPID       int     `json:"ollama_pid,omitempty"`
	OllamaPort      int     `json:"ollama_port,omitempty"`
	VaultState      string  `json:"vault_state"`
	ControlPlanePID int     `json:"control_plane_pid,omitempty"`
	Timestamp       int64   `json:"timestamp"`
}

// executeBootSequence runs the complete boot sequence.
// El parámetro logW recibe os.Stderr cuando el caller está en modo --json,
// o os.Stdout en modo interactivo. Esto garantiza que los logs de progreso
// nunca contaminen el JSON que lee Electron u otros callers.
func executeBootSequence(ctx context.Context, s *Supervisor, simulation, skipVault, skipControlPlane, enableSynapseSimulatorOnboarding bool, logW io.Writer) (*BootSequenceResult, error) {
	log := func(format string, args ...interface{}) {
		fmt.Fprintf(logW, format+"\n", args...)
	}

	startTime := time.Now()

	result := &BootSequenceResult{
		Success:   true,
		Timestamp: time.Now().Unix(),
	}

	// ========================================================================
	// Phase 0: SynapseSimulator (siempre — antes de governance, independiente del
	// estado de onboarding). En modo onboarding es la capa de debug principal.
	// Non-fatal: un fallo de SynapseSimulator no aborta el boot.
	// ========================================================================
	log("[INFO] Starting SynapseSimulator (debug/observability layer)...")
	synapseSimulatorResult := s.bootSynapseSimulator(ctx, simulation)
	if !synapseSimulatorResult.Healthy {
		log("[WARN] ⚠️  SynapseSimulator failed to start (mode=%s): %s", synapseSimulatorResult.Mode, synapseSimulatorResult.Error)
	} else {
		log("[INFO] ✓ SynapseSimulator started (mode=%s)", synapseSimulatorResult.Mode)
	}

	// ========================================================================
	// Phase 1: Ensure Temporal Server is running (auto-start if needed)
	// ========================================================================
	log("[INFO] Ensuring Temporal Server is running...")

	nucleusExe, err := getNucleusExecutablePath()
	if err != nil {
		result.Success = false
		result.FailedStage = "nucleus_not_found"
		return result, fmt.Errorf("nucleus executable not found: %w", err)
	}

	// Execute: nucleus temporal ensure
	cmd := exec.CommandContext(ctx, nucleusExe, "temporal", "ensure")
	output, err := cmd.CombinedOutput()
	if err != nil {
		result.Success = false
		result.FailedStage = "temporal_ensure_failed"
		return result, fmt.Errorf("temporal ensure command failed: %w (output: %s)", err, string(output))
	}

	// Parse JSON response
	var temporalResult struct {
		Success  bool   `json:"success"`
		State    string `json:"state"`
		Started  bool   `json:"started"`
		PID      int    `json:"pid,omitempty"`
		GRPCPort int    `json:"grpc_port"`
		UIPort   int    `json:"ui_port"`
	}

	if err := json.Unmarshal(output, &temporalResult); err != nil {
		result.Success = false
		result.FailedStage = "temporal_response_parse"
		return result, fmt.Errorf("failed to parse temporal ensure response: %w (output: %s)", err, string(output))
	}

	if !temporalResult.Success {
		result.Success = false
		result.FailedStage = "temporal_not_running"
		return result, fmt.Errorf("temporal ensure reported failure: state=%s", temporalResult.State)
	}

	if temporalResult.Started {
		log("[INFO] ✓ Temporal Server started: PID %d (port %d)", temporalResult.PID, temporalResult.GRPCPort)
	} else {
		log("[INFO] ✓ Temporal Server already running (port %d)", temporalResult.GRPCPort)
	}

	// ========================================================================
	// Phase 2: Start Worker Manager
	// ========================================================================
	log("[INFO] Starting Worker Manager...")

	workerProc, err := s.startWorkerManager(ctx)
	if err != nil {
		result.Success = false
		result.FailedStage = "worker_start"
		return result, fmt.Errorf("worker manager start failed: %w", err)
	}

	// Registrar telemetry si es un proceso recién spawnado (no externo)
	if workerProc.LogPath != "" {
		s.updateWorkerTelemetry(workerProc)
	}

	log("[INFO] ✓ Worker Manager started: PID %d", workerProc.PID)

	// ========================================================================
	// Phase 2.5: Start Brain Server
	// ========================================================================
	log("[INFO] Starting Brain Server...")

	brainProc, err := s.startBrainServer(ctx)
	if err != nil {
		result.Success = false
		result.FailedStage = "brain_server_start"
		return result, fmt.Errorf("brain server start failed: %w", err)
	}

	// Si Brain fue recién spawnado (Cmd != nil), esperar a que el puerto esté listo.
	// Si ya estaba corriendo (Cmd == nil), isBrainRunning() ya lo confirmó — no hay que esperar.
	if brainProc.Cmd != nil {
		log("[INFO] Waiting for Brain Server to be ready on port 5678...")
		if err := s.waitForBrainReady(15 * time.Second); err != nil {
			result.Success = false
			result.FailedStage = "brain_server_ready"
			return result, fmt.Errorf("brain server failed to become ready: %w", err)
		}
		log("[INFO] ✓ Brain Server ready: PID %d (port 5678)", brainProc.PID)
		result.BrainPID = brainProc.PID
	} else {
		log("[INFO] ✓ Brain Server already running (port 5678)")
	}

	// Registrar en telemetry si tiene log path (proceso nuevo, no externo)
	if brainProc.LogPath != "" {
		s.updateBrainTelemetry(brainProc)
	}

	// ========================================================================
	// Phase 3: Start Ollama (NON-BLOCKING)
	// ========================================================================
	log("[INFO] Starting Ollama (non-blocking)...")

	// Start Ollama in background - don't fail boot if it doesn't start
	go func() {
		ollamaResult, err := s.StartOllama(ctx)
		if err != nil {
			fmt.Fprintf(logW, "[WARN] ⚠️  Ollama start failed (non-critical): %v\n", err)
			fmt.Fprintf(logW, "[INFO] Ollama can be started manually later via: sentinel ollama start\n")
		} else {
			fmt.Fprintf(logW, "[INFO] ✓ Ollama started: PID %d (port %d)\n", ollamaResult.PID, ollamaResult.Port)
		}
	}()

	// Don't block - continue boot sequence immediately
	result.OllamaPID = 0 // Will be populated asynchronously
	result.OllamaPort = 11434
	log("[INFO] ✓ Ollama startup initiated in background")

	// ========================================================================
	// Phase 4: Governance validation
	// ========================================================================
	if err := s.bootGovernance(ctx, simulation); err != nil {
		result.Success = false
		result.FailedStage = "governance"
		return result, fmt.Errorf("governance validation failed: %w", err)
	}

	// ========================================================================
	// Phase 5: Vault check (optional)
	// ========================================================================
	if !skipVault {
		// Durante onboarding, BLOOM_DIR no está seteado — vault-status requiere
		// un proyecto inicializado. Saltear igual que checkVault en health.go.
		bloomDir := getBloomDir()
		if bloomDir == "" {
			log("[INFO] ✓ Vault check skipped (onboarding mode — BLOOM_DIR not set)")
			result.VaultState = "SKIPPED"
		} else {
			// Timeout acotado como defensa en profundidad — el bug real era el
			// mismatch de TaskQueue en synapse.go (ya arreglado: "nucleus-task-queue"
			// → "profile-orchestration"). Esto es una red de seguridad adicional:
			// si en el futuro esta llamada se cuelga por cualquier otro motivo
			// (worker caído, workflow no registrado, etc.), preferimos un error
			// claro en 15s a otro cuelgue silencioso de 120s matado por el
			// watchdog externo de Conductor.
			vaultCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
			defer cancel()
			vaultResult, err := s.CheckVaultStatus(vaultCtx)
			if err != nil {
				result.Success = false
				result.FailedStage = "vault_check"
				return result, fmt.Errorf("vault check failed: %w", err)
			}
			result.VaultState = vaultResult.VaultState
		}
	} else {
		result.VaultState = "SKIPPED"
	}

	// ========================================================================
	// Phase 6: Control Plane (optional — skipped during pre-onboarding)
	// ========================================================================
	if !skipControlPlane {
		proc, err := s.bootControlPlane(ctx, simulation)
		if err != nil {
			result.Success = false
			result.FailedStage = "control_plane"
			return result, fmt.Errorf("control plane start failed: %w", err)
		}
		result.ControlPlanePID = proc.PID
	} else {
		log("[INFO] ✓ Control Plane skipped (pre-onboarding mode)")
	}

	// ========================================================================
	// Phase 7: Svelte Dev Server (NON-BLOCKING — non-critical)
	// ========================================================================
	log("[INFO] Starting Svelte Dev Server...")

	svelteProc, svelteErr := s.startSvelteDev(ctx)
	if svelteErr != nil {
		// Non-critical: warn but don't abort boot
		log("[WARN] ⚠️  Svelte dev server failed to start (non-critical): %v", svelteErr)
		log("[INFO] UI can be started manually later via: npm run dev")
	} else if svelteProc.Cmd == nil {
		// Proceso externo ya estaba corriendo
		log("[INFO] ✓ Svelte dev server already running (port 5173)")
	} else {
		// Proceso recién spawnado — esperar a que esté listo (hasta 30s, Vite necesita compilar)
		log("[INFO] Waiting for Svelte dev server to be ready on port 5173...")
		if err := s.waitForSvelteReady(30 * time.Second); err != nil {
			log("[WARN] ⚠️  Svelte dev server started (PID %d) but port 5173 not ready after 30s: %v", svelteProc.PID, err)
		} else {
			log("[INFO] ✓ Svelte dev server ready: PID %d (port 5173)", svelteProc.PID)
		}
	}

	// Calculate boot time
	result.BootTime = time.Since(startTime).Seconds()

	return result, nil
}

// Helper functions

func getLogsDir(c *core.Core) string {
	if dir := os.Getenv("BLOOM_LOGS_DIR"); dir != "" {
		return dir
	}
	return filepath.Join(getBloomNucleusBase(), "logs")
}

func getBinDir(c *core.Core) string {
	if dir := os.Getenv("BLOOM_BIN_DIR"); dir != "" {
		return dir
	}
	return filepath.Join(getBloomNucleusBase(), "bin")
}

func outputJSONResult(v interface{}) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(v)
}

// getBloomNucleusBase returns the platform-correct base directory for BloomNucleus.
//
//   - Darwin:  $HOME/Library/BloomNucleus
//   - Windows: $LOCALAPPDATA/BloomNucleus
//   - Linux:   $HOME/BloomNucleus
//
// This is the single source of truth for the base path — used by getLogsDir,
// getBinDir, and getBloomDir to avoid per-function platform divergence.
func getBloomNucleusBase() string {
	switch runtime.GOOS {
	case "darwin":
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "BloomNucleus")
	case "windows":
		if localAppData := os.Getenv("LOCALAPPDATA"); localAppData != "" {
			return filepath.Join(localAppData, "BloomNucleus")
		}
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "BloomNucleus")
	default: // linux — XDG Base Directory spec
		home, _ := os.UserHomeDir()
		xdgDataHome := os.Getenv("XDG_DATA_HOME")
		if xdgDataHome == "" {
			xdgDataHome = filepath.Join(home, ".local", "share")
		}
		return filepath.Join(xdgDataHome, "BloomNucleus")
	}
}

// getBloomDir returns the root of the Bloom repo by reading nucleus.json.
// nucleus.json lives at <BloomNucleusBase>/config/nucleus.json.
//
// CONTRATO: installation.origin_path contiene la raíz del repo directamente
// (normalizado por setOriginPath en nucleus_manager.js). No se sube ningún nivel.
//
// Falls back to BLOOM_DIR env var if nucleus.json is unavailable or
// origin_path is null/empty (e.g. during initial install).
func getBloomDir() string {
	// 1. Try reading origin_path from nucleus.json
	nucleusJSON := filepath.Join(getBloomNucleusBase(), "config", "nucleus.json")

	if data, err := os.ReadFile(nucleusJSON); err == nil {
		var cfg struct {
			Installation struct {
				OriginPath string `json:"origin_path"`
			} `json:"installation"`
		}
		if json.Unmarshal(data, &cfg) == nil && cfg.Installation.OriginPath != "" {
			// origin_path ya apunta a la raíz del repo — sin traversal.
			return cfg.Installation.OriginPath
		}
	}

	// 2. Fallback to BLOOM_DIR env var
	return os.Getenv("BLOOM_DIR")
}

// getWorkspacePath returns the active project's workspace root by reading
// nucleus.json. Hermana de getBloomDir() — mismo archivo fuente
// (<BloomNucleusBase>/config/nucleus.json), mismo criterio de fallback,
// pero lee onboarding.workspace_path en vez de installation.origin_path:
// origin_path es la raíz del REPO de Bloom (para bundle.js/webview),
// workspace_path es el workspace del PROYECTO del usuario (para el árbol
// de mandates — ver MandateFsContext en src/api/server.ts).
//
// BUG (mismo patrón que BLOOM_BRAIN_PATH, ver comentario en
// bootControlPlane): bootControlPlane() reenviaba
// "BLOOM_NUCLEUS_PATH=" + os.Getenv("BLOOM_NUCLEUS_PATH") crudo. Bajo
// systemd/NSSM (sin override explícito en el entorno del propio proceso
// Nucleus) esa env var siempre llega vacía, así que el hijo (bundle.js)
// recibía BLOOM_NUCLEUS_PATH="" (definida pero falsy) y server.ts nunca
// registraba las rutas de /api/v1/mandates.
//
// Fix: resolver desde nucleus.json (mismo archivo que ya escribe
// nucleus_manager.js durante onboarding), con fallback al env var por si
// alguien lo overridea a mano — mismo criterio de precedencia que
// resolveBrainInterpreter().
func getWorkspacePath() string {
	// 1. Explicit override — respected verbatim (e.g. a systemd unit
	//    Environment= override, or a developer running outside the service).
	if p := os.Getenv("BLOOM_NUCLEUS_PATH"); p != "" {
		return p
	}

	// 2. Read the active org's workspace_path from nucleus.json.
	//
	// FIX (confirmado 2026-08-12, bloqueaba "nucleus dev-start" con "vault
	// check failed: no active organization"): este código buscaba
	// onboarding.workspace_path como campo plano, pero el schema real
	// (multi-org, escrito por el flujo de onboarding) lo guarda anidado en
	// onboarding.organizations[].workspace_path, indexado por
	// onboarding.active_org_slug — el campo plano nunca existió, así que
	// esto devolvía "" siempre y el fallback (CWD) terminaba escaneando
	// desde donde sea que el proceso padre (Conductor/Core) haya lanzado a
	// nucleus, no desde el workspace real del usuario.
	nucleusJSON := filepath.Join(getBloomNucleusBase(), "config", "nucleus.json")
	if data, err := os.ReadFile(nucleusJSON); err == nil {
		var cfg struct {
			Onboarding struct {
				ActiveOrgSlug string `json:"active_org_slug"`
				Organizations []struct {
					OrgSlug       string `json:"org_slug"`
					WorkspacePath string `json:"workspace_path"`
				} `json:"organizations"`
			} `json:"onboarding"`
		}
		if json.Unmarshal(data, &cfg) == nil {
			for _, org := range cfg.Onboarding.Organizations {
				if org.OrgSlug == cfg.Onboarding.ActiveOrgSlug && org.WorkspacePath != "" {
					return org.WorkspacePath
				}
			}
		}
	}

	// 3. Nothing resolved — caller (bootControlPlane) is responsible for
	//    logging the degraded state; server.ts already warns clearly when
	//    it receives this empty and skips registering mandate routes.
	return ""
}

// getNucleusExecutablePath finds the nucleus executable
func getNucleusExecutablePath() (string, error) {
	// 1. Check BLOOM_BIN_DIR environment variable
	if binDir := os.Getenv("BLOOM_BIN_DIR"); binDir != "" {
		nucleusPath := filepath.Join(binDir, "nucleus", "nucleus")
		if _, err := os.Stat(nucleusPath); err == nil {
			return nucleusPath, nil
		}
		// Windows fallback
		nucleusPath = filepath.Join(binDir, "nucleus", "nucleus.exe")
		if _, err := os.Stat(nucleusPath); err == nil {
			return nucleusPath, nil
		}
	}

	// 2. Check platform-correct BloomNucleus base
	binDir := filepath.Join(getBloomNucleusBase(), "bin")
	nucleusPath := filepath.Join(binDir, "nucleus", "nucleus")
	if _, err := os.Stat(nucleusPath); err == nil {
		return nucleusPath, nil
	}
	// Windows fallback
	nucleusPath = filepath.Join(binDir, "nucleus", "nucleus.exe")
	if _, err := os.Stat(nucleusPath); err == nil {
		return nucleusPath, nil
	}

	// 3. Try PATH
	if p, err := exec.LookPath("nucleus"); err == nil {
		return p, nil
	}

	return "", fmt.Errorf("nucleus binary not found in BLOOM_BIN_DIR, %s, or PATH", binDir)
}