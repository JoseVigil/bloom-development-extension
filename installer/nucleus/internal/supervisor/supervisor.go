// File: internal/supervisor/supervisor.go
// Core supervisor business logic - NO COMMAND REGISTRATION
// Commands are in separate files following NUCLEUS master guide v2.0
package supervisor

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

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

	// Check if already running
	if proc, exists := s.processes["temporal_server"]; exists {
		if proc.State == StateReady {
			return proc, nil
		}
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

	// Check if already running
	if proc, exists := s.processes["nucleus_worker"]; exists {
		if proc.State == StateReady {
			return proc, nil
		}
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

	// brain.exe service start — bloqueante, spawn desacoplado con Start()
	cmd := exec.CommandContext(ctx, brainBin, "service", "start")
	cmd.Stdout = logFile
	cmd.Stderr = logFile
	cmd.Dir = filepath.Dir(brainBin)

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