// File: internal/supervisor/health.go
// Health check command — validates all Nucleus components in parallel (<3s)
// Categoría: DIAGNOSTICS
// Sigue Guía Maestra de Implementación Comandos NUCLEUS v2.0
package supervisor

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"nucleus/internal/core"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("DIAGNOSTICS", createHealthCommand)
}

// ── Result types ─────────────────────────────────────────────────────────────

// HealthResult es la respuesta JSON del comando health
type HealthResult struct {
	Success         bool                       `json:"success"`
	State           string                     `json:"state"` // HEALTHY | DEGRADED | FAILED
	Error           string                     `json:"error,omitempty"`
	Components      map[string]ComponentHealth `json:"components"`
	Resources       *ResourceHealth            `json:"resources,omitempty"`
	Timestamp       int64                      `json:"timestamp"`
	BrainLastErrors *BrainLastErrors           `json:"brain_last_errors,omitempty"`
}

// ResourceHealth agrupa metricas de recursos del sistema (memoria, disco, CPU).
// Disenado para crecer -- memory es el primer ciudadano.
type ResourceHealth struct {
	Memory MemoryHealth `json:"memory"`
}

// MemoryHealth describe el estado de la RAM disponible.
// Estados: OK | DEGRADED | PRESSURE | UNKNOWN
type MemoryHealth struct {
	State   string `json:"state"`
	FreeMB  int64  `json:"free_mb,omitempty"`
	TotalMB int64  `json:"total_mb,omitempty"`
	Message string `json:"message,omitempty"`
	Error   string `json:"error,omitempty"`
}

// ComponentHealth describe el estado de un componente individual
type ComponentHealth struct {
	Healthy       bool   `json:"healthy"`
	State         string `json:"state"`
	Error         string `json:"error,omitempty"`
	PID           int    `json:"pid,omitempty"`
	Port          int    `json:"port,omitempty"`
	LatencyMs     int64  `json:"latency_ms,omitempty"`
	GRPCURL       string `json:"grpc_url,omitempty"`
	TaskQueue     string `json:"task_queue,omitempty"`
	ProfilesCount int    `json:"profiles_count,omitempty"`
	FixAttempted  bool   `json:"fix_attempted,omitempty"`
	FixResult     string `json:"fix_result,omitempty"`
}

// BrainLastErrors contiene las últimas líneas de logs de Brain cuando está caído
type BrainLastErrors struct {
	BrainServiceLog  []string `json:"brain_service_log,omitempty"`
	BrainEventBusLog []string `json:"brain_event_bus_log,omitempty"`
}

type componentCheckResult struct {
	name   string
	health ComponentHealth
}

// ── Command factory ───────────────────────────────────────────────────────────

func createHealthCommand(c *core.Core) *cobra.Command {
	var outputJSON bool
	var validate bool
	var component string
	var fix bool

	cmd := &cobra.Command{
		Use:   "health",
		Short: "System integrity check — all components in parallel (<3s)",
		Long: `Run parallel health checks across all Nucleus components.

Verifies connectivity and state of:
  - Temporal Server (port 7233)
  - Nucleus Worker (task queue)
  - Ollama Engine (port 11434)
  - Control Plane API
  - Vault (lock state)
  - Governance (.ownership.json)
  - Brain Service (port 5678)
  - Bloom API (port 48215)
  - Svelte Dev Server (port 5173)
  - Worker Manager (profile registry)

All checks run concurrently with a 2s per-component timeout and a 3s global
timeout, so the command always returns in under 3 seconds.

When brain_service is UNREACHABLE, the last 20 lines of brain_service.log
and brain_server_event_bus.log are appended to the output automatically.

Use --fix to attempt automated remediation of known failures:
  - brain_service UNREACHABLE → nssm start BloomBrainService
  - governance BLOOM_DIR missing → prints exact fix instruction
  - worker DISCONNECTED → nucleus worker start

Requires: No special role
Effects:  Read-only (unless --fix is used)`,

		Args: cobra.NoArgs,

		Annotations: map[string]string{
			"category": "DIAGNOSTICS",
			"json_response": `{
  "success": false,
  "state": "DEGRADED",
  "error": "2 non-critical components unhealthy",
  "timestamp": 1740000000,
  "components": {
    "temporal":       { "healthy": true,  "state": "RUNNING",      "port": 7233,  "latency_ms": 4  },
    "worker":         { "healthy": false, "state": "DISCONNECTED",  "error": "Worker process not found in supervisor" },
    "ollama":         { "healthy": true,  "state": "RUNNING",       "port": 11434, "latency_ms": 3  },
    "control_plane":  { "healthy": true,  "state": "RUNNING",       "pid": 9821   },
    "vault":          { "healthy": true,  "state": "UNLOCKED"       },
    "governance":     { "healthy": true,  "state": "VALID"          },
    "brain_service":  { "healthy": false, "state": "UNREACHABLE",   "port": 5678,  "error": "Port 5678 not accessible" },
    "bloom_api":      { "healthy": true,  "state": "RUNNING",       "port": 48215, "latency_ms": 12 },
    "svelte_dev":     { "healthy": true,  "state": "RUNNING",       "port": 5173,  "latency_ms": 5  },
    "worker_manager": { "healthy": true,  "state": "ACTIVE",        "profiles_count": 1 }
  },
  "brain_last_errors": {
    "brain_service_log":   ["2026-02-20 22:50:09 ERROR Connection reset by peer"],
    "brain_event_bus_log": ["2026-02-20 22:50:09 ERROR WinError 64: pipe broken"]
  }
}`,
		},

		Example: `  nucleus health
  nucleus health --fix
  nucleus health --component brain_service
  nucleus --json health
  nucleus --json health --fix
  nucleus health --validate`,

		Run: func(cmd *cobra.Command, args []string) {
			// Inherit global --json flag
			if c.IsJSON {
				outputJSON = true
			}

			logsDir := getLogsDir(c)
			binDir := getBinDir(c)

			appDataDir := os.Getenv("BLOOM_APPDATA_DIR")
			if appDataDir == "" {
				localAppData := os.Getenv("LOCALAPPDATA")
				if localAppData == "" {
					localAppData = os.Getenv("HOME")
				}
				appDataDir = filepath.Join(localAppData, "BloomNucleus")
			}

			supervisor := NewSupervisor(logsDir, binDir)

			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()

			result := checkSystemHealthParallel(ctx, supervisor, appDataDir, validate, component, logsDir)

			if fix || c.Settings.Health.AutoFix {
				applyFixes(result)
			}

			if outputJSON {
				outputHealthJSONResult(result)
				if !result.Success {
					os.Exit(1)
				}
				return
			}

			printHealthHuman(c, result)
			if !result.Success {
				os.Exit(1)
			}
		},
	}

	cmd.Flags().BoolVar(&outputJSON, "json", false, "Output result as JSON")
	cmd.Flags().BoolVar(&validate, "validate", false, "Deep validation checks (slower)")
	cmd.Flags().StringVar(&component, "component", "", "Check only one component (temporal, worker, brain_service, etc.)")
	cmd.Flags().BoolVar(&fix, "fix", false, "Attempt automated remediation of known failures")

	return cmd
}

// ── Parallel orchestration ────────────────────────────────────────────────────

func checkSystemHealthParallel(ctx context.Context, s *Supervisor, appDataDir string, validate bool, filterComponent string, logsDir string) *HealthResult {
	result := &HealthResult{
		Success:    true,
		State:      "HEALTHY",
		Components: make(map[string]ComponentHealth),
		Timestamp:  time.Now().Unix(),
	}

	type checkDef struct {
		name string
		fn   func(context.Context) ComponentHealth
	}

	checks := []checkDef{
		{"temporal", func(ctx context.Context) ComponentHealth { return checkTemporal(ctx, s, validate) }},
		{"worker", func(ctx context.Context) ComponentHealth { return checkWorker(ctx, s, validate) }},
		{"ollama", func(ctx context.Context) ComponentHealth { return checkOllama(ctx, s, validate) }},
		{"control_plane", func(ctx context.Context) ComponentHealth { return checkControlPlane(ctx, s, validate) }},
		{"vault", func(ctx context.Context) ComponentHealth { return checkVault(ctx, s, validate) }},
		{"governance", func(ctx context.Context) ComponentHealth { return checkGovernance(ctx, s, validate) }},
		{"brain_service", func(ctx context.Context) ComponentHealth { return checkBrainService(ctx, s, validate) }},
		{"bloom_api", func(ctx context.Context) ComponentHealth { return checkBloomAPI(ctx, s, validate) }},
		{"svelte_dev", func(ctx context.Context) ComponentHealth { return checkSvelteDev(ctx, s, validate) }},
		{"worker_manager", func(ctx context.Context) ComponentHealth { return checkWorkerManager(ctx, s, appDataDir, validate) }},
	}

	if filterComponent != "" {
		for _, cd := range checks {
			if cd.name == filterComponent {
				childCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
				defer cancel()
				result.Components[filterComponent] = cd.fn(childCtx)
				goto evaluate
			}
		}
		result.Success = false
		result.State = "FAILED"
		result.Error = fmt.Sprintf("Unknown component: %s", filterComponent)
		return result
	}

	{
		resultsCh := make(chan componentCheckResult, len(checks))
		var wg sync.WaitGroup
		for _, cd := range checks {
			wg.Add(1)
			cd := cd
			go func() {
				defer wg.Done()
				childCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
				defer cancel()
				resultsCh <- componentCheckResult{name: cd.name, health: cd.fn(childCtx)}
			}()
		}
		go func() { wg.Wait(); close(resultsCh) }()
		for r := range resultsCh {
			result.Components[r.name] = r.health
		}
	}

	// Chequeo de recursos -- fuera del pool paralelo, es local e instantaneo.
	result.Resources = &ResourceHealth{
		Memory: checkMemory(),
	}

evaluate:
	criticalComponents := []string{"temporal", "worker", "vault", "governance"}
	nonCriticalComponents := []string{"ollama", "control_plane", "brain_service", "bloom_api", "svelte_dev", "worker_manager"}

	criticalFailures, degradedCount := 0, 0
	for _, name := range criticalComponents {
		if comp, ok := result.Components[name]; ok && !comp.Healthy {
			criticalFailures++
		}
	}
	for _, name := range nonCriticalComponents {
		if comp, ok := result.Components[name]; ok && !comp.Healthy {
			degradedCount++
		}
	}

	if criticalFailures > 0 {
		result.Success = false
		result.State = "FAILED"
		result.Error = fmt.Sprintf("%d critical components unhealthy", criticalFailures)
	} else if degradedCount > 0 {
		result.State = "DEGRADED"
		result.Error = fmt.Sprintf("%d non-critical components unhealthy", degradedCount)
	}

	if brain, ok := result.Components["brain_service"]; ok && !brain.Healthy {
		result.BrainLastErrors = tailBrainLogs(logsDir, 20)
	}

	return result
}

// ── Brain log tail ────────────────────────────────────────────────────────────

func tailBrainLogs(logsDir string, n int) *BrainLastErrors {
	brainServicePath := filepath.Join(logsDir, "brain", "service", "brain_service.log")
	brainEventBusPath := filepath.Join(logsDir, "brain", "server", "brain_server_event_bus.log")

	data, err := os.ReadFile(filepath.Join(logsDir, "telemetry.json"))
	if err == nil {
		var raw struct {
			ActiveStreams map[string]struct {
				Path string `json:"path"`
			} `json:"active_streams"`
		}
		if json.Unmarshal(data, &raw) == nil {
			if s, ok := raw.ActiveStreams["brain_service"]; ok && s.Path != "" {
				brainServicePath = filepath.FromSlash(s.Path)
			}
			if s, ok := raw.ActiveStreams["brain_server_event_bus"]; ok && s.Path != "" {
				brainEventBusPath = filepath.FromSlash(s.Path)
			}
		}
	}

	return &BrainLastErrors{
		BrainServiceLog:  tailFile(brainServicePath, n),
		BrainEventBusLog: tailFile(brainEventBusPath, n),
	}
}

func tailFile(path string, n int) []string {
	data, err := os.ReadFile(path)
	if err != nil {
		return []string{fmt.Sprintf("(cannot read %s: %v)", path, err)}
	}
	scanner := bufio.NewScanner(bytes.NewReader(data))
	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if len(lines) <= n {
		return lines
	}
	return lines[len(lines)-n:]
}

// ── --fix remediation ─────────────────────────────────────────────────────────

func applyFixes(result *HealthResult) {
	if brain, ok := result.Components["brain_service"]; ok && !brain.Healthy {
		brain.FixAttempted = true
		if err := nssmStart("BloomBrainService", 10*time.Second); err != nil {
			brain.FixResult = fmt.Sprintf("FAILED: %v", err)
		} else {
			// NSSM puede retornar OK aunque el proceso tarde en arrancar o crashee
			// silenciosamente. Verificar que el puerto realmente está escuchando.
			if portErr := waitForPortOpen("127.0.0.1:5678", 15*time.Second); portErr != nil {
				brain.FixResult = "PARTIAL: BloomBrainService started via NSSM but port 5678 not ready after 15s — process may have crashed on startup"
				// No marcar como healthy: el puerto no responde
			} else {
				brain.FixResult = "SUCCESS: BloomBrainService started via NSSM"
				brain.Healthy = true
				brain.State = "RUNNING"
				brain.Error = ""
			}
		}
		result.Components["brain_service"] = brain
	}

	if gov, ok := result.Components["governance"]; ok && !gov.Healthy && strings.Contains(gov.Error, "BLOOM_DIR") {
		gov.FixAttempted = true
		gov.FixResult = "Set BLOOM_DIR: System Properties > Environment Variables\n" +
			"  Variable: BLOOM_DIR\n  Value: <path to Bloom project root>\n  Then restart your terminal."
		result.Components["governance"] = gov
	}

	// Fix temporal: must run BEFORE worker fix — worker depends on Temporal being up.
	// Uses `nucleus temporal ensure` which is idempotent and automation-safe.
	if temporal, ok := result.Components["temporal"]; ok && !temporal.Healthy {
		temporal.FixAttempted = true
		nucleusExe, exeErr := getNucleusExecutablePath()
		if exeErr != nil {
			temporal.FixResult = fmt.Sprintf("FAILED: nucleus not found: %v", exeErr)
		} else {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			out, err := exec.CommandContext(ctx, nucleusExe, "temporal", "ensure").CombinedOutput()
			if err != nil {
				temporal.FixResult = fmt.Sprintf("FAILED: temporal ensure: %v — %s", err, string(out))
			} else {
				var ensureResult struct {
					Success bool   `json:"success"`
					State   string `json:"state"`
					PID     int    `json:"pid"`
				}
				if jsonErr := json.Unmarshal(out, &ensureResult); jsonErr == nil && ensureResult.Success {
					temporal.FixResult = fmt.Sprintf("SUCCESS: Temporal started (PID %d) on port 7233", ensureResult.PID)
					temporal.Healthy = true
					temporal.State = "RUNNING"
					temporal.Error = ""
				} else {
					temporal.FixResult = fmt.Sprintf("FAILED: temporal ensure returned: %s", string(out))
				}
			}
		}
		result.Components["temporal"] = temporal
	}

	if worker, ok := result.Components["worker"]; ok && !worker.Healthy {
		worker.FixAttempted = true
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		nucleusExe, exeErr := getNucleusExecutablePath()
		if exeErr != nil {
			worker.FixResult = fmt.Sprintf("FAILED: nucleus not found: %v", exeErr)
		} else {
			// Spawn nucleus worker start detached — must outlive this process.
			// Using exec.Command without context so the child is not killed
			// when the health check context expires.
			cmd := exec.Command(nucleusExe, "worker", "start")
			cmd.Stdout = nil
			cmd.Stderr = nil
			setSvelteProcAttr(cmd) // detach from our process group
			if err := cmd.Start(); err != nil {
				worker.FixResult = fmt.Sprintf("FAILED: %v", err)
			} else {
				go cmd.Wait() //nolint:errcheck
				// Verify worker connected to Temporal task-queue (up to 10s)
				binDir := filepath.Dir(filepath.Dir(nucleusExe))
				temporalBin := filepath.Join(binDir, "temporal", "temporal.exe")
				if _, statErr := os.Stat(temporalBin); statErr != nil {
					if p, lookErr := exec.LookPath("temporal"); lookErr == nil {
						temporalBin = p
					}
				}
				connected := false
				deadline := time.Now().Add(10 * time.Second)
				for time.Now().Before(deadline) {
					out, err := exec.CommandContext(ctx, temporalBin,
						"task-queue", "describe",
						"--task-queue", "profile-orchestration",
						"-o", "json").CombinedOutput()
					if err == nil {
						var tq struct {
							Pollers []struct{ Identity string `json:"identity"` } `json:"pollers"`
						}
						if json.Unmarshal(out, &tq) == nil && len(tq.Pollers) > 0 {
							connected = true
							break
						}
					}
					time.Sleep(1 * time.Second)
				}
				if connected {
					worker.FixResult = fmt.Sprintf("SUCCESS: worker started (PID %d) and connected to profile-orchestration", cmd.Process.Pid)
					worker.Healthy = true
					worker.State = "CONNECTED"
					worker.Error = ""
				} else {
					worker.FixResult = fmt.Sprintf("PARTIAL: worker started (PID %d) but not yet confirmed in task-queue", cmd.Process.Pid)
				}
			}
		}
		result.Components["worker"] = worker
	}

	// Fix control_plane: relaunch bootstrap via nucleus service restart-bootstrap
	if cp, ok := result.Components["control_plane"]; ok && !cp.Healthy {
		cp.FixAttempted = true
		nucleusExe, exeErr := getNucleusExecutablePath()
		if exeErr != nil {
			cp.FixResult = fmt.Sprintf("FAILED: nucleus not found: %v", exeErr)
		} else {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			out, err := exec.CommandContext(ctx, nucleusExe, "--json", "service", "restart-bootstrap").CombinedOutput()
			if err != nil {
				cp.FixResult = fmt.Sprintf("FAILED: %v — %s", err, string(out))
			} else {
				// Parse JSON response from restart-bootstrap
				var restartResult struct {
					Success bool   `json:"success"`
					PID     int    `json:"pid"`
					Error   string `json:"error"`
				}
				if jsonErr := json.Unmarshal(out, &restartResult); jsonErr == nil && restartResult.Success {
					cp.FixResult = fmt.Sprintf("SUCCESS: Control Plane restarted (PID %d) on port 48215", restartResult.PID)
					cp.Healthy = true
					cp.State = "RUNNING"
					cp.Error = ""
				} else if jsonErr == nil && !restartResult.Success {
					cp.FixResult = fmt.Sprintf("FAILED: %s", restartResult.Error)
				} else {
					cp.FixResult = fmt.Sprintf("FAILED: unexpected response: %s", string(out))
				}
			}
		}
		result.Components["control_plane"] = cp
	}

	if ollama, ok := result.Components["ollama"]; ok && !ollama.Healthy {
		ollama.FixAttempted = true
		ollamaBin := resolveOllamaBin()
		if ollamaBin == "" {
			ollama.FixResult = "FAILED: ollama binary not found (checked bin/ollama/ and PATH)"
		} else {
			cmd := exec.Command(ollamaBin, "serve")
			cmd.Stdout = nil
			cmd.Stderr = nil
			setSvelteProcAttr(cmd) // detach del proceso padre igual que svelte_dev
			if err := cmd.Start(); err != nil {
				ollama.FixResult = fmt.Sprintf("FAILED: ollama serve: %v", err)
			} else {
				go cmd.Wait() //nolint:errcheck
				if portErr := waitForPortOpen("localhost:11434", 20*time.Second); portErr != nil {
					ollama.FixResult = fmt.Sprintf("FAILED: ollama started (PID %d) but port 11434 not ready after 20s: %v", cmd.Process.Pid, portErr)
				} else {
					ollama.FixResult = "SUCCESS: ollama serve started"
					ollama.Healthy = true
					ollama.State = "RUNNING"
					ollama.Error = ""
				}
			}
		}
		result.Components["ollama"] = ollama
	}

	if svelte, ok := result.Components["svelte_dev"]; ok && !svelte.Healthy {
		svelte.FixAttempted = true
		if err := fixSvelteDev(); err != nil {
			svelte.FixResult = fmt.Sprintf("FAILED: %v", err)
		} else {
			svelte.FixResult = "SUCCESS: svelte dev server started"
			svelte.Healthy = true
			svelte.State = "RUNNING"
			svelte.Error = ""
		}
		result.Components["svelte_dev"] = svelte
	}

	// Recalculate top-level success/state/error after all fixes have been applied.
	// Without this, result.Success and result.State reflect the pre-fix snapshot
	// even when all components recovered — causing confusing FAILED responses
	// after a successful --fix run.
	recalculateHealthState(result)
}

// recalculateHealthState recomputes result.Success, result.State and result.Error
// from the current state of result.Components. Called after applyFixes() so the
// top-level fields reflect post-fix reality.
//
// Mirror of the evaluate: block in checkSystemHealthParallel — must stay in sync
// if the criticality lists change.
func recalculateHealthState(result *HealthResult) {
	criticalComponents    := []string{"temporal", "worker", "vault", "governance"}
	nonCriticalComponents := []string{"ollama", "control_plane", "brain_service", "bloom_api", "svelte_dev", "worker_manager"}

	criticalFailures, degradedCount := 0, 0
	for _, name := range criticalComponents {
		if comp, ok := result.Components[name]; ok && !comp.Healthy {
			criticalFailures++
		}
	}
	for _, name := range nonCriticalComponents {
		if comp, ok := result.Components[name]; ok && !comp.Healthy {
			degradedCount++
		}
	}

	switch {
	case criticalFailures > 0:
		result.Success = false
		result.State   = "FAILED"
		result.Error   = fmt.Sprintf("%d critical components unhealthy", criticalFailures)
	case degradedCount > 0:
		result.Success = false
		result.State   = "DEGRADED"
		result.Error   = fmt.Sprintf("%d non-critical components unhealthy", degradedCount)
	default:
		result.Success = true
		result.State   = "HEALTHY"
		result.Error   = ""
	}
}

// fixSvelteDev attempts to start the Svelte dev server and waits for port 5173.
// It looks for the project root via BLOOM_DIR or falls back to the nucleus binary's
// parent tree, then runs `npm run dev` detached so the child outlives this process.
func fixSvelteDev() error {
	// Resolve project root: BLOOM_DIR is the canonical source
	projectRoot := getBloomDir()
	if projectRoot == "" {
		// Fallback: locate nucleus binary and walk up to find package.json
		if exe, err := os.Executable(); err == nil {
			dir := filepath.Dir(exe)
			for i := 0; i < 5; i++ {
				if _, err := os.Stat(filepath.Join(dir, "package.json")); err == nil {
					projectRoot = dir
					break
				}
				dir = filepath.Dir(dir)
			}
		}
	}
	if projectRoot == "" {
		return fmt.Errorf("cannot locate project root (BLOOM_DIR not set and package.json not found)")
	}

	// Resolve npm binary — prefer bundled node, fall back to PATH
	npmBin, err := exec.LookPath("npm")
	if err != nil {
		return fmt.Errorf("npm not found in PATH: %v", err)
	}

	// Spawn `npm run dev` detached (no context — we don't want to kill it when
	// the health check context expires)
	cmd := exec.Command(npmBin, "run", "dev")
	cmd.Dir = projectRoot
	cmd.Stdout = nil
	cmd.Stderr = nil
	// SysProcAttr is set in a platform-specific file (health_windows.go / health_unix.go)
	// to ensure the child process is detached from our process group.
	setSvelteProcAttr(cmd)

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to spawn npm run dev in %s: %v", projectRoot, err)
	}

	// Detach — we don't own this process after this point
	go cmd.Wait() //nolint:errcheck

	// Usar "localhost" en lugar de "127.0.0.1" — Vite en Windows escucha en IPv6.
	if err := waitForPortOpen("localhost:5173", 30*time.Second); err != nil {
		return fmt.Errorf("npm run dev started (PID %d) but port 5173 not ready after 30s: %v", cmd.Process.Pid, err)
	}

	return nil
}

// waitForPortOpen polls addr (host:port) until it accepts a TCP connection
// or the timeout expires. addr must be in "host:port" form.
func waitForPortOpen(addr string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", addr, 500*time.Millisecond)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("%s not ready after %s", addr, timeout)
}

func nssmStart(serviceName string, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, "nssm", "start", serviceName).CombinedOutput()
	if err != nil {
		return fmt.Errorf("nssm start %s: %v — %s", serviceName, err, string(out))
	}
	return nil
}

// resolveOllamaBin localiza el binario de ollama.
// Orden de prioridad:
//  1. <LOCALAPPDATA>/BloomNucleus/bin/ollama/ollama.exe — instalación BloomNucleus estándar
//  2. ollama en PATH — instalación standalone del sistema
func resolveOllamaBin() string {
	// Resolver appDataDir igual que InitPaths — siempre LOCALAPPDATA, nunca APPDATA
	localAppData := os.Getenv("LOCALAPPDATA")
	if localAppData == "" {
		localAppData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local")
	}
	appDataDir := os.Getenv("BLOOM_APPDATA_DIR")
	if appDataDir == "" {
		appDataDir = filepath.Join(localAppData, "BloomNucleus")
	}

	candidates := []string{
		filepath.Join(appDataDir, "bin", "ollama", "ollama.exe"),
		filepath.Join(appDataDir, "bin", "ollama", "ollama"),
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	// Fallback: PATH
	if p, err := exec.LookPath("ollama"); err == nil {
		return p
	}
	return ""
}

// ── Individual component checks ───────────────────────────────────────────────

func checkTemporal(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{Port: 7233, GRPCURL: "localhost:7233"}
	start := time.Now()
	conn, err := net.DialTimeout("tcp", "localhost:7233", 2*time.Second)
	health.LatencyMs = time.Since(start).Milliseconds()
	if err != nil {
		health.Healthy = false
		health.State = "UNREACHABLE"
		health.Error = fmt.Sprintf("Port 7233 not accessible: %v", err)
		return health
	}
	conn.Close()
	health.Healthy = true
	health.State = "RUNNING"
	if validate {
		conn, err := net.DialTimeout("tcp", "localhost:8233", 2*time.Second)
		if err != nil {
			health.State = "DEGRADED"
			health.Error = "UI not accessible (port 8233)"
		} else {
			conn.Close()
		}
	}
	return health
}

func checkWorker(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{TaskQueue: "profile-orchestration"}

	s.mu.RLock()
	proc, exists := s.processes["nucleus_worker"]
	s.mu.RUnlock()

	if !exists || proc.State != StateReady {
		pollers, _, err := getTaskQueuePollers(ctx, s.binDir)
		if err != nil {
			health.Healthy = false
			health.State = "FAILED"
			health.Error = err.Error()
			return health
		}
		if len(pollers) > 0 {
			health.Healthy = true
			health.State = "CONNECTED"
			if !exists {
				health.Error = "worker active via Temporal (not tracked by this supervisor instance)"
			}
			return health
		}
		health.Healthy = false
		health.State = "DISCONNECTED"
		if !exists {
			health.Error = "nucleus_worker not in supervisor and no active pollers in profile-orchestration"
		} else {
			health.Error = fmt.Sprintf("Worker state is %s, expected READY; no active pollers confirmed", proc.State)
		}
		return health
	}

	health.Healthy = true
	health.State = "CONNECTED"
	health.PID = proc.PID
	if validate {
		pollers, _, err := getTaskQueuePollers(ctx, s.binDir)
		if err != nil {
			health.State = "DEGRADED"
			health.Error = fmt.Sprintf("Task queue check failed: %v", err)
		} else if len(pollers) == 0 {
			health.State = "DEGRADED"
			health.Error = "process running but no active pollers found in profile-orchestration"
		}
	}
	return health
}

func checkOllama(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{Port: 11434}
	start := time.Now()
	conn, err := net.DialTimeout("tcp", "localhost:11434", 2*time.Second)
	health.LatencyMs = time.Since(start).Milliseconds()
	if err != nil {
		health.Healthy = false
		health.State = "UNREACHABLE"
		health.Error = fmt.Sprintf("Port 11434 not accessible: %v", err)
		return health
	}
	conn.Close()
	health.Healthy = true
	health.State = "RUNNING"
	return health
}

func checkControlPlane(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{Port: 48215}
	// El supervisor que corre health es una instancia nueva — no tiene el proceso
	// en su map. La forma correcta de verificar es el puerto, igual que bloom_api.
	start := time.Now()
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:48215/api/docs")
	health.LatencyMs = time.Since(start).Milliseconds()
	if err != nil {
		// Intentar también el WebSocket port como fallback
		conn, tcpErr := net.DialTimeout("tcp", "127.0.0.1:48215", 1*time.Second)
		if tcpErr != nil {
			health.Healthy = false
			health.State = "DISCONNECTED"
			health.Error = "Port 48215 not accessible (control plane not running)"
			return health
		}
		conn.Close()
		health.Healthy = true
		health.State = "RUNNING"
		return health
	}
	defer resp.Body.Close()
	if resp.StatusCode == 200 || resp.StatusCode == 302 || resp.StatusCode == 404 {
		health.Healthy = true
		health.State = "RUNNING"
	} else {
		health.Healthy = false
		health.State = "DEGRADED"
		health.Error = fmt.Sprintf("HTTP status %d", resp.StatusCode)
	}
	return health
}

func checkVault(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{}
	// En onboarding, BLOOM_DIR inválido implica que el vault tampoco está configurado
	bloomDir := getBloomDir()
	if bloomDir == "" || strings.ContainsAny(bloomDir, "<>|?*") {
		health.Healthy = true
		health.State = "SKIPPED"
		health.Error = "vault check skipped (onboarding mode)"
		return health
	}
	nucleusExe, err := getNucleusExecutablePath()
	if err != nil {
		health.Healthy = false
		health.State = "FAILED"
		health.Error = fmt.Sprintf("nucleus not found: %v", err)
		return health
	}
	// --json es flag global de nucleus, debe ir antes del subcomando
	out, err := exec.CommandContext(ctx, nucleusExe, "--json", "synapse", "vault-status").Output()
	if err != nil {
		// Workflow failure puede significar que el proyecto no está inicializado aún
		health.Healthy = true
		health.State = "SKIPPED"
		health.Error = fmt.Sprintf("vault-status unavailable (pre-onboarding): %v", err)
		return health
	}
	var vResult map[string]interface{}
	if err := json.Unmarshal(out, &vResult); err != nil {
		health.Healthy = false
		health.State = "FAILED"
		health.Error = "vault-status returned invalid JSON"
		return health
	}
	if state, ok := vResult["vault_state"].(string); ok && state == "UNLOCKED" {
		health.Healthy = true
		health.State = "UNLOCKED"
	} else {
		health.Healthy = false
		health.State = "LOCKED"
		health.Error = "Vault is locked"
	}
	return health
}

func checkGovernance(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{}
	bloomDir := getBloomDir()
	if bloomDir == "" {
		health.Healthy = true
		health.State = "SKIPPED"
		health.Error = "BLOOM_DIR not resolvable (onboarding mode)"
		return health
	}
	// Mismo guard que bootGovernance: path inválido en Windows = onboarding
	if strings.ContainsAny(bloomDir, "<>|?*") {
		health.Healthy = true
		health.State = "SKIPPED"
		health.Error = "BLOOM_DIR path invalid (onboarding mode)"
		return health
	}
	ownershipPath := filepath.Join(bloomDir, ".ownership.json")
	if _, err := os.Stat(ownershipPath); err != nil {
		if os.IsNotExist(err) ||
			strings.Contains(err.Error(), "syntax is incorrect") ||
			strings.Contains(err.Error(), "invalid") {
			health.Healthy = true
			health.State = "SKIPPED"
			health.Error = ".ownership.json not found (onboarding mode)"
			return health
		}
		health.Healthy = false
		health.State = "FAILED"
		health.Error = fmt.Sprintf(".ownership.json not accessible: %v", err)
		return health
	}
	health.Healthy = true
	health.State = "VALID"
	if validate {
		data, err := os.ReadFile(ownershipPath)
		if err != nil {
			health.State = "DEGRADED"
			health.Error = fmt.Sprintf("Failed to read .ownership.json: %v", err)
			return health
		}
		var ownership map[string]interface{}
		if err := json.Unmarshal(data, &ownership); err != nil {
			health.State = "DEGRADED"
			health.Error = "Invalid JSON in .ownership.json"
			return health
		}
		for _, field := range []string{"owner", "created_at"} {
			if _, exists := ownership[field]; !exists {
				health.State = "DEGRADED"
				health.Error = fmt.Sprintf("Missing required field: %s", field)
				return health
			}
		}
	}
	return health
}

func checkBrainService(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{Port: 5678}
	start := time.Now()
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 2*time.Second)
	health.LatencyMs = time.Since(start).Milliseconds()
	if err != nil {
		health.Healthy = false
		health.State = "UNREACHABLE"
		health.Error = fmt.Sprintf("Port 5678 not accessible: %v", err)
		return health
	}
	conn.Close()
	health.Healthy = true
	health.State = "RUNNING"
	if validate {
		if err := sendHeartbeatPing(ctx); err != nil {
			health.State = "DEGRADED"
			health.Error = fmt.Sprintf("Heartbeat ping failed: %v", err)
		}
	}
	return health
}

func checkBloomAPI(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{Port: 48215}
	start := time.Now()
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:48215/api/docs")
	health.LatencyMs = time.Since(start).Milliseconds()
	if err != nil {
		health.Healthy = false
		health.State = "UNREACHABLE"
		health.Error = fmt.Sprintf("Port 48215 not accessible: %v", err)
		return health
	}
	defer resp.Body.Close()
	if resp.StatusCode == 200 || resp.StatusCode == 302 {
		health.Healthy = true
		health.State = "RUNNING"
	} else {
		health.Healthy = false
		health.State = "DEGRADED"
		health.Error = fmt.Sprintf("HTTP status %d", resp.StatusCode)
	}
	return health
}

func checkSvelteDev(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{Port: 5173}
	start := time.Now()
	// Vite en Windows escucha en IPv6 ([::1]:5173), no en IPv4 (127.0.0.1:5173).
	// Usar "localhost" permite que el resolver del SO elija la familia correcta.
	conn, err := net.DialTimeout("tcp", "localhost:5173", 2*time.Second)
	health.LatencyMs = time.Since(start).Milliseconds()
	if err != nil {
		health.Healthy = false
		health.State = "UNREACHABLE"
		health.Error = fmt.Sprintf("Port 5173 not accessible: %v", err)
		return health
	}
	conn.Close()
	health.Healthy = true
	health.State = "RUNNING"
	return health
}

func checkWorkerManager(ctx context.Context, s *Supervisor, appDataDir string, validate bool) ComponentHealth {
	health := ComponentHealth{}
	profilesPath := filepath.Join(appDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil {
		if os.IsNotExist(err) {
			health.Healthy = true
			health.State = "READY"
			return health
		}
		health.Healthy = false
		health.State = "FAILED"
		health.Error = fmt.Sprintf("Failed to read profiles.json: %v", err)
		return health
	}
	var registry struct {
		Profiles []struct {
			ProfileID string `json:"profile_id"`
			Status    string `json:"status"`
			PID       int    `json:"pid"`
		} `json:"profiles"`
	}
	if err := json.Unmarshal(data, &registry); err != nil {
		health.Healthy = false
		health.State = "FAILED"
		health.Error = fmt.Sprintf("Invalid profiles.json: %v", err)
		return health
	}
	health.Healthy = true
	if len(registry.Profiles) > 0 {
		health.State = "ACTIVE"
		health.ProfilesCount = len(registry.Profiles)
	} else {
		health.State = "READY"
	}
	return health
}

// ── Human output ──────────────────────────────────────────────────────────────

func printHealthHuman(c *core.Core, result *HealthResult) {
	if result.Success && result.State == "HEALTHY" {
		c.Logger.Printf("[SUCCESS] ✅ System %s", result.State)
	} else {
		c.Logger.Printf("[ERROR] ❌ System %s — %s", result.State, result.Error)
	}

	c.Logger.Printf("[INFO] Components:")
	for name, comp := range result.Components {
		symbol := "✓"
		details := fmt.Sprintf("%s: %s", name, comp.State)
		if comp.Port > 0 {
			details += fmt.Sprintf(" (port %d)", comp.Port)
		}
		if comp.LatencyMs > 0 {
			details += fmt.Sprintf(" [%dms]", comp.LatencyMs)
		}
		if comp.PID > 0 {
			details += fmt.Sprintf(" (PID %d)", comp.PID)
		}
		if comp.ProfilesCount > 0 {
			details += fmt.Sprintf(" (%d profiles)", comp.ProfilesCount)
		}
		if comp.Healthy {
			c.Logger.Printf("[INFO]    %s %s", symbol, details)
		} else {
			symbol = "✗"
			c.Logger.Printf("[ERROR]   %s %s", symbol, details)
			if comp.Error != "" {
				c.Logger.Printf("[ERROR]       ↳ %s", comp.Error)
			}
		}
		if comp.FixAttempted {
			c.Logger.Printf("[INFO]        🔧 %s", comp.FixResult)
		}
	}

	if result.BrainLastErrors != nil {
		c.Logger.Printf("[INFO] ── brain_service.log (last lines) ──")
		for _, line := range result.BrainLastErrors.BrainServiceLog {
			c.Logger.Printf("[INFO]   %s", line)
		}
		c.Logger.Printf("[INFO] ── brain_server_event_bus.log (last lines) ──")
		for _, line := range result.BrainLastErrors.BrainEventBusLog {
			c.Logger.Printf("[INFO]   %s", line)
		}
	}
}

// ── Output helpers ────────────────────────────────────────────────────────────

func outputHealthJSONResult(result *HealthResult) {
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, `{"success":false,"error":"marshal failed: %v"}`+"\n", err)
		return
	}
	fmt.Println(string(data))
}

// ── Misc helpers ──────────────────────────────────────────────────────────────

func isPIDAlive(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return process.Signal(syscall.Signal(0)) == nil
}

func sendHeartbeatPing(ctx context.Context) error {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 2*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()
	data, _ := json.Marshal(map[string]interface{}{
		"type":      "PING",
		"timestamp": time.Now().UnixNano(),
	})
	if _, err := conn.Write(data); err != nil {
		return err
	}
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var response map[string]interface{}
	return json.NewDecoder(conn).Decode(&response)
}