// File: internal/supervisor/service.go
// Core supervisor business logic + registro del comando "service"
// Sigue Guía Maestra de Implementación Comandos NUCLEUS v2.0
package supervisor

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"nucleus/internal/core"

	"github.com/spf13/cobra"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
)

// ProcessState represents the lifecycle state of a managed process
type ProcessState string

const (
	StateIdle      ProcessState = "IDLE"
	StateStarting  ProcessState = "STARTING"
	StateReady     ProcessState = "READY"
	StateDegraded  ProcessState = "DEGRADED"
	StateFailed    ProcessState = "FAILED"
	StateStopping  ProcessState = "STOPPING"
	StateStopped   ProcessState = "STOPPED"
)

// ManagedProcess represents a process under supervision
type ManagedProcess struct {
	Name      string
	Cmd       *exec.Cmd
	PID       int
	State     ProcessState
	LogPath   string
	StartedAt time.Time
	mu        sync.RWMutex
}

// Supervisor manages all Nucleus processes
type Supervisor struct {
	processes       map[string]*ManagedProcess
	logsDir         string
	binDir          string
	mu              sync.RWMutex
	supervisorCtx   context.Context // lives for the duration of the service; used by watchWorker
	workerWatchOnce   sync.Once       // ensures only one watchWorker goroutine runs per supervisor
	temporalWatchOnce sync.Once       // ensures only one watchTemporal goroutine runs per supervisor
	log             *core.Logger    // structured logger — nil until initLogger() is called
}

// NewSupervisor creates a new process supervisor
func NewSupervisor(logsDir, binDir string) *Supervisor {
	return &Supervisor{
		processes:     make(map[string]*ManagedProcess),
		logsDir:       logsDir,
		binDir:        binDir,
		supervisorCtx: context.Background(), // overridden by service start before boot
	}
}

// ============================================================================
// PID FILE PERSISTENCE
// ============================================================================
//
// BUG (confirmado 2026-07-28): "nucleus service stop/restart-bootstrap/status"
// crean un Supervisor nuevo por invocación (processes: make(map[...]) vacío).
// El único proceso con el mapa poblado es el de "nucleus service start", que
// vive bloqueado en <-sigCh en SU PROPIO proceso OS — ese mapa nunca se
// comparte. Resultado: stop nunca mata el proceso real, restart-bootstrap
// spawnea un bundle.js nuevo que choca por puerto contra el viejo (que nunca
// murió) y crashea, y status siempre reporta IDLE.
//
// Fix: pidfiles en disco bajo <install>/run/<name>.pid, escritos por quien
// spawnea el proceso y leídos por cualquier invocación posterior del CLI.
// Se eligió pidfile sobre socket de control IPC porque:
//   (a) sobrevive a que el proceso "start" esté colgado o no responda —
//       igual se puede matar por PID leído del archivo;
//   (b) no requiere mantener un listener adicional corriendo;
//   (c) es el mecanismo estándar para este tipo de supervisión y no choca
//       con cómo NSSM ya gestiona el proceso "start" en Windows.
// Trade-off: puede quedar stale si el proceso muere sin limpiar su pidfile —
// por eso isProcessAlive() siempre valida el PID antes de confiar en él, y
// killByPidFile() borra el pidfile aunque el proceso ya esté muerto.
//
// managedProcessNames enumera los procesos que pasan por este mecanismo.
// svelte_dev queda fuera intencionalmente — ver el comentario en Shutdown().
var managedProcessNames = []string{"temporal_server", "nucleus_worker", "brain_server", "control_plane_api"}

func runDir(binDir string) string {
	// binDir es <install>/bin — el run dir vive un nivel arriba, junto a logs/.
	return filepath.Join(filepath.Dir(binDir), "run")
}

func pidFilePath(binDir, name string) string {
	return filepath.Join(runDir(binDir), name+".pid")
}

// writePidFile persists the PID of a just-spawned process so a *different*
// CLI invocation can find and kill it later. Must be called immediately
// after cmd.Start() succeeds, while proc.PID is known-fresh.
func writePidFile(binDir, name string, pid int) error {
	dir := runDir(binDir)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create run dir: %w", err)
	}
	return os.WriteFile(pidFilePath(binDir, name), []byte(strconv.Itoa(pid)), 0644)
}

func readPidFile(binDir, name string) (int, error) {
	data, err := os.ReadFile(pidFilePath(binDir, name))
	if err != nil {
		return 0, err
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(data)))
	if err != nil {
		return 0, fmt.Errorf("corrupt pidfile for %s: %w", name, err)
	}
	return pid, nil
}

func removePidFile(binDir, name string) {
	_ = os.Remove(pidFilePath(binDir, name))
}

// isProcessAlive checks whether a PID is still running. On Unix, signaling 0
// is a pure existence/permission check — the kernel does not actually
// deliver a signal to the target process.
//
// NOTE (Windows): os.Process.Signal(syscall.Signal(0)) is not reliable under
// the Windows/NSSM deployment target. This needs a build-tagged
// implementation (e.g. OpenProcess via golang.org/x/sys/windows) before this
// ships there. Out of scope here — the bug was reproduced and this fix is
// verified on the Linux/macOS dev loop; flagging the Windows gap explicitly
// rather than silently shipping a check that lies on that platform.
func isProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return proc.Signal(syscall.Signal(0)) == nil
}

// killByPidFile reads the pidfile for name, confirms the process is still
// alive, sends SIGTERM, waits up to timeout for a graceful exit, and
// force-kills with SIGKILL if it doesn't die in time. It always removes the
// pidfile before returning — a stale entry must never block the next
// stop/restart. Returns the PID that was targeted (0 if no pidfile existed).
//
// Callers that need to relaunch the same service on the same port (e.g.
// restart-bootstrap) MUST wait for this to return before spawning the
// replacement: that ordering is what eliminates the EADDRINUSE race that let
// the old process silently win the health check against a "successfully
// restarted" new one.
func killByPidFile(binDir, name string, timeout time.Duration) (int, error) {
	pid, err := readPidFile(binDir, name)
	if err != nil {
		return 0, nil // no pidfile — nothing to kill, not an error
	}
	defer removePidFile(binDir, name)

	if !isProcessAlive(pid) {
		return pid, nil // stale pidfile — process already gone
	}

	proc, ferr := os.FindProcess(pid)
	if ferr != nil {
		return pid, ferr
	}
	if err := proc.Signal(syscall.SIGTERM); err != nil {
		// Process may have exited between the isProcessAlive check and here.
		if !isProcessAlive(pid) {
			return pid, nil
		}
		return pid, err
	}

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !isProcessAlive(pid) {
			return pid, nil
		}
		time.Sleep(200 * time.Millisecond)
	}

	// Didn't exit gracefully within timeout — force kill.
	_ = proc.Kill()
	killDeadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(killDeadline) {
		if !isProcessAlive(pid) {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	return pid, nil
}

// initLogger initialises the structured service logger using InitServiceLogger.
// Must be called once before boot, after Paths are resolved.
// Falls back to stderr silently if the logger cannot be created — boot must not
// fail because of a logging error.
func (s *Supervisor) initLogger(c *core.Core) {
	l, err := core.InitServiceLogger(&c.Paths, c.IsJSON)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[WARN] supervisor: could not init service logger: %v\n", err)
		return
	}
	s.log = l
}

// slog emits a leveled log line through the structured service logger when
// available, falling back to stderr so nothing is ever lost.
// level must be one of: INFO, WARN, ERROR, SUCCESS.
func (s *Supervisor) slog(level, format string, args ...any) {
	if s.log == nil {
		ts := time.Now().UTC().Format("2006/01/02 15:04:05")
		fmt.Fprintf(os.Stderr, "%s [%s] "+format+"\n", append([]any{ts, level}, args...)...)
		return
	}
	switch level {
	case "INFO":
		s.log.Info(format, args...)
	case "WARN":
		s.log.Warning(format, args...)
	case "ERROR":
		s.log.Error(format, args...)
	case "SUCCESS":
		s.log.Success(format, args...)
	default:
		s.log.Info(format, args...)
	}
}

// VaultStatusResult represents the response from vault-status workflow
type VaultStatusResult struct {
	Success             bool   `json:"success"`
	VaultState          string `json:"vault_state"`
	MasterProfileActive bool   `json:"master_profile_active"`
	State               string `json:"state"`
	Error               string `json:"error,omitempty"`
	Timestamp           int64  `json:"timestamp"`
}

// StartOllamaResult represents the response from start-ollama workflow
type StartOllamaResult struct {
	Success   bool   `json:"success"`
	PID       int    `json:"pid,omitempty"`
	Port      int    `json:"port"`
	State     string `json:"state"`
	Error     string `json:"error,omitempty"`
	Timestamp int64  `json:"timestamp"`
}

// ============================================================================
// BINARY RESOLUTION HELPERS
// ============================================================================

// resolveTemporalBin returns the absolute path to the temporal binary.
// Tries without extension first (macOS/Linux), then with .exe (Windows),
// then falls back to PATH.
func resolveTemporalBin(binDir string) (string, error) {
	candidates := []string{
		filepath.Join(binDir, "temporal", "temporal"),     // macOS / Linux
		filepath.Join(binDir, "temporal", "temporal.exe"), // Windows
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c, nil
		}
	}
	if p, err := exec.LookPath("temporal"); err == nil {
		return p, nil
	}
	return "", fmt.Errorf("temporal binary not found at %s or in PATH",
		filepath.Join(binDir, "temporal", "temporal[.exe]"))
}

// resolveNucleusBin returns the absolute path to the nucleus binary.
// Tries without extension first (macOS/Linux), then with .exe (Windows),
// then falls back to PATH.
func resolveNucleusBin(binDir string) (string, error) {
	candidates := []string{
		filepath.Join(binDir, "nucleus", "nucleus"),     // macOS / Linux
		filepath.Join(binDir, "nucleus", "nucleus.exe"), // Windows
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c, nil
		}
	}
	if p, err := exec.LookPath("nucleus"); err == nil {
		return p, nil
	}
	return "", fmt.Errorf("nucleus binary not found at %s or in PATH",
		filepath.Join(binDir, "nucleus", "nucleus[.exe]"))
}

// resolveNodeBin returns the absolute path to the node binary.
// Tries without extension first (macOS/Linux), then with .exe (Windows),
// then falls back to "node" (system PATH).
func resolveNodeBin(binDir string) string {
	candidates := []string{
		filepath.Join(binDir, "node", "node"),     // macOS / Linux
		filepath.Join(binDir, "node", "node.exe"), // Windows
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return "node" // fallback to system PATH
}

// ============================================================================
// TEMPORAL SERVER MANAGEMENT
// ============================================================================

// startTemporalServer starts Temporal Server as a subprocess
func (s *Supervisor) startTemporalServer(ctx context.Context) (*ManagedProcess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if already running in this supervisor instance
	if proc, exists := s.processes["temporal_server"]; exists {
		if proc.State == StateReady {
			return proc, nil
		}
	}

	// Check if already listening on port 7233 — handles the case where
	// a previous supervisor instance started Temporal (e.g. service restart loop).
	if conn, err := net.DialTimeout("tcp", "localhost:7233", 1*time.Second); err == nil {
		conn.Close()
		proc := &ManagedProcess{
			Name:      "temporal_server",
			Cmd:       nil,
			State:     StateReady,
			StartedAt: time.Now(),
		}
		s.processes["temporal_server"] = proc
		s.slog("INFO", "✓ Temporal server already running on port 7233 — skipping start")
		return proc, nil
	}

	// Find Temporal binary (cross-platform: tries without .exe first)
	temporalBin, err := resolveTemporalBin(s.binDir)
	if err != nil {
		return nil, err
	}

	// Generate log filename with date
	today := time.Now()
	dateStr := fmt.Sprintf("%04d%02d%02d", today.Year(), today.Month(), today.Day())
	logPath := filepath.Join(s.logsDir, "temporal", "server", fmt.Sprintf("temporal_server_%s.log", dateStr))
	
	if err := os.MkdirAll(filepath.Dir(logPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create temporal log directory: %w", err)
	}

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to create temporal log file: %w", err)
	}

	// CRÍTICO: exec.Command SIN contexto — Temporal es un servidor de larga duración
	// que debe sobrevivir al bootCtx (120s). Con CommandContext, Go lo mataría cuando
	// el ctx del boot expire, causando que el worker pierda conexión silenciosamente.
	cmd := exec.Command(temporalBin, "server", "start-dev")
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Dir = filepath.Dir(temporalBin) // Set working directory

	// Start Temporal Server
	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("failed to start temporal server: %w", err)
	}

	proc := &ManagedProcess{
		Name:      "temporal_server",
		Cmd:       cmd,
		PID:       cmd.Process.Pid,
		State:     StateStarting,
		LogPath:   logPath,
		StartedAt: time.Now(),
	}

	s.processes["temporal_server"] = proc
	if err := writePidFile(s.binDir, "temporal_server", proc.PID); err != nil {
		s.slog("WARN", "failed to write temporal_server pidfile: %v", err)
	}

	// Monitor process in background
	go s.monitorProcess(proc, logFile)

	// Launch Temporal watchdog — relaunches Temporal if it dies unexpectedly.
	// Same pattern as workerWatchOnce: only one goroutine per supervisor lifetime.
	s.temporalWatchOnce.Do(func() {
		go s.watchTemporal()
	})

	return proc, nil
}

// waitForTemporalReady waits for Temporal Server to be ready via gRPC health check
func (s *Supervisor) waitForTemporalReady(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	hostPort := "localhost:7233"

	for time.Now().Before(deadline) {
		// grpc.NewClient es el reemplazo de grpc.Dial (no deprecado desde gRPC-Go v1.63+).
		// No usamos grpc.WithBlock — preferimos reintentar el health check manualmente
		// para tener control sobre el timeout por intento sin bloquear el goroutine
		// indefinidamente si gRPC nunca resuelve el host.
		conn, err := grpc.NewClient(hostPort,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
		)
		if err == nil {
			// Connection object created, try health check with short timeout
			healthClient := healthpb.NewHealthClient(conn)
			checkCtx, checkCancel := context.WithTimeout(ctx, 2*time.Second)
			resp, checkErr := healthClient.Check(checkCtx, &healthpb.HealthCheckRequest{})
			checkCancel()
			conn.Close()

			if checkErr == nil && resp.Status == healthpb.HealthCheckResponse_SERVING {
				// Update process state and telemetry
				if proc, exists := s.processes["temporal_server"]; exists {
					proc.mu.Lock()
					proc.State = StateReady
					proc.mu.Unlock()
					s.updateTemporalTelemetry(proc)
				}
				return nil
			}
		}

		// Wait before retrying
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(500 * time.Millisecond):
			// Continue retry loop
		}
	}

	return fmt.Errorf("temporal server not ready after %v", timeout)
}

// waitForWorkerReady polls Temporal task-queue until at least one poller is active
// or the timeout expires. Uses absolute temporal binary path to avoid PATH issues.
func (s *Supervisor) waitForWorkerReady(timeout time.Duration) error {
	// Find Temporal binary (cross-platform: tries without .exe first)
	temporalBin, err := resolveTemporalBin(s.binDir)
	if err != nil {
		return err
	}

	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		out, err := exec.Command(temporalBin, "task-queue", "describe",
			"--task-queue", "profile-orchestration",
			"-o", "json").CombinedOutput()
		if err == nil && len(out) > 0 {
			var tqResult struct {
				Pollers []struct {
					Identity string `json:"identity"`
				} `json:"pollers"`
			}
			if jsonErr := json.Unmarshal(out, &tqResult); jsonErr == nil && len(tqResult.Pollers) > 0 {
				return nil
			}
		}
		time.Sleep(1 * time.Second)
	}
	return fmt.Errorf("no active pollers on profile-orchestration after %v", timeout)
}

// updateTemporalTelemetry registers the Temporal Server stream via nucleus telemetry register.
func (s *Supervisor) updateTemporalTelemetry(proc *ManagedProcess) {
	s.registerStream(
		"temporal_server",
		"⏱️ TEMPORAL SERVER",
		proc.LogPath,
		"Temporal Server log — workflow engine process managed by the Nucleus supervisor",
		"nucleus",
		1,
		[]string{"nucleus"},
	)
}

// ============================================================================
// WORKER MANAGER
// ============================================================================

// startWorkerManager starts the Temporal Worker Manager as a subprocess
func (s *Supervisor) startWorkerManager(ctx context.Context) (*ManagedProcess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if already running in this supervisor instance
	if proc, exists := s.processes["nucleus_worker"]; exists {
		if proc.State == StateReady {
			return proc, nil
		}
	}

	// Check if a worker is already polling the task queue from a previous
	// supervisor instance (e.g. service restart loop).
	if pollers, _, err := getTaskQueuePollers(ctx, s.binDir); err == nil && len(pollers) > 0 {
		proc := &ManagedProcess{
			Name:      "nucleus_worker",
			Cmd:       nil,
			State:     StateReady,
			StartedAt: time.Now(),
		}
		s.processes["nucleus_worker"] = proc
		s.slog("INFO", "✓ Worker already active in profile-orchestration — skipping start")
		return proc, nil
	}

	// Find nucleus binary (cross-platform: tries without .exe first)
	nucleusBin, err := resolveNucleusBin(s.binDir)
	if err != nil {
		return nil, err
	}

	// Generate log filename with date
	today := time.Now()
	dateStr := fmt.Sprintf("%04d%02d%02d", today.Year(), today.Month(), today.Day())
	logPath := filepath.Join(s.logsDir, "nucleus", "worker", fmt.Sprintf("worker_manager_%s.log", dateStr))
	
	if err := os.MkdirAll(filepath.Dir(logPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create worker log directory: %w", err)
	}

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to create worker log file: %w", err)
	}

	// Build descriptive worker identity for Temporal.
	// Format: nucleus-worker/{version}@{hostname}/{task-queue}
	// This replaces the default PID@hostname identity with something
	// human-readable in the workers panel and Temporal UI.
	// The worker Go code should read NUCLEUS_WORKER_IDENTITY via:
	//   identity := os.Getenv("NUCLEUS_WORKER_IDENTITY")
	//   if identity == "" { identity = fmt.Sprintf("%d@%s", os.Getpid(), hostname) }
	//   worker.Options{ Identity: identity }
	hostname, _ := os.Hostname()
	nucleusVersion := os.Getenv("NUCLEUS_VERSION")
	if nucleusVersion == "" {
		nucleusVersion = "dev"
	}
	workerIdentity := fmt.Sprintf("nucleus-worker/%s@%s/profile-orchestration", nucleusVersion, hostname)

	// CRÍTICO: exec.Command SIN contexto — el worker es un proceso de larga duración
	// que debe sobrevivir al ctx del boot (120s). Con CommandContext, Go lo mataría
	// cuando bootCtx expire. Mismo patrón que startBrainServer.
	cmd := exec.Command(nucleusBin, "worker", "start")
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Dir = filepath.Dir(nucleusBin)
	cmd.Env = append(os.Environ(), "NUCLEUS_WORKER_IDENTITY="+workerIdentity)

	// Start Worker Manager
	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("failed to start worker manager: %w", err)
	}

	proc := &ManagedProcess{
		Name:      "nucleus_worker",
		Cmd:       cmd,
		PID:       cmd.Process.Pid,
		State:     StateStarting,
		LogPath:   logPath,
		StartedAt: time.Now(),
	}

	s.processes["nucleus_worker"] = proc
	if err := writePidFile(s.binDir, "nucleus_worker", proc.PID); err != nil {
		s.slog("WARN", "failed to write nucleus_worker pidfile: %v", err)
	}

	// Monitor process in background
	go s.monitorProcess(proc, logFile)

	// Confirm worker is connected to Temporal task-queue via real JSON poll.
	// Timeout reduced to 10s — worker connects in <2s per logs.
	if err := s.waitForWorkerReady(10 * time.Second); err != nil {
		proc.mu.Lock()
		proc.State = StateDegraded
		proc.mu.Unlock()
		s.slog("WARN", "Worker not confirmed in task-queue after 10s: %v", err)
	} else {
		proc.mu.Lock()
		proc.State = StateReady
		proc.mu.Unlock()
	}

	// Update telemetry
	s.updateWorkerTelemetry(proc)

	// Launch watchdog — restarts the worker automatically if it dies unexpectedly.
	// watchWorker is idempotent: subsequent calls to startWorkerManager (from the
	// watchdog itself on restart) do NOT launch a second watchdog because by then
	// the existing goroutine is already in its Wait() call for the new process.
	// The once guard below ensures only one watchdog runs per supervisor lifetime.
	s.workerWatchOnce.Do(func() {
		go s.watchWorker()
	})

	return proc, nil
}

// updateWorkerTelemetry registers the Worker Manager stream via nucleus telemetry register.
func (s *Supervisor) updateWorkerTelemetry(proc *ManagedProcess) {
	s.registerStream(
		"worker_manager",
		"🔧 WORKER MANAGER",
		proc.LogPath,
		"Temporal Worker Manager log — processes workflow tasks from the profile-orchestration queue",
		"nucleus",
		2,
		[]string{"nucleus"},
	)
}

// ============================================================================
// BRAIN SERVER MANAGEMENT
// ============================================================================

// isBrainRunning verifica si Brain ya está escuchando en puerto 5678.
// Si está corriendo, NO lo tocamos — evita restart innecesario.
func (s *Supervisor) isBrainRunning() bool {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 1*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// startBrainServer levanta brain.exe server start como proceso gestionado.
//
// Brain está escrito en Python (PyInstaller frozen) y `server start` es
// BLOQUEANTE — el proceso queda corriendo hasta recibir SIGTERM.
// Por eso usamos cmd.Start() (spawn desacoplado) en lugar de cmd.Run().
//
// Si Brain ya está corriendo en puerto 5678, retorna sin tocarlo.
func (s *Supervisor) startBrainServer(ctx context.Context) (*ManagedProcess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Si ya está en el mapa del supervisor y está listo, no hacer nada.
	if proc, exists := s.processes["brain_server"]; exists {
		if proc.State == StateReady {
			return proc, nil
		}
	}

	// Verificar si ya está corriendo externamente (e.g. levantado a mano).
	// En ese caso lo registramos como proceso externo sin spawnear uno nuevo.
	if s.isBrainRunning() {
		proc := &ManagedProcess{
			Name:      "brain_server",
			Cmd:       nil, // proceso externo, no gestionado por nosotros
			PID:       0,
			State:     StateReady,
			StartedAt: time.Now(),
		}
		s.processes["brain_server"] = proc
		s.slog("INFO", "✓ Brain Server already running on port 5678 — skipping start")
		return proc, nil
	}

	// Resolver ruta del binario: binDir/brain/brain (macOS/Linux) o brain.exe (Windows)
	brainBin := filepath.Join(s.binDir, "brain", "brain")
	if _, err := os.Stat(brainBin); err != nil {
		brainBin = filepath.Join(s.binDir, "brain", "brain.exe")
		if _, err := os.Stat(brainBin); err != nil {
			return nil, fmt.Errorf("brain binary not found at %s", filepath.Join(s.binDir, "brain", "brain[.exe]"))
		}
	}

	// Log file con fecha
	today := time.Now()
	dateStr := fmt.Sprintf("%04d%02d%02d", today.Year(), today.Month(), today.Day())
	logPath := filepath.Join(s.logsDir, "brain", "service", fmt.Sprintf("brain_service_%s.log", dateStr))

	if err := os.MkdirAll(filepath.Dir(logPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create brain log directory: %w", err)
	}

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to create brain log file: %w", err)
	}

	// brain.exe service start — proceso de larga duración, DEBE sobrevivir al
	// contexto de boot. Usar exec.Command SIN contexto, igual que startSvelteDev.
	// Si usáramos exec.CommandContext(bootCtx, ...), Go mandaría SIGKILL a Brain
	// cuando bootCtx expire a los 120s — matando el servicio silenciosamente.
	cmd := exec.Command(brainBin, "service", "start")
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Dir = filepath.Dir(brainBin)
	setSvelteProcAttr(cmd) // detach del grupo de procesos del padre

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("failed to spawn brain server: %w", err)
	}

	proc := &ManagedProcess{
		Name:      "brain_server",
		Cmd:       cmd,
		PID:       cmd.Process.Pid,
		State:     StateStarting,
		LogPath:   logPath,
		StartedAt: time.Now(),
	}

	s.processes["brain_server"] = proc
	if err := writePidFile(s.binDir, "brain_server", proc.PID); err != nil {
		s.slog("WARN", "failed to write brain_server pidfile: %v", err)
	}

	// Monitor en background — actualiza State cuando el proceso termina
	go s.monitorProcess(proc, logFile)

	return proc, nil
}

// waitForBrainReady espera hasta que Brain esté escuchando en puerto 5678.
func (s *Supervisor) waitForBrainReady(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if s.isBrainRunning() {
			s.mu.Lock()
			if proc, exists := s.processes["brain_server"]; exists {
				proc.mu.Lock()
				proc.State = StateReady
				proc.mu.Unlock()
			}
			s.mu.Unlock()
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("brain server not ready after %v — check logs in brain/service/", timeout)
}

// updateBrainTelemetry registra el stream de Brain en telemetry.json
func (s *Supervisor) updateBrainTelemetry(proc *ManagedProcess) {
	s.registerStream(
		"brain_service",
		"🧠 BRAIN SERVER",
		proc.LogPath,
		"Brain TCP server log — central event bus for Chrome Native Host connections",
		"brain",
		1,
		[]string{"brain", "synapse"},
	)
}

// ============================================================================
// EXISTING METHODS (unchanged)
// ============================================================================

// CheckVaultStatus consulta el estado LOCAL del vault (vault.json en disco).
//
// NOTA (2026-07-29): originalmente esto llamaba a "synapse vault-status",
// que ejecuta VaultStatusWorkflow vía Temporal → activity "brain.QueryVaultStatus".
// Esa activity nunca fue implementada del lado de Brain — server_manager.py
// no tiene ningún message handler que responda una query de vault (solo existe
// VAULT_INITIALIZED, que es una notificación unidireccional de onboarding, sin
// estado consultable). El workflow terminaba en ActivityNotRegisteredError o,
// antes del fix de TaskQueue, colgado 120s sin respuesta posible.
//
// Mientras se diseña esa capacidad en Brain (ver seguimiento aparte), dev-start
// usa el check local equivalente: "nucleus vault status" (vault.go), que lee
// vault.json directamente — sin Temporal, sin Brain, sin red.
func (s *Supervisor) CheckVaultStatus(ctx context.Context) (*VaultStatusResult, error) {
	// Find nucleus binary (cross-platform: tries without .exe first)
	nucleusBin, err := resolveNucleusBin(s.binDir)
	if err != nil {
		return nil, err
	}

	cmd := exec.CommandContext(ctx, nucleusBin, "--json", "vault", "status")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("local vault status check failed: %w (output: %s)", err, string(output))
	}

	// "vault status" (vault.go) responde con su propio shape local
	// (VaultStatus: locked/key_count/last_access/master_key_id), distinto
	// del shape de VaultStatusResult que usaba el workflow — se traduce acá.
	var localStatus struct {
		Locked      bool   `json:"locked"`
		KeyCount    int    `json:"key_count"`
		LastAccess  string `json:"last_access"`
		MasterKeyID string `json:"master_key_id"`
	}
	if err := json.Unmarshal(output, &localStatus); err != nil {
		return nil, fmt.Errorf("invalid JSON response from vault status: %w (output: %s)", err, string(output))
	}

	result := &VaultStatusResult{
		Success:   true,
		State:     "HEALTHY",
		Timestamp: time.Now().Unix(),
	}
	if localStatus.Locked {
		result.VaultState = "LOCKED"
	} else {
		result.VaultState = "UNLOCKED"
	}
	// MasterProfileActive requiere que Brain sepa qué perfil está corriendo —
	// el check local no tiene esa información. Queda en false hasta que la
	// query real a Brain se implemente; no bloquea el boot, Phase 5 solo
	// aborta dev-start si CheckVaultStatus retorna error, no por este campo.
	result.MasterProfileActive = false

	return result, nil
}

// StartOllama starts Ollama service via Synapse
func (s *Supervisor) StartOllama(ctx context.Context) (*StartOllamaResult, error) {
	// Find nucleus binary (cross-platform: tries without .exe first)
	nucleusBin, err := resolveNucleusBin(s.binDir)
	if err != nil {
		return nil, err
	}

	cmd := exec.CommandContext(ctx, nucleusBin, "--json", "synapse", "start-ollama")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("start-ollama workflow failed: %w (output: %s)", err, string(output))
	}

	var result StartOllamaResult
	if err := json.Unmarshal(output, &result); err != nil {
		return nil, fmt.Errorf("invalid JSON response from start-ollama: %w", err)
	}

	if result.State == "FAILED" {
		return nil, fmt.Errorf("ollama start failed: %s", result.Error)
	}

	if !result.Success {
		return nil, fmt.Errorf("ollama failed to start: %s", result.Error)
	}

	return &result, nil
}

// StartNodeProcess starts a Node.js process with logging
func (s *Supervisor) StartNodeProcess(ctx context.Context, name string, scriptPath string, env []string) (*ManagedProcess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if already running
	if proc, exists := s.processes[name]; exists {
		if proc.State == StateReady {
			return proc, nil
		}
	}

	// Create log file
	logPath := filepath.Join(s.logsDir, "server", fmt.Sprintf("%s_%d.log", name, time.Now().Unix()))
	if err := os.MkdirAll(filepath.Dir(logPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create log directory: %w", err)
	}

	logFile, err := os.Create(logPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create log file: %w", err)
	}

	// Get Node.js binary (cross-platform: tries without .exe first)
	nodePath := resolveNodeBin(s.binDir)

	// Create command
	cmd := exec.CommandContext(ctx, nodePath, scriptPath)
	cmd.Env = append(os.Environ(), env...)
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	// Start process
	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("failed to start process: %w", err)
	}

	proc := &ManagedProcess{
		Name:      name,
		Cmd:       cmd,
		PID:       cmd.Process.Pid,
		State:     StateStarting,
		LogPath:   logPath,
		StartedAt: time.Now(),
	}

	s.processes[name] = proc

	// Monitor process
	go s.monitorProcess(proc, logFile)

	return proc, nil
}

// registerStream registra un stream de proceso via nucleus telemetry register.
// Es la única forma correcta de escribir a telemetry.json desde el supervisor —
// delega en registerStreamCLI que maneja locking, merge atómico y verificación post-write.
func (s *Supervisor) registerStream(streamID, label, logPath, description, source string, priority int, categories []string) {
	nucleusBin, err := resolveNucleusBin(s.binDir)
	if err != nil {
		return // nucleus no disponible — no crítico
	}

	normalizedPath := strings.ReplaceAll(logPath, "\\", "/")

	args := []string{
		"telemetry", "register",
		"--stream", streamID,
		"--label", label,
		"--path", normalizedPath,
		"--description", description,
		"--source", source,
		"--priority", fmt.Sprintf("%d", priority),
	}
	for _, cat := range categories {
		args = append(args, "--category", cat)
	}

	cmd := exec.Command(nucleusBin, args...)
	// Both stdout and stderr go to os.Stderr so telemetry/INFO lines never
	// reach stdout and contaminate JSON output in --json mode.
	cmd.Stdout = os.Stderr
	cmd.Stderr = os.Stderr
	cmd.Run()
}

// monitorProcess watches a process and updates its state + telemetry when it exits.
// Worker restart logic is handled by watchWorker — this function stays generic.
func (s *Supervisor) monitorProcess(proc *ManagedProcess, logFile *os.File) {
	defer logFile.Close()

	// Wait for process to exit
	err := proc.Cmd.Wait()

	proc.mu.Lock()
	if err != nil {
		proc.State = StateFailed
	} else {
		proc.State = StateStopped
	}
	proc.mu.Unlock()

	// Update telemetry
	s.updateTelemetry(proc)
}

// watchTemporal monitors the temporal_server process and relaunches it if it
// dies unexpectedly, as long as the supervisor itself is still running.
//
// When Temporal dies the worker loses its connection and enters a crash loop.
// Restarting Temporal first breaks that cycle — the worker watchdog then
// reconnects cleanly on its next attempt.
//
// Restart policy mirrors watchWorker:
//   - Exponential backoff: 5s → 10s → 20s → 40s → capped at 60s
//   - Resets to 5s after a stable run longer than stableThreshold (30s)
//   - No restart if Temporal stopped cleanly (StateStopped)
//   - No restart if supervisorCtx is cancelled (service shutting down)
func (s *Supervisor) watchTemporal() {
	backoff := 5 * time.Second
	maxBackoff := 60 * time.Second
	stableThreshold := 30 * time.Second

	for {
		s.mu.RLock()
		proc, exists := s.processes["temporal_server"]
		s.mu.RUnlock()

		var startedAt time.Time
		if exists && proc.Cmd != nil {
			startedAt = proc.StartedAt
			proc.Cmd.Wait() // blocks until Temporal exits
		} else {
			// Cmd:nil means Temporal was already running when the supervisor
			// started (external process). Nothing to watch — exit the loop.
			return
		}

		// Stop if supervisor is shutting down.
		select {
		case <-s.supervisorCtx.Done():
			s.slog("INFO", "watchTemporal: supervisor shutting down — stopping watch loop")
			return
		default:
		}

		// Stop if Temporal exited cleanly (SIGTERM from Shutdown()).
		s.mu.RLock()
		proc, exists = s.processes["temporal_server"]
		s.mu.RUnlock()
		if exists {
			proc.mu.RLock()
			state := proc.State
			proc.mu.RUnlock()
			if state == StateStopped {
				s.slog("INFO", "watchTemporal: temporal_server stopped cleanly — no restart")
				return
			}
		}

		// Reset backoff if Temporal ran long enough before dying.
		if !startedAt.IsZero() && time.Since(startedAt) > stableThreshold {
			backoff = 5 * time.Second
		}

		s.slog("WARN", "watchTemporal: temporal_server exited unexpectedly — restarting in %v", backoff)

		select {
		case <-s.supervisorCtx.Done():
			s.slog("INFO", "watchTemporal: supervisor shutting down during backoff — stopping watch loop")
			return
		case <-time.After(backoff):
		}

		s.slog("INFO", "watchTemporal: relaunching temporal_server...")

		// Clear the dead process so startTemporalServer spawns a real one
		// instead of returning early on the port-7233 check (port may still
		// be in TIME_WAIT for a few seconds after Temporal dies).
		s.mu.Lock()
		delete(s.processes, "temporal_server")
		s.mu.Unlock()

		if _, err := s.startTemporalServer(s.supervisorCtx); err != nil {
			s.slog("ERROR", "watchTemporal: failed to relaunch temporal_server: %v", err)
		} else {
			// Wait for Temporal to be ready before letting the worker reconnect.
			if err := s.waitForTemporalReady(s.supervisorCtx, 60*time.Second); err != nil {
				s.slog("WARN", "watchTemporal: temporal_server restarted but not ready after 60s: %v", err)
			} else {
				s.slog("INFO", "watchTemporal: temporal_server relaunched successfully")
			}
		}

		// Exponential backoff with cap.
		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

// watchWorker monitors the nucleus_worker process and relaunches it if it dies
// unexpectedly, as long as the supervisor itself is still running.
//
// This is the fix for the root cause: under NSSM, the supervisor process stays
// alive indefinitely but the worker can die (Temporal reconnect errors, crashes,
// etc.) and nothing restarts it. Without this watchdog, health reports
// worker: DISCONNECTED until a full service restart.
//
// Restart policy:
//   - Exponential backoff: 5s → 10s → 20s → 40s → capped at 60s
//   - Resets to 5s after a successful restart that stayed up for >30s
//   - No restart if the worker stopped cleanly (StateStopped = SIGTERM/SIGINT)
//   - No restart if supervisorCtx is cancelled (service shutting down)
func (s *Supervisor) watchWorker() {
	backoff := 5 * time.Second
	maxBackoff := 60 * time.Second
	stableThreshold := 30 * time.Second

	for {
		// Wait for the current worker process to exit.
		s.mu.RLock()
		proc, exists := s.processes["nucleus_worker"]
		s.mu.RUnlock()

		var startedAt time.Time
		if exists && proc.Cmd != nil {
			startedAt = proc.StartedAt
			proc.Cmd.Wait() // blocks until the worker exits
		} else {
			// No process to watch yet — brief pause to avoid tight loop
			// during initial startup before startWorkerManager registers the proc.
			time.Sleep(2 * time.Second)
			continue
		}

		// Check if supervisor is shutting down — don't restart in that case.
		select {
		case <-s.supervisorCtx.Done():
		s.slog("INFO", "watchWorker: supervisor shutting down — stopping watch loop")
			return
		default:
		}

		// Check if the worker stopped cleanly (graceful shutdown via SIGTERM).
		// StateStopped means it exited with code 0 — intentional, don't restart.
		s.mu.RLock()
		proc, exists = s.processes["nucleus_worker"]
		s.mu.RUnlock()
		if exists {
			proc.mu.RLock()
			state := proc.State
			proc.mu.RUnlock()
			if state == StateStopped {
			s.slog("INFO", "watchWorker: worker stopped cleanly — no restart")
				return
			}
		}

		// If the worker ran for longer than stableThreshold, reset backoff.
		// This avoids penalising transient failures after a long healthy run.
		if !startedAt.IsZero() && time.Since(startedAt) > stableThreshold {
			backoff = 5 * time.Second
		}

		s.slog("WARN", "watchWorker: nucleus_worker exited unexpectedly — restarting in %v", backoff)

		// Wait before restarting, but respect supervisor shutdown.
		select {
		case <-s.supervisorCtx.Done():
			s.slog("INFO", "watchWorker: supervisor shutting down during backoff — stopping watch loop")
			return
		case <-time.After(backoff):
		}

		s.slog("INFO", "watchWorker: relaunching nucleus_worker...")

		// Limpiar el proceso muerto del mapa antes de relanzar.
		// Sin este delete, startWorkerManager puede encontrar pollers residuales
		// de Temporal (persisten ~10s tras la muerte del worker) y retornar un
		// ManagedProcess con Cmd:nil sin spawnear nada. watchWorker detecta
		// Cmd:nil, duerme 2s y vuelve a llamar startWorkerManager — loop infinito.
		// Con el delete, startWorkerManager cae directo al spawn real ignorando
		// los pollers residuales.
		s.mu.Lock()
		delete(s.processes, "nucleus_worker")
		s.mu.Unlock()

		// BUG-11 fix: before relaunching the worker, verify Temporal is reachable.
		// The most common cause of repeated worker crashes is Temporal being down —
		// the worker connects, Temporal is gone, worker exits immediately, watchdog
		// relaunches in a tight loop. Instead: check port 7233, and if unreachable
		// run `temporal ensure` (idempotent) before spawning a new worker process.
		if conn, tcpErr := net.DialTimeout("tcp", "localhost:7233", 1*time.Second); tcpErr != nil {
			s.slog("WARN", "watchWorker: Temporal not reachable before worker restart — attempting temporal ensure")
			nucleusBin, _ := resolveNucleusBin(s.binDir)
			ensureCtx, ensureCancel := context.WithTimeout(context.Background(), 30*time.Second)
			out, ensureErr := exec.CommandContext(ensureCtx, nucleusBin, "temporal", "ensure").CombinedOutput()
			ensureCancel()
			if ensureErr != nil {
				s.slog("ERROR", "watchWorker: temporal ensure failed: %v — %s", ensureErr, strings.TrimSpace(string(out)))
			} else {
				s.slog("INFO", "watchWorker: temporal ensure succeeded — proceeding with worker restart")
			}
		} else {
			conn.Close()
		}

		if _, err := s.startWorkerManager(s.supervisorCtx); err != nil {
			s.slog("ERROR", "watchWorker: failed to relaunch worker: %v", err)
		} else {
			s.slog("INFO", "watchWorker: nucleus_worker relaunched successfully")
		}

		// Exponential backoff with cap
		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

// updateTelemetry registers a generic process stream via nucleus telemetry register.
func (s *Supervisor) updateTelemetry(proc *ManagedProcess) {
	s.registerStream(
		proc.Name,
		fmt.Sprintf("🔧 %s", strings.ToUpper(strings.ReplaceAll(proc.Name, "_", " "))),
		proc.LogPath,
		fmt.Sprintf("%s process log — managed by the Nucleus supervisor", proc.Name),
		"nucleus",
		2,
		[]string{"nucleus"},
	)
}

// Shutdown performs graceful shutdown of all managed processes.
//
// svelte_dev es excluido intencionalmente: startSvelteDev() usa setSvelteProcAttr
// (Setpgid:true en macOS/Linux) precisamente para que Vite sobreviva al supervisor.
// Si Shutdown lo mata via Cmd.Process.Signal, se contradice ese diseño y el health
// check pasa a UNREACHABLE inmediatamente después de cada service stop.
// Vite es una herramienta de desarrollo — su ciclo de vida es independiente del
// servicio Nucleus. El usuario lo detiene manualmente (Ctrl-C en la terminal de Vite,
// o `pkill -f vite`) cuando termina de trabajar.
// Shutdown kills every managed process via its pidfile (see killByPidFile),
// not via s.processes. That map is only ever populated in the OS process
// that actually spawned the children — for "nucleus service start" that's
// itself (this path), but for "nucleus service stop" it's a brand-new,
// empty Supervisor. Going through pidfiles makes both callers correct with
// the same code, instead of stop silently operating on nothing.
//
// Runs per-process kills concurrently, each bounded by the shared ctx
// deadline (30s from the caller) — a stuck process no longer blocks the
// others from being signaled.
func (s *Supervisor) Shutdown(ctx context.Context) error {
	var wg sync.WaitGroup
	errCh := make(chan error, len(managedProcessNames))

	for _, name := range managedProcessNames {
		// svelte_dev sobrevive al shutdown por diseño — ver startSvelteDev()
		// y el comentario de setSvelteProcAttr. No mandar señal. (No está en
		// managedProcessNames, así que este loop nunca la toca.)
		wg.Add(1)
		go func(n string) {
			defer wg.Done()
			timeout := 10 * time.Second
			if dl, ok := ctx.Deadline(); ok {
				if remaining := time.Until(dl); remaining < timeout {
					timeout = remaining
				}
			}
			if _, err := killByPidFile(s.binDir, n, timeout); err != nil {
				errCh <- fmt.Errorf("%s: %w", n, err)
			}
		}(name)
	}

	wg.Wait()
	close(errCh)

	var errs []string
	for err := range errCh {
		errs = append(errs, err.Error())
	}
	if len(errs) > 0 {
		return fmt.Errorf("shutdown errors: %s", strings.Join(errs, "; "))
	}
	return nil
}

// ============================================================================
// BOOT SEQUENCE HELPER METHODS
// ============================================================================

// verifyTemporalServer checks if Temporal Server is reachable on port 7233
func (s *Supervisor) verifyTemporalServer(ctx context.Context) error {
	// Try to establish TCP connection to port 7233
	conn, err := net.DialTimeout("tcp", "localhost:7233", 2*time.Second)
	if err != nil {
		return fmt.Errorf("temporal server not reachable on port 7233: %w", err)
	}
	conn.Close()
	return nil
}

// verifyWorkerRunning checks if worker is operational (placeholder)
func (s *Supervisor) verifyWorkerRunning(ctx context.Context) error {
	// TODO: Implement actual worker status check
	// For now, just return nil as worker is internal goroutine
	return nil
}

// bootGovernance validates the governance layer (.ownership.json) when
// onboarding is complete. During onboarding (pre-github) the file is
// legitimately absent and governance is a no-op — Harness is handled
// separately by bootHarness, which is ALWAYS called before this function.
//
// Path resolution (via getOwnershipPath — single source of truth):
//   SIMULATION:      installer/nucleus/scripts/simulation_env/.bloom/.ownership.json
//   PRE-ONBOARDING:  skipped (no file required — Harness runs in stub mode)
//   POST-ONBOARDING: <nucleusRepo>/.bloom/.nucleus-{org}/.ownership.json
func (s *Supervisor) bootGovernance(ctx context.Context, simulation bool) error {
	onboardingDone := isOnboardingCompleted()

	// Pre-onboarding: governance is skipped; Harness is managed by bootHarness.
	if !simulation && !onboardingDone {
		fmt.Fprintln(os.Stderr, "[INFO] ⚙️  governance: pre-onboarding mode — skipping (Harness handles debug layer)")
		return nil
	}

	ownershipPath := getOwnershipPath(simulation, onboardingDone)
	if ownershipPath == "" {
		// BLOOM_DIR unresolvable after onboarding — degrade gracefully.
		fmt.Fprintln(os.Stderr, "[INFO] ⚠️  governance: cannot resolve .ownership.json path — skipping")
		return nil
	}

	// Validate path characters (Windows guard)
	if strings.ContainsAny(ownershipPath, "<>|?*") {
		fmt.Fprintf(os.Stderr, "[INFO] ⚠️  governance: .ownership.json path contains invalid characters (%q) — skipping\n", ownershipPath)
		return nil
	}

	if _, err := os.Stat(ownershipPath); err != nil {
		if os.IsNotExist(err) {
			fmt.Fprintf(os.Stderr, "[INFO] ⚠️  governance: .ownership.json not found at %s\n", ownershipPath)
			return nil
		}
		// En Windows, un path con sintaxis inválida devuelve ERROR_INVALID_NAME.
		if strings.Contains(err.Error(), "syntax is incorrect") ||
			strings.Contains(err.Error(), "invalid") {
			fmt.Fprintf(os.Stderr, "[INFO] ⚠️  governance: .ownership.json path invalid (%v) — skipping\n", err)
			return nil
		}
		// Otro tipo de error (permisos, disco, etc) — sí es un error real.
		return fmt.Errorf("ownership.json access error: %w", err)
	}

	// Si existe, governance OK.
	return nil
}

// resolveBrainInterpreter locates the Python interpreter that BrainExecutor's
// standalone-mode fallback needs. See brainExecutor.ts initialize(), the
// `else` branch used outside VS Code (this Control Plane's own execution
// context): it sets `executablePath = BLOOM_BRAIN_PATH || 'python'` and later
// spawns it as `[executablePath, '-m', 'brain', '--json', ...]` — that `-m`
// requires an actual interpreter, not the standalone `brain` CLI binary
// bundled at <binDir>/brain/brain (a PyInstaller onedir build with its own
// _internal/ deps — it doesn't understand `-m` at all, it IS the module).
//
// core.ResolveBrainPath() (installer/nucleus/internal/core/paths.go) is
// intentionally NOT reused here: it resolves that same `brain` CLI binary,
// for a different caller/purpose. Using it here would hand BrainExecutor an
// executable it invokes incorrectly — same ENOENT-class bug, just relocated.
//
// Confirmed against the real embedded runtime layout: the correct target is
// <binDir>/engine/runtime/bin/python3, a full CPython distribution shipped
// with the install (include/, lib/, share/ alongside the binary — not a
// PyInstaller bundle).
func resolveBrainInterpreter(binDir string) (string, error) {
	// 1. Explicit override, respected verbatim — e.g. a systemd unit
	//    Environment= override, or a developer pointing at their own venv.
	if p := os.Getenv("BLOOM_BRAIN_PATH"); p != "" {
		return p, nil
	}

	// 2. Embedded runtime shipped with the install.
	//    NOTE (Windows): embeddable CPython distributions conventionally
	//    place python.exe at the runtime root, not under bin/ — verify this
	//    candidate against an actual Windows install before shipping there;
	//    flagging rather than guessing silently.
	candidate := filepath.Join(binDir, "engine", "runtime", "bin", "python3")
	if runtime.GOOS == "windows" {
		candidate = filepath.Join(binDir, "engine", "runtime", "python.exe")
	}
	if _, err := os.Stat(candidate); err == nil {
		return candidate, nil
	}

	// 3. System PATH, last resort — matches the pre-existing 'python'
	//    fallback baked into brainExecutor.ts, but at least tries python3
	//    first since that's what modern distros actually provide.
	for _, name := range []string{"python3", "python"} {
		if found, lookErr := exec.LookPath(name); lookErr == nil {
			return found, nil
		}
	}

	return "", fmt.Errorf(
		"no python interpreter found for BrainExecutor: checked BLOOM_BRAIN_PATH, %s, and system PATH",
		candidate,
	)
}

// resolveBrainExecutable locates the PyInstaller onedir bundle produced by
// build-brain.sh / build.py (installer/native/bin/<arch>/brain/ → rollout a
// <binDir>/brain/brain). A diferencia de resolveBrainInterpreter() — que
// resuelve un intérprete Python genérico para invocarlo con `-m brain` — esto
// resuelve el ejecutable frozen que YA tiene `brain` embebido en su propio
// _internal/, sin depender de ningún site-packages externo.
//
// BUG (confirmado 2026-07-28): el pipeline de build (build-all.py,
// build-brain.sh) nunca instala el paquete `brain` en el site-packages de
// engine/runtime — solo lo empaqueta como este bundle standalone. Por eso
// BrainExecutor invocando `<engine/runtime python3> -m brain` fallaba con
// "No module named brain": ese runtime nunca tuvo el paquete y el diseño del
// instalador nunca lo contempló. El fix correcto es apuntar a este binario en
// vez de intentar volver instalable un paquete que solo existe como bundle.
//
// core.ResolveBrainPath() (installer/nucleus/internal/core/paths.go) ya
// resuelve este mismo binario para otro caller/propósito — reutilizado acá
// intencionalmente porque este SÍ es el uso correcto de ese path (a
// diferencia de resolveBrainInterpreter(), que deliberadamente no lo reusa).
func resolveBrainExecutable(binDir string) (string, error) {
	candidate := filepath.Join(binDir, "brain", "brain")
	if runtime.GOOS == "windows" {
		candidate = filepath.Join(binDir, "brain", "brain.exe")
	}
	if _, err := os.Stat(candidate); err == nil {
		return candidate, nil
	}
	return "", fmt.Errorf("brain executable not found at %s", candidate)
}

func (s *Supervisor) bootControlPlane(ctx context.Context, simulation bool) (*ManagedProcess, error) {
	// Production: launch the self-contained bundle — no NODE_PATH required.
	// Built by: npm run build:bundle → installer/native/bin/bootstrap/bundle.js
	bundleScript := filepath.Join(s.binDir, "bootstrap", "bundle.js")

	// BUG (confirmado 2026-07-28): antes esto era "BLOOM_BRAIN_PATH=" +
	// os.Getenv("BLOOM_BRAIN_PATH") — reenvía la env var cruda, que bajo
	// systemd/NSSM (sin override explícito) siempre llega vacía. El proceso
	// Node recibía BLOOM_BRAIN_PATH="" (definida pero falsy), caía a su
	// propio fallback ciego 'python', y como no hay ningún 'python' en el
	// PATH del unit (solo node/ y el resto de bin/BloomNucleus), Node
	// reventaba con "spawn python ENOENT" apenas BrainExecutor intentaba
	// ejecutar algo.
	brainPath, brainErr := resolveBrainInterpreter(s.binDir)
	if brainErr != nil {
		s.slog("WARN", "bootControlPlane: %v — Control Plane's BrainExecutor will fail on first use", brainErr)
	}

	// BUG (confirmado 2026-07-28): resolver el intérprete embebido (arriba) ya
	// no alcanza — engine/runtime nunca tuvo `brain` instalado en su
	// site-packages, así que `-m brain` con ese intérprete siempre falla con
	// "No module named brain". BLOOM_BRAIN_EXE es la señal que brainExecutor.ts
	// usa (rama standalone de initialize()) para preferir el bundle PyInstaller
	// (isBinaryMode=true, baseArgs=['--json'] sin -m) en vez del intérprete.
	// BLOOM_BRAIN_PATH se mantiene como estaba, para no romper el caso de un
	// override explícito apuntando a un venv con `brain` real instalado.
	brainExePath, brainExeErr := resolveBrainExecutable(s.binDir)
	if brainExeErr != nil {
		s.slog("WARN", "bootControlPlane: %v — falling back to BLOOM_BRAIN_PATH interpreter mode", brainExeErr)
	}

	env := []string{
		"BLOOM_USER_ROLE=" + os.Getenv("BLOOM_USER_ROLE"),
		"BLOOM_VAULT_STATE=UNLOCKED",
		"BLOOM_WORKER_RUNNING=true",
		fmt.Sprintf("BLOOM_SIMULATION_MODE=%t", simulation),
		"BLOOM_LOGS_DIR=" + s.logsDir,
		// BLOOM_NUCLEUS_PATH: workspace del proyecto activo, requerido por
		// server.ts para registrar /api/v1/mandates (ver MandateFsContext).
		//
		// BUG (mismo patrón que BLOOM_BRAIN_PATH, ver comentario arriba):
		// antes esto era "BLOOM_NUCLEUS_PATH=" + os.Getenv("BLOOM_NUCLEUS_PATH")
		// — reenvía la env var cruda del propio proceso Nucleus, que bajo
		// systemd/NSSM (sin override explícito) siempre llega vacía. bundle.js
		// recibía BLOOM_NUCLEUS_PATH="" (definida pero falsy en JS), y
		// server.ts nunca registraba las rutas de mandates — el tag "mandates"
		// aparecía en Swagger (está hardcodeado en la config) pero sin ningún
		// path real detrás.
		//
		// Fix: getWorkspacePath() (dev_start.go) resuelve desde
		// nucleus.json → onboarding.workspace_path, con fallback al env var
		// crudo por si alguien lo overridea a mano. Mismo criterio que
		// getBloomDir() usa para BLOOM_DIR / installation.origin_path.
		"BLOOM_NUCLEUS_PATH=" + getWorkspacePath(),
		// BLOOM_BRAIN_PATH: requerido por BrainExecutor.initialize() en modo standalone
		// (rama !vscode) — ver resolveBrainInterpreter() arriba para la cadena de
		// precedencia completa y por qué no reenviamos el os.Getenv crudo.
		"BLOOM_BRAIN_PATH=" + brainPath,
		// BLOOM_BRAIN_EXE: prioridad sobre BLOOM_BRAIN_PATH en brainExecutor.ts —
		// ver resolveBrainExecutable() arriba y el bug de "No module named brain".
		// Si no se resolvió (brainExeErr != nil), se envía vacía a propósito: el
		// `if (brainExe)` en brainExecutor.ts la trata como ausente y cae solo a
		// BLOOM_BRAIN_PATH, sin necesitar lógica adicional acá.
		"BLOOM_BRAIN_EXE=" + brainExePath,
		// BLOOM_DIR: fuente canónica para que bundle.js resuelva webview/app.
		// getBloomDir() lee installation.origin_path de nucleus.json (sube 4 niveles)
		// o cae al env BLOOM_DIR. Si ambos fallan, bundle.js lo ignorará gracefully.
		"BLOOM_DIR=" + getBloomDir(),
		// SVELTE_MANAGED_BY_GO=true: señal para que bundle.js NO intente spawnar
		// su propio proceso npm run dev. Go (service.go) ya gestiona startSvelteDev()
		// y confirma el puerto 5173 antes de lanzar bundle.js. Sin esta flag, la
		// guard de isPortOpen(5173) en bundle.js tiene una race window durante el
		// arranque de Vite (~3-8s) y puede generar un segundo proceso Vite duplicado.
		"SVELTE_MANAGED_BY_GO=true",
	}

	// Log file: logs/nucleus/control_plane/nucleus_control_plane_YYYYMMDD.log
	// Sigue spec: {source}_{module}_{date}.log en logs/{source}/{module}/
	today := time.Now()
	dateStr := fmt.Sprintf("%04d%02d%02d", today.Year(), today.Month(), today.Day())
	logDir := filepath.Join(s.logsDir, "nucleus", "control_plane")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create control plane log directory: %w", err)
	}
	logPath := filepath.Join(logDir, fmt.Sprintf("nucleus_control_plane_%s.log", dateStr))

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to create control plane log file: %w", err)
	}

	// Registrar stream en telemetry via registerStream (delega al CLI de nucleus)
	s.registerStream(
		"nucleus_control_plane",
		"🖥️ CONTROL PLANE",
		filepath.ToSlash(logPath),
		"Control plane API log — Node.js bootstrap server providing HTTP :48215 and WebSocket :4124",
		"nucleus",
		2,
		[]string{"nucleus"},
	)

	// Get Node.js binary (cross-platform: tries without .exe first)
	nodePath := resolveNodeBin(s.binDir)

	// CRÍTICO: exec.Command SIN contexto (no exec.CommandContext).
	// bootCtx tiene timeout de 120s — si usáramos CommandContext, Go mandaría
	// SIGKILL al proceso Node cuando el ctx expire, matando el Control Plane
	// silenciosamente. El Control Plane es un servidor de larga duración que debe
	// sobrevivir al boot. Mismo patrón que startBrainServer (L570).
	cmd := exec.Command(nodePath, bundleScript)
	cmd.Env = append(os.Environ(), env...)
	cmd.Stdout = logFile
	cmd.Stderr = logFile

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("failed to start control plane: %w", err)
	}

	proc := &ManagedProcess{
		Name:      "control_plane_api",
		Cmd:       cmd,
		PID:       cmd.Process.Pid,
		State:     StateStarting,
		LogPath:   logPath,
		StartedAt: time.Now(),
	}

	s.processes["control_plane_api"] = proc
	if err := writePidFile(s.binDir, "control_plane_api", proc.PID); err != nil {
		s.slog("WARN", "failed to write control_plane_api pidfile: %v", err)
	}
	go s.monitorProcess(proc, logFile)

	// Wait for the API server to be ready on port 48215 (up to 8s).
	// Non-fatal: if bundle crashes (e.g. missing module), boot continues.
	// The error will be visible in nucleus_control_plane_YYYYMMDD.log.
	if err := s.waitForPort("48215", 8*time.Second); err != nil {
		fmt.Fprintf(os.Stderr, "[WARN] Control Plane port 48215 not ready after 8s — check logs/nucleus/control_plane/: %v\n", err)
	}

	return proc, nil
}

// ============================================================================
// SVELTE DEV SERVER MANAGEMENT
// ============================================================================

// isSvelteRunning verifica si Vite/Svelte ya está escuchando en puerto 5173.
// Usa "localhost" en lugar de "127.0.0.1" — en Windows Vite escucha en IPv6 ([::1]).
func (s *Supervisor) isSvelteRunning() bool {
	conn, err := net.DialTimeout("tcp", "localhost:5173", 1*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// startSvelteDev starts `npm run dev` (Vite/SvelteKit) as a managed process.
//
// El servidor Svelte es NON-CRITICAL: un fallo aquí no aborta el boot.
// Si ya está corriendo en puerto 5173, retorna sin tocarlo.
//
// Orden de resolución del project root:
//  1. BLOOM_DIR env var (fuente canónica — apunta a la raíz del repo)
//  2. BLOOM_NUCLEUS_PATH   (fallback — apunta al dir .bloom del proyecto)
//  3. Walk-up desde el ejecutable buscando package.json (desarrollo local)
func (s *Supervisor) startSvelteDev(ctx context.Context) (*ManagedProcess, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Si ya está registrado y listo, no hacer nada.
	if proc, exists := s.processes["svelte_dev"]; exists {
		if proc.State == StateReady {
			return proc, nil
		}
	}

	// Si ya está escuchando externamente, regístralo como proceso externo.
	if s.isSvelteRunning() {
		proc := &ManagedProcess{
			Name:      "svelte_dev",
			Cmd:       nil, // proceso externo, no gestionado por nosotros
			PID:       0,
			State:     StateReady,
			StartedAt: time.Now(),
		}
		s.processes["svelte_dev"] = proc
		s.slog("INFO", "✓ Svelte dev server already running on port 5173 — skipping start")
		return proc, nil
	}

	// Resolver el directorio de la UI: <repoRoot>/webview/app
	// getBloomDir() lee installation.origin_path de nucleus.json (sube 4 niveles)
	// o cae al env BLOOM_DIR. Es la fuente de verdad para la raíz del repo.
	repoRoot := getBloomDir()
	if repoRoot == "" {
		return nil, fmt.Errorf("cannot locate repo root for svelte dev (BLOOM_DIR not set and nucleus.json unreadable)")
	}
	// La UI de SvelteKit vive siempre en webview/app — tiene su propio vite.config.ts
	projectRoot := filepath.Join(repoRoot, "webview", "app")
	if _, err := os.Stat(filepath.Join(projectRoot, "vite.config.ts")); err != nil {
		return nil, fmt.Errorf("svelte dev dir not found at %s — expected webview/app/vite.config.ts", projectRoot)
	}

	// Resolver npm — PATH
	npmBin, err := exec.LookPath("npm")
	if err != nil {
		return nil, fmt.Errorf("npm not found in PATH: %v", err)
	}

	// Log file: logs/nucleus/svelte_dev/nucleus_svelte_dev_YYYYMMDD.log
	today := time.Now()
	dateStr := fmt.Sprintf("%04d%02d%02d", today.Year(), today.Month(), today.Day())
	logDir := filepath.Join(s.logsDir, "nucleus", "svelte_dev")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create svelte log directory: %w", err)
	}
	logPath := filepath.Join(logDir, fmt.Sprintf("nucleus_svelte_dev_%s.log", dateStr))

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to create svelte log file: %w", err)
	}

	// Spawn `npm run dev` — proceso de larga duración, desacoplado del ciclo
	// de vida del supervisor (no usamos exec.CommandContext para no matarlo
	// cuando el contexto del boot expira).
	cmd := exec.Command(npmBin, "run", "dev")
	cmd.Dir = projectRoot
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	// SysProcAttr se setea en health_windows.go / health_unix.go (setSvelteProcAttr)
	// para que el hijo sobreviva si el padre termina.
	setSvelteProcAttr(cmd)

	if err := cmd.Start(); err != nil {
		logFile.Close()
		return nil, fmt.Errorf("failed to spawn npm run dev in %s: %w", projectRoot, err)
	}

	proc := &ManagedProcess{
		Name:      "svelte_dev",
		Cmd:       cmd,
		PID:       cmd.Process.Pid,
		State:     StateStarting,
		LogPath:   logPath,
		StartedAt: time.Now(),
	}

	s.processes["svelte_dev"] = proc
	go s.monitorProcess(proc, logFile)

	// Registrar stream en telemetry
	s.registerStream(
		"svelte_dev",
		"🌸 SVELTE DEV SERVER",
		filepath.ToSlash(logPath),
		"Vite/SvelteKit dev server log — UI frontend on port 5173",
		"nucleus",
		3,
		[]string{"nucleus", "frontend"},
	)

	return proc, nil
}

// waitForSvelteReady espera hasta que Svelte/Vite esté escuchando en puerto 5173.
func (s *Supervisor) waitForSvelteReady(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if s.isSvelteRunning() {
			s.mu.Lock()
			if proc, exists := s.processes["svelte_dev"]; exists {
				proc.mu.Lock()
				proc.State = StateReady
				proc.mu.Unlock()
			}
			s.mu.Unlock()
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("svelte dev server not ready after %v — check logs/nucleus/svelte_dev/", timeout)
}

// waitForPort polls until the given TCP port is open or timeout expires.
func (s *Supervisor) waitForPort(port string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", "127.0.0.1:"+port, 500*time.Millisecond)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("port %s not ready after %s", port, timeout)
}

// ============================================================================
// COMANDO "service" — registro siguiendo Guía Maestra NUCLEUS v2.0
// ============================================================================

func init() {
	core.RegisterCommand("SERVICE", createServiceCommand)
}

type ServiceStartResult struct {
	Success   bool   `json:"success"`
	State     string `json:"state"`
	Error     string `json:"error,omitempty"`
	Timestamp int64  `json:"timestamp"`
}

type ServiceStopResult struct {
	Success   bool   `json:"success"`
	State     string `json:"state"`
	Error     string `json:"error,omitempty"`
	Timestamp int64  `json:"timestamp"`
}

type ServiceStatusResult struct {
	Success   bool                       `json:"success"`
	State     string                     `json:"state"`
	Error     string                     `json:"error,omitempty"`
	Processes map[string]ProcessSnapshot `json:"processes"`
	Timestamp int64                      `json:"timestamp"`
}

type ProcessSnapshot struct {
	State     string `json:"state"`
	PID       int    `json:"pid,omitempty"`
	LogPath   string `json:"log_path,omitempty"`
	StartedAt string `json:"started_at,omitempty"`
}

type RestartBootstrapResult struct {
	Success     bool   `json:"success"`
	PID         int    `json:"pid,omitempty"`
	PreviousPID int    `json:"previous_pid,omitempty"`
	State       string `json:"state"`
	Error       string `json:"error,omitempty"`
	Timestamp   int64  `json:"timestamp"`
}

func createServiceCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "service",
		Short: "Manage Nucleus service lifecycle (start / stop / status / restart-bootstrap)",
		Long: `Control the Nucleus background service and its managed subprocesses.

Subcommands:
  start               Boot all Nucleus components in order
  stop                Gracefully shut down all managed processes
  status              Show current state of each managed process
  restart-bootstrap   Restart only the Control Plane (bootstrap/bundle.js)`,

		Annotations: map[string]string{
			"category": "SERVICE",
		},
	}

	cmd.AddCommand(createServiceStartCmd(c))
	cmd.AddCommand(createServiceStopCmd(c))
	cmd.AddCommand(createServiceStatusCmd(c))
	cmd.AddCommand(createRestartBootstrapCmd(c))

	return cmd
}

func createServiceStartCmd(c *core.Core) *cobra.Command {
	var outputJSON bool
	var simulation bool

	cmd := &cobra.Command{
		Use:   "start",
		Short: "Boot all Nucleus components in order",
		Example: `  nucleus service start
  nucleus --json service start
  nucleus service start --simulation`,
		Annotations: map[string]string{
			"category": "SERVICE",
			"json_response": `{
  "success": true,
  "state": "RUNNING",
  "timestamp": 1740000000
}`,
		},
		Args: cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			if c.IsJSON {
				outputJSON = true
			}
			logsDir := getLogsDir(c)
			binDir := getBinDir(c)
			sup := NewSupervisor(logsDir, binDir)
			// supervisorCtx lives for the full lifetime of the service process.
			// watchWorker uses it to know when to stop restarting the worker.
			// This is intentionally context.Background() — no timeout.
			sup.supervisorCtx = context.Background()
			// Init structured logger — writes to nucleus_service_YYYYMMDD.log with
			// timestamps (log.Ldate|log.Ltime) and registers the stream in telemetry.
			sup.initLogger(c)
			// Boot usa timeout de 120s. El proceso principal NO usa contexto
			// con timeout — debe vivir indefinidamente bajo NSSM.
			bootCtx, bootCancel := context.WithTimeout(context.Background(), 120*time.Second)
			defer bootCancel()
			result := &ServiceStartResult{Timestamp: time.Now().Unix()}

			// ── Harness (siempre — independiente del estado de governance) ──────
			// bootHarness es non-fatal y DEBE correr antes de governance para que
			// Harness esté disponible durante el onboarding para debugging.
			harnessResult := sup.bootHarness(bootCtx, simulation)
			if !harnessResult.Healthy {
				sup.slog("WARN", "Harness failed to start (mode=%s): %s", harnessResult.Mode, harnessResult.Error)
			} else {
				sup.slog("INFO", "✓ Harness started (mode=%s)", harnessResult.Mode)
			}

			// ── Governance (skipped automáticamente pre-onboarding) ─────────────
			if err := sup.bootGovernance(bootCtx, simulation); err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = fmt.Sprintf("governance: %v", err)
				outputServiceStartResult(c, outputJSON, result)
				os.Exit(1)
			}
			if _, err := sup.startTemporalServer(bootCtx); err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = fmt.Sprintf("temporal: %v", err)
				outputServiceStartResult(c, outputJSON, result)
				os.Exit(1)
			}
			if err := sup.waitForTemporalReady(bootCtx, 60*time.Second); err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = fmt.Sprintf("temporal not ready: %v", err)
				outputServiceStartResult(c, outputJSON, result)
				os.Exit(1)
			}
			if _, err := sup.startWorkerManager(bootCtx); err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = fmt.Sprintf("worker: %v", err)
				outputServiceStartResult(c, outputJSON, result)
				os.Exit(1)
			}
			// Brain Server — crítico, debe estar up antes del Control Plane.
			// Si ya está corriendo (puerto 5678), startBrainServer lo detecta y no lo toca.
			brainProc, err := sup.startBrainServer(bootCtx)
			if err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = fmt.Sprintf("brain_server: %v", err)
				outputServiceStartResult(c, outputJSON, result)
				os.Exit(1)
			}
			// Solo esperar si fue recién spawnado (Cmd != nil).
			// Si Cmd == nil, isBrainRunning() ya lo confirmó — no hay que esperar.
			if brainProc.Cmd != nil {
				if err := sup.waitForBrainReady(15 * time.Second); err != nil {
					result.Success = false
					result.State = "FAILED"
					result.Error = fmt.Sprintf("brain_server not ready: %v", err)
					outputServiceStartResult(c, outputJSON, result)
					os.Exit(1)
				}
			}
			if brainProc.LogPath != "" {
				sup.updateBrainTelemetry(brainProc)
			}

			// CORRECCIÓN (Bug 1): arrancar Svelte ANTES que bootControlPlane.
			//
			// El orden anterior era: bootControlPlane → startSvelteDev.
			// bundle.js (el Control Plane) tiene su propio guard de puerto 5173 en
			// startSvelteDevServer(). Si Go no había terminado de arrancar Svelte
			// cuando bundle.js hacía isPortOpen(5173), bundle.js veía el puerto
			// cerrado y lanzaba un segundo proceso npm run dev — generando una race
			// condition donde dos procesos Vite competían por el puerto 5173.
			//
			// Con este orden: Svelte ya está listo (puerto 5173 confirmado) cuando
			// bundle.js arranca. bundle.js encontrará el puerto ocupado y saltará su
			// propio spawn. SVELTE_MANAGED_BY_GO=true es una señal adicional para
			// que bundle.js nunca intente el spawn, incluso si el guard de puerto falla.
			if _, err := sup.startSvelteDev(bootCtx); err != nil {
				c.Logger.Printf("[WARN] Svelte dev server failed to start: %v", err)
			} else {
				if err := sup.waitForSvelteReady(30 * time.Second); err != nil {
					c.Logger.Printf("[WARN] Svelte dev server not ready after 30s: %v", err)
				}
			}

			if _, err := sup.bootControlPlane(bootCtx, simulation); err != nil {
				c.Logger.Printf("[WARN] Control plane failed to start: %v", err)
			}

			// Boot completado. Reportar estado y BLOQUEAR.
			//
			// CRÍTICO: nucleus service start corre bajo NSSM con política Restart.
			// Si este proceso termina, NSSM lo reinicia en 5s y lanza una nueva
			// instancia de Temporal que choca con la existente:
			//   - "shard status unknown" en SQLite (dos procesos acceden a temporal.db)
			//   - worker expulsado cada ~6s con wsarecv connection forcibly closed
			//   - loop infinito de reinicios
			//
			// Quedarse bloqueado hasta SIGINT/SIGTERM. NSSM envía SIGTERM al hacer
			// "nssm stop BloomNucleusService" o al detener el servicio desde SCM.
			result.Success = true
			result.State = "RUNNING"
			outputServiceStartResult(c, outputJSON, result)

			sigCh := make(chan os.Signal, 1)
			signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
			c.Logger.Printf("[INFO] Nucleus service running — waiting for shutdown signal (SIGTERM)")
			<-sigCh

			c.Logger.Printf("[INFO] Shutdown signal received — stopping all processes")
			shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer shutdownCancel()
			if err := sup.Shutdown(shutdownCtx); err != nil {
				c.Logger.Printf("[WARN] Shutdown error: %v", err)
			}
			if sup.log != nil {
				sup.log.Close()
			}
			c.Logger.Printf("[INFO] Nucleus service stopped")
		},
	}
	cmd.Flags().BoolVar(&outputJSON, "json", false, "Output result as JSON")
	cmd.Flags().BoolVar(&simulation, "simulation", false, "Boot in simulation mode")
	return cmd
}

func createServiceStopCmd(c *core.Core) *cobra.Command {
	var outputJSON bool
	cmd := &cobra.Command{
		Use:   "stop",
		Short: "Gracefully shut down all managed Nucleus processes",
		Example: `  nucleus service stop
  nucleus --json service stop`,
		Annotations: map[string]string{
			"category": "SERVICE",
			"json_response": `{
  "success": true,
  "state": "STOPPED",
  "timestamp": 1740000000
}`,
		},
		Args: cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			if c.IsJSON {
				outputJSON = true
			}
			logsDir := getLogsDir(c)
			binDir := getBinDir(c)
			sup := NewSupervisor(logsDir, binDir)
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			result := &ServiceStopResult{Timestamp: time.Now().Unix()}
			if err := sup.Shutdown(ctx); err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = err.Error()
			} else {
				result.Success = true
				result.State = "STOPPED"
			}
			if outputJSON {
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(data))
			} else {
				if result.Success {
					c.Logger.Printf("[SUCCESS] Service stopped")
				} else {
					c.Logger.Printf("[ERROR] Stop failed: %s", result.Error)
				}
			}
			if !result.Success {
				os.Exit(1)
			}
		},
	}
	cmd.Flags().BoolVar(&outputJSON, "json", false, "Output result as JSON")
	return cmd
}

func createServiceStatusCmd(c *core.Core) *cobra.Command {
	var outputJSON bool
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Show current state of all managed Nucleus processes",
		Example: `  nucleus service status
  nucleus --json service status`,
		Annotations: map[string]string{
			"category": "SERVICE",
			"json_response": `{
  "success": true,
  "state": "RUNNING",
  "processes": {
    "temporal_server":   { "state": "READY", "pid": 1234 },
    "nucleus_worker":    { "state": "READY", "pid": 5678 },
    "control_plane_api": { "state": "READY", "pid": 9012 },
    "svelte_dev":        { "state": "READY", "pid": 3456 }
  },
  "timestamp": 1740000000
}`,
		},
		Args: cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			if c.IsJSON {
				outputJSON = true
			}
			binDir := getBinDir(c)
			result := &ServiceStatusResult{
				Success:   true,
				State:     "RUNNING",
				Processes: make(map[string]ProcessSnapshot),
				Timestamp: time.Now().Unix(),
			}
			// status no crea un Supervisor con estado en memoria — ese estado
			// vive únicamente en el proceso "service start" y nunca llega
			// hasta acá. En su lugar leemos los pidfiles que ese proceso
			// escribió al spawnear cada componente, y confirmamos con
			// isProcessAlive que el PID sigue siendo real (no un pidfile
			// stale de una corrida anterior que crasheó sin limpiar).
			for _, name := range managedProcessNames {
				pid, err := readPidFile(binDir, name)
				if err != nil {
					continue // sin pidfile => no lo consideramos "managed" ahora mismo
				}
				snap := ProcessSnapshot{PID: pid}
				if isProcessAlive(pid) {
					snap.State = string(StateReady)
				} else {
					snap.State = string(StateStopped)
				}
				result.Processes[name] = snap
			}
			if len(result.Processes) == 0 {
				result.State = "IDLE"
			}
			if outputJSON {
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(data))
			} else {
				c.Logger.Printf("[INFO] Service state: %s", result.State)
				if len(result.Processes) == 0 {
					c.Logger.Printf("[INFO]   (no managed processes in this session)")
				}
				for name, snap := range result.Processes {
					pidStr := ""
					if snap.PID > 0 {
						pidStr = fmt.Sprintf(" (PID %d)", snap.PID)
					}
					c.Logger.Printf("[INFO]   %-24s %s%s", name, snap.State, pidStr)
				}
			}
		},
	}
	cmd.Flags().BoolVar(&outputJSON, "json", false, "Output result as JSON")
	return cmd
}

func createRestartBootstrapCmd(c *core.Core) *cobra.Command {
	var outputJSON bool
	cmd := &cobra.Command{
		Use:   "restart-bootstrap",
		Short: "Restart the Control Plane (bootstrap/bundle.js) only",
		Long: `Kills any existing control_plane_api process and relaunches
bootstrap/bundle.js. Used by 'nucleus health --fix' to recover
from a crashed Control Plane without a full service restart.`,
		Example: `  nucleus service restart-bootstrap
  nucleus --json service restart-bootstrap`,
		Annotations: map[string]string{
			"category": "SERVICE",
			"json_response": `{
  "success": true,
  "pid": 9012,
  "state": "RUNNING",
  "timestamp": 1740000000
}`,
		},
		Args: cobra.NoArgs,
		Run: func(cmd *cobra.Command, args []string) {
			if c.IsJSON {
				outputJSON = true
			}
			logsDir := getLogsDir(c)
			binDir := getBinDir(c)
			sup := NewSupervisor(logsDir, binDir)
			ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
			defer cancel()
			result := &RestartBootstrapResult{Timestamp: time.Now().Unix()}

			// Antes: buscaba el proceso viejo en sup.processes, que en esta
			// invocación SIEMPRE está vacío (Supervisor recién creado) — nunca
			// mataba nada real. El bundle.js viejo seguía LISTEN en :48215/:4124,
			// el nuevo bundle.js chocaba por puerto (EADDRINUSE) y crasheaba, y
			// el health-check de abajo — que solo hacía GET sin verificar PID —
			// veía al proceso viejo (aún vivo) contestar y reportaba éxito falso.
			//
			// Fix: matar por pidfile y ESPERAR la muerte confirmada del proceso
			// viejo antes de spawnear. Esto no solo encuentra el proceso real —
			// elimina la race de EADDRINUSE de raíz, porque ya no hay dos
			// procesos compitiendo por el puerto al mismo tiempo.
			previousPID, killErr := killByPidFile(binDir, "control_plane_api", 10*time.Second)
			if killErr != nil {
				sup.slog("WARN", "restart-bootstrap: error killing previous control_plane_api (pid %d): %v", previousPID, killErr)
			}
			result.PreviousPID = previousPID

			// Defensa adicional por si el kernel tarda en liberar el puerto
			// (TIME_WAIT) incluso después de que el proceso ya murió.
			portDeadline := time.Now().Add(5 * time.Second)
			for time.Now().Before(portDeadline) {
				conn, dialErr := net.DialTimeout("tcp", "127.0.0.1:48215", 300*time.Millisecond)
				if dialErr != nil {
					break // puerto libre
				}
				conn.Close()
				time.Sleep(200 * time.Millisecond)
			}

			proc, err := sup.bootControlPlane(ctx, false)
			if err != nil {
				result.Success = false
				result.State = "FAILED"
				result.Error = err.Error()
			} else {
				ready := false
				deadline := time.Now().Add(10 * time.Second)
				client := &http.Client{Timeout: 1 * time.Second}
				for time.Now().Before(deadline) {
					resp, httpErr := client.Get("http://127.0.0.1:48215/api/docs")
					if httpErr == nil {
						resp.Body.Close()
						ready = true
						break
					}
					time.Sleep(500 * time.Millisecond)
				}
				result.PID = proc.PID
				// El GET de arriba por sí solo no prueba que sea proc.PID el que
				// contesta — solo prueba que "algo" contesta en el puerto. Como
				// ahora garantizamos por construcción que el viejo proceso ya
				// está muerto antes de llegar acá, un responder en :48215 solo
				// puede ser proc.PID — pero confirmamos igual que el proceso que
				// spawneamos sigue vivo, para no reportar RUNNING sobre un PID
				// que ya crasheó justo después de bindear el puerto.
				if ready && isProcessAlive(proc.PID) {
					result.Success = true
					result.State = "RUNNING"
				} else if ready {
					result.Success = false
					result.State = "FAILED"
					result.Error = fmt.Sprintf("port 48215 responded but spawned process (pid %d) is no longer running", proc.PID)
				} else {
					result.Success = true
					result.State = "STARTING"
					result.Error = "process started but port 48215 not yet responding"
				}
			}
			if outputJSON {
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(data))
			} else {
				if result.Success {
					c.Logger.Printf("[SUCCESS] Control Plane restarted (PID %d) — state: %s", result.PID, result.State)
					if result.Error != "" {
						c.Logger.Printf("[WARN] %s", result.Error)
					}
				} else {
					c.Logger.Printf("[ERROR] restart-bootstrap failed: %s", result.Error)
				}
			}
			if !result.Success {
				os.Exit(1)
			}
		},
	}
	cmd.Flags().BoolVar(&outputJSON, "json", false, "Output result as JSON")
	return cmd
}

func outputServiceStartResult(c *core.Core, outputJSON bool, result *ServiceStartResult) {
	if outputJSON {
		data, _ := json.MarshalIndent(result, "", "  ")
		fmt.Println(string(data))
	} else {
		if result.Success {
			c.Logger.Printf("[SUCCESS] Nucleus service started — state: %s", result.State)
		} else {
			c.Logger.Printf("[ERROR] Service start failed: %s", result.Error)
		}
	}
	if !result.Success {
		os.Exit(1)
	}
}