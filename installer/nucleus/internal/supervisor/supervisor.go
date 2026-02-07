// File: internal/supervisor/supervisor.go
// Core supervisor business logic - NO COMMAND REGISTRATION
// Commands are in separate files following NUCLEUS master guide v2.0
package supervisor

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/gofrs/flock"
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

// CheckVaultStatus queries the vault status via Synapse
func (s *Supervisor) CheckVaultStatus(ctx context.Context) (*VaultStatusResult, error) {
	cmd := exec.CommandContext(ctx, "nucleus", "--json", "synapse", "vault-status")
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
	cmd := exec.CommandContext(ctx, "nucleus", "--json", "synapse", "start-ollama")
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

// updateTelemetry writes process state to telemetry.json with atomic locking
func (s *Supervisor) updateTelemetry(proc *ManagedProcess) {
	telemetryPath := filepath.Join(s.logsDir, "telemetry.json")
	lockPath := telemetryPath + ".lock"

	lock := flock.New(lockPath)

	// Retry with backoff
	for i := 0; i < 5; i++ {
		locked, err := lock.TryLock()
		if err == nil && locked {
			defer lock.Unlock()
			break
		}
		time.Sleep(time.Duration(50+i*30) * time.Millisecond)
	}

	// Read existing telemetry
	var telemetry map[string]interface{}
	data, err := os.ReadFile(telemetryPath)
	if err == nil {
		json.Unmarshal(data, &telemetry)
	}
	if telemetry == nil {
		telemetry = make(map[string]interface{})
	}

	streams, ok := telemetry["active_streams"].(map[string]interface{})
	if !ok {
		streams = make(map[string]interface{})
		telemetry["active_streams"] = streams
	}

	// Update stream
	streams[proc.Name] = map[string]interface{}{
		"label":       fmt.Sprintf("🔧 %s", proc.Name),
		"path":        proc.LogPath,
		"priority":    2,
		"pid":         proc.PID,
		"state":       string(proc.State),
		"last_update": time.Now().UTC().Format(time.RFC3339),
	}

	// Write atomically
	tmpPath := telemetryPath + ".tmp"
	newData, _ := json.MarshalIndent(telemetry, "", "  ")
	os.WriteFile(tmpPath, newData, 0644)
	os.Rename(tmpPath, telemetryPath)
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

// Boot sequence helper methods

func (s *Supervisor) verifyTemporalServer(ctx context.Context) error {
	// TODO: Implement port 7233 check
	return nil
}

func (s *Supervisor) verifyWorkerRunning(ctx context.Context) error {
	// TODO: Implement worker status check
	return nil
}

func (s *Supervisor) bootGovernance(ctx context.Context, simulation bool) error {
	var ownershipPath string

	if simulation {
		ownershipPath = filepath.Join("installer", "nucleus", "scripts",
			"simulation_env", ".bloom", ".ownership.json")
	} else {
		bloomDir := os.Getenv("BLOOM_DIR")
		if bloomDir == "" {
			return fmt.Errorf("BLOOM_DIR not set")
		}
		ownershipPath = filepath.Join(bloomDir, ".ownership.json")
	}

	if _, err := os.Stat(ownershipPath); err != nil {
		return fmt.Errorf("ownership.json not found: %w", err)
	}

	return nil
}

func (s *Supervisor) bootControlPlane(ctx context.Context, simulation bool) (*ManagedProcess, error) {
	bootstrapScript := filepath.Join(s.binDir, "bootstrap", "server-bootstrap.js")

	env := []string{
		"BLOOM_USER_ROLE=" + os.Getenv("BLOOM_USER_ROLE"),
		"BLOOM_VAULT_STATE=UNLOCKED",
		"BLOOM_WORKER_RUNNING=true",
		fmt.Sprintf("BLOOM_SIMULATION_MODE=%t", simulation),
		"BLOOM_LOGS_DIR=" + s.logsDir,
	}

	proc, err := s.StartNodeProcess(ctx, "control_plane_api", bootstrapScript, env)
	if err != nil {
		return nil, err
	}

	// Wait for server to be ready
	time.Sleep(3 * time.Second)

	return proc, nil
}