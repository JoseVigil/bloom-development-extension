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
	processes map[string]*ManagedProcess
	logsDir   string
	binDir    string
	mu        sync.RWMutex
}

// NewSupervisor creates a new process supervisor
func NewSupervisor(logsDir, binDir string) *Supervisor {
	return &Supervisor{
		processes: make(map[string]*ManagedProcess),
		logsDir:   logsDir,
		binDir:    binDir,
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
		fmt.Fprintln(os.Stderr, "[INFO] ✓ Temporal server already running on port 7233 — skipping start")
		return proc, nil
	}

	// Find Temporal binary
	temporalBin := filepath.Join(s.binDir, "temporal", "temporal.exe")
	if _, err := os.Stat(temporalBin); err != nil {
		// Fallback to system PATH
		if binPath, err := exec.LookPath("temporal"); err == nil {
			temporalBin = binPath
		} else {
			return nil, fmt.Errorf("temporal binary not found at %s or in PATH", temporalBin)
		}
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

	// Create command: temporal server start-dev
	cmd := exec.CommandContext(ctx, temporalBin, "server", "start-dev")
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

	// Monitor process in background
	go s.monitorProcess(proc, logFile)

	return proc, nil
}

// waitForTemporalReady waits for Temporal Server to be ready via gRPC health check
func (s *Supervisor) waitForTemporalReady(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	hostPort := "localhost:7233"

	for time.Now().Before(deadline) {
		// Try to dial with a short timeout
		dialCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		conn, err := grpc.DialContext(dialCtx, hostPort,
			grpc.WithTransportCredentials(insecure.NewCredentials()),
			grpc.WithBlock(),
		)
		cancel()

		if err == nil {
			// Connection successful, try health check
			healthClient := healthpb.NewHealthClient(conn)
			checkCtx, checkCancel := context.WithTimeout(ctx, 2*time.Second)
			resp, err := healthClient.Check(checkCtx, &healthpb.HealthCheckRequest{})
			checkCancel()
			conn.Close()

			if err == nil && resp.Status == healthpb.HealthCheckResponse_SERVING {
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
	temporalBin := filepath.Join(s.binDir, "temporal", "temporal.exe")
	if _, err := os.Stat(temporalBin); err != nil {
		// Fallback to PATH
		if p, err := exec.LookPath("temporal"); err == nil {
			temporalBin = p
		} else {
			return fmt.Errorf("temporal binary not found at %s or in PATH", temporalBin)
		}
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
		fmt.Fprintln(os.Stderr, "[INFO] ✓ Worker already active in profile-orchestration — skipping start")
		return proc, nil
	}

	// Find nucleus binary
	nucleusBin := filepath.Join(s.binDir, "nucleus", "nucleus.exe")
	if _, err := os.Stat(nucleusBin); err != nil {
		return nil, fmt.Errorf("nucleus binary not found at %s", nucleusBin)
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

	// Create command: nucleus worker start
	cmd := exec.CommandContext(ctx, nucleusBin, "worker", "start")
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

	// Monitor process in background
	go s.monitorProcess(proc, logFile)

	// Confirm worker is connected to Temporal task-queue via real JSON poll.
	// Timeout reduced to 10s — worker connects in <2s per logs.
	if err := s.waitForWorkerReady(10 * time.Second); err != nil {
		proc.mu.Lock()
		proc.State = StateDegraded
		proc.mu.Unlock()
		fmt.Fprintf(os.Stderr, "[WARN] Worker not confirmed in task-queue after 10s: %v\n", err)
	} else {
		proc.mu.Lock()
		proc.State = StateReady
		proc.mu.Unlock()
	}

	// Update telemetry
	s.updateWorkerTelemetry(proc)

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
		fmt.Fprintln(os.Stderr, "[INFO] ✓ Brain Server already running on port 5678 — skipping start")
		return proc, nil
	}

	// Resolver ruta del binario: binDir/brain/brain.exe
	brainBin := filepath.Join(s.binDir, "brain", "brain.exe")
	if _, err := os.Stat(brainBin); err != nil {
		return nil, fmt.Errorf("brain binary not found at %s", brainBin)
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

// CheckVaultStatus queries the vault status via Synapse
func (s *Supervisor) CheckVaultStatus(ctx context.Context) (*VaultStatusResult, error) {
	// Find nucleus binary - CRITICAL: Use absolute path for service mode
	nucleusBin := filepath.Join(s.binDir, "nucleus", "nucleus.exe")
	if _, err := os.Stat(nucleusBin); err != nil {
		// Fallback to PATH (for development mode)
		if binPath, err := exec.LookPath("nucleus"); err == nil {
			nucleusBin = binPath
		} else {
			return nil, fmt.Errorf("nucleus binary not found at %s or in PATH", nucleusBin)
		}
	}
	
	cmd := exec.CommandContext(ctx, nucleusBin, "--json", "synapse", "vault-status")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("vault status workflow failed: %w (output: %s)", err, string(output))
	}

	var result VaultStatusResult
	if err := json.Unmarshal(output, &result); err != nil {
		return nil, fmt.Errorf("invalid JSON response from vault-status: %w", err)
	}

	// Validate state
	if result.State == "FAILED" || result.State == "DEGRADED" {
		return nil, fmt.Errorf("vault in bad state: %s - %s", result.State, result.Error)
	}

	if !result.Success {
		return nil, fmt.Errorf("vault status check failed: %s", result.Error)
	}

	return &result, nil
}

// StartOllama starts Ollama service via Synapse
func (s *Supervisor) StartOllama(ctx context.Context) (*StartOllamaResult, error) {
	// Find nucleus binary - CRITICAL: Use absolute path for service mode
	nucleusBin := filepath.Join(s.binDir, "nucleus", "nucleus.exe")
	if _, err := os.Stat(nucleusBin); err != nil {
		// Fallback to PATH (for development mode)
		if binPath, err := exec.LookPath("nucleus"); err == nil {
			nucleusBin = binPath
		} else {
			return nil, fmt.Errorf("nucleus binary not found at %s or in PATH", nucleusBin)
		}
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

	// Get Node.js binary
	nodePath := filepath.Join(s.binDir, "node", "node.exe")
	if _, err := os.Stat(nodePath); err != nil {
		nodePath = "node" // Fallback to system Node
	}

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
	nucleusBin := filepath.Join(s.binDir, "nucleus", "nucleus.exe")
	if _, err := os.Stat(nucleusBin); err != nil {
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

// monitorProcess watches a process and updates telemetry
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

// Shutdown performs graceful shutdown of all managed processes
func (s *Supervisor) Shutdown(ctx context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var wg sync.WaitGroup

	for name, proc := range s.processes {
		wg.Add(1)
		go func(n string, p *ManagedProcess) {
			defer wg.Done()

			if p.Cmd != nil && p.Cmd.Process != nil {
				p.Cmd.Process.Signal(os.Interrupt)

				// Wait with timeout
				done := make(chan struct{})
				go func() {
					p.Cmd.Wait()
					close(done)
				}()

				select {
				case <-done:
					// Graceful shutdown succeeded
				case <-time.After(10 * time.Second):
					// Force kill
					p.Cmd.Process.Kill()
				}
			}
		}(name, proc)
	}

	wg.Wait()
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

func (s *Supervisor) bootGovernance(ctx context.Context, simulation bool) error {
	var ownershipPath string

	if simulation {
		ownershipPath = filepath.Join("installer", "nucleus", "scripts",
			"simulation_env", ".bloom", ".ownership.json")
	} else {
		bloomDir := getBloomDir()
		if bloomDir == "" {
			fmt.Fprintln(os.Stderr, "[INFO] ⚠️  BLOOM_DIR not resolvable - skipping governance (onboarding mode)")
			return nil
		}
		if strings.ContainsAny(bloomDir, "<>|?*") {
			fmt.Fprintf(os.Stderr, "[INFO] ⚠️  BLOOM_DIR contains invalid characters (%q) - skipping governance (onboarding mode)\n", bloomDir)
			return nil
		}
		ownershipPath = filepath.Join(bloomDir, ".ownership.json")
	}

	// Durante onboarding, si .ownership.json no existe, skip validation
	if _, err := os.Stat(ownershipPath); err != nil {
		if os.IsNotExist(err) {
			fmt.Fprintln(os.Stderr, "[INFO] ⚠️  .ownership.json not found - skipping governance (onboarding mode)")
			return nil
		}
		// En Windows, un path con sintaxis inválida devuelve ERROR_INVALID_NAME,
		// que no es ErrNotExist. Lo tratamos igual: skip en modo onboarding.
		if strings.Contains(err.Error(), "syntax is incorrect") ||
			strings.Contains(err.Error(), "invalid") {
			fmt.Fprintf(os.Stderr, "[INFO] ⚠️  .ownership.json path invalid (%v) - skipping governance (onboarding mode)\n", err)
			return nil
		}
		// Otro tipo de error (permisos, disco, etc) — sí es un error real
		return fmt.Errorf("ownership.json access error: %w", err)
	}

	// Si existe, governance OK
	return nil
}

func (s *Supervisor) bootControlPlane(ctx context.Context, simulation bool) (*ManagedProcess, error) {
	// Production: launch the self-contained bundle — no NODE_PATH required.
	// Built by: npm run build:bundle → installer/native/bin/bootstrap/bundle.js
	bundleScript := filepath.Join(s.binDir, "bootstrap", "bundle.js")

	env := []string{
		"BLOOM_USER_ROLE=" + os.Getenv("BLOOM_USER_ROLE"),
		"BLOOM_VAULT_STATE=UNLOCKED",
		"BLOOM_WORKER_RUNNING=true",
		fmt.Sprintf("BLOOM_SIMULATION_MODE=%t", simulation),
		"BLOOM_LOGS_DIR=" + s.logsDir,
		"BLOOM_NUCLEUS_PATH=" + os.Getenv("BLOOM_NUCLEUS_PATH"),
		// BLOOM_DIR: fuente canónica para que bundle.js resuelva webview/app.
		// getBloomDir() lee installation.origin_path de nucleus.json (sube 4 niveles)
		// o cae al env BLOOM_DIR. Si ambos fallan, bundle.js lo ignorará gracefully.
		"BLOOM_DIR=" + getBloomDir(),
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

	// Get Node.js binary
	nodePath := filepath.Join(s.binDir, "node", "node.exe")
	if _, err := os.Stat(nodePath); err != nil {
		nodePath = "node" // Fallback to system Node
	}

	cmd := exec.CommandContext(ctx, nodePath, bundleScript)
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
		fmt.Fprintln(os.Stderr, "[INFO] ✓ Svelte dev server already running on port 5173 — skipping start")
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
	Success   bool   `json:"success"`
	PID       int    `json:"pid,omitempty"`
	State     string `json:"state"`
	Error     string `json:"error,omitempty"`
	Timestamp int64  `json:"timestamp"`
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
			// Boot usa timeout de 120s. El proceso principal NO usa contexto
			// con timeout — debe vivir indefinidamente bajo NSSM.
			bootCtx, bootCancel := context.WithTimeout(context.Background(), 120*time.Second)
			defer bootCancel()
			result := &ServiceStartResult{Timestamp: time.Now().Unix()}

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
			if _, err := sup.bootControlPlane(bootCtx, simulation); err != nil {
				c.Logger.Printf("[WARN] Control plane failed to start: %v", err)
			}
			if _, err := sup.startSvelteDev(bootCtx); err != nil {
				c.Logger.Printf("[WARN] Svelte dev server failed to start: %v", err)
			} else {
				if err := sup.waitForSvelteReady(30 * time.Second); err != nil {
					c.Logger.Printf("[WARN] Svelte dev server not ready after 30s: %v", err)
				}
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
			logsDir := getLogsDir(c)
			binDir := getBinDir(c)
			sup := NewSupervisor(logsDir, binDir)
			result := &ServiceStatusResult{
				Success:   true,
				State:     "RUNNING",
				Processes: make(map[string]ProcessSnapshot),
				Timestamp: time.Now().Unix(),
			}
			sup.mu.RLock()
			for name, proc := range sup.processes {
				proc.mu.RLock()
				snap := ProcessSnapshot{
					State:   string(proc.State),
					PID:     proc.PID,
					LogPath: proc.LogPath,
				}
				if !proc.StartedAt.IsZero() {
					snap.StartedAt = proc.StartedAt.Format(time.RFC3339)
				}
				proc.mu.RUnlock()
				result.Processes[name] = snap
			}
			sup.mu.RUnlock()
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
			sup.mu.Lock()
			if proc, exists := sup.processes["control_plane_api"]; exists {
				if proc.Cmd != nil && proc.Cmd.Process != nil {
					_ = proc.Cmd.Process.Kill()
				}
				delete(sup.processes, "control_plane_api")
			}
			sup.mu.Unlock()
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
				if ready {
					result.Success = true
					result.State = "RUNNING"
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