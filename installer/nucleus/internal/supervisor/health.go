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
	Timestamp       int64                      `json:"timestamp"`
	BrainLastErrors *BrainLastErrors           `json:"brain_last_errors,omitempty"`
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

			if fix {
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

evaluate:
	criticalComponents := []string{"temporal", "worker", "control_plane", "vault", "governance"}
	nonCriticalComponents := []string{"ollama", "brain_service", "bloom_api", "svelte_dev", "worker_manager"}

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
			brain.FixResult = "SUCCESS: BloomBrainService started via NSSM"
			brain.Healthy = true
			brain.State = "RUNNING"
			brain.Error = ""
		}
		result.Components["brain_service"] = brain
	}

	if gov, ok := result.Components["governance"]; ok && !gov.Healthy && strings.Contains(gov.Error, "BLOOM_DIR") {
		gov.FixAttempted = true
		gov.FixResult = "Set BLOOM_DIR: System Properties > Environment Variables\n" +
			"  Variable: BLOOM_DIR\n  Value: <path to Bloom project root>\n  Then restart your terminal."
		result.Components["governance"] = gov
	}

	if worker, ok := result.Components["worker"]; ok && !worker.Healthy {
		worker.FixAttempted = true
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		nucleusExe, exeErr := getNucleusExecutablePath()
		if exeErr != nil {
			worker.FixResult = fmt.Sprintf("FAILED: nucleus not found: %v", exeErr)
		} else {
			out, err := exec.CommandContext(ctx, nucleusExe, "worker", "start").CombinedOutput()
			if err != nil {
				worker.FixResult = fmt.Sprintf("FAILED: %v — %s", err, string(out))
			} else {
				worker.FixResult = "SUCCESS: nucleus worker start executed"
			}
		}
		result.Components["worker"] = worker
	}
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
	health := ComponentHealth{TaskQueue: "nucleus-task-queue"}
	s.mu.RLock()
	proc, exists := s.processes["nucleus_worker"]
	s.mu.RUnlock()

	if !exists || proc.State != StateReady {
		// Fallback: el worker puede estar vivo aunque no haya sido spawnado
		// por este proceso (e.g. service restart, NSSM). Verificar via
		// temporal task-queue describe — si hay pollers activos, está conectado.
		tqCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		out, err := exec.CommandContext(tqCtx, "temporal", "task-queue", "describe",
			"--task-queue", "nucleus-task-queue").CombinedOutput()
		if err == nil && len(out) > 0 && !bytes.Contains(out, []byte("\"pollers\":[]")) {
			// Temporal confirma que hay workers conectados en este task-queue
			health.Healthy = true
			health.State = "CONNECTED"
			health.Error = "worker not tracked by supervisor (external process)"
			return health
		}
		// Sin pollers confirmados — realmente desconectado
		health.Healthy = false
		health.State = "DISCONNECTED"
		if !exists {
			health.Error = "Worker not found in supervisor and no active pollers in task-queue"
		} else {
			health.Error = fmt.Sprintf("Worker state is %s, expected READY; no active pollers confirmed", proc.State)
		}
		return health
	}

	health.Healthy = true
	health.State = "CONNECTED"
	health.PID = proc.PID
	if validate {
		out, err := exec.CommandContext(ctx, "temporal", "task-queue", "describe",
			"--task-queue", "nucleus-task-queue").CombinedOutput()
		if err != nil {
			health.State = "DEGRADED"
			health.Error = fmt.Sprintf("Task queue check failed: %v — %s", err, string(out))
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
	health := ComponentHealth{}
	s.mu.RLock()
	proc, exists := s.processes["control_plane_api"]
	s.mu.RUnlock()
	if !exists {
		health.Healthy = false
		health.State = "DISCONNECTED"
		health.Error = "Control plane not found in supervisor"
		return health
	}
	health.Healthy = true
	health.State = "RUNNING"
	health.PID = proc.PID
	return health
}

func checkVault(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{}
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
		health.Healthy = false
		health.State = "FAILED"
		health.Error = fmt.Sprintf("vault-status workflow failed: %v", err)
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
	bloomDir := os.Getenv("BLOOM_DIR")
	if bloomDir == "" {
		health.Healthy = false
		health.State = "FAILED"
		health.Error = "BLOOM_DIR environment variable not set"
		return health
	}
	ownershipPath := filepath.Join(bloomDir, ".ownership.json")
	if _, err := os.Stat(ownershipPath); err != nil {
		health.Healthy = false
		health.State = "FAILED"
		health.Error = fmt.Sprintf(".ownership.json not found: %v", err)
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
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5173", 2*time.Second)
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