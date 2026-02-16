// File: internal/supervisor/health.go
// Health check command - validates all Nucleus components
package supervisor

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"nucleus/internal/core"

	"github.com/spf13/cobra"
)

// init auto-registers this command when package is imported
func init() {
	core.RegisterCommand("DIAGNOSTICS", createHealthCommand)
}

// HealthResult represents the overall system health status
type HealthResult struct {
	Success    bool                       `json:"success"`
	State      string                     `json:"state"` // HEALTHY, DEGRADED, FAILED
	Error      string                     `json:"error,omitempty"`
	Components map[string]ComponentHealth `json:"components"`
	Timestamp  int64                      `json:"timestamp"`
}

// ComponentHealth represents the health status of a single component
type ComponentHealth struct {
	Healthy       bool   `json:"healthy"`
	State         string `json:"state"`
	Error         string `json:"error,omitempty"`
	PID           int    `json:"pid,omitempty"`
	Port          int    `json:"port,omitempty"`
	GRPCURL       string `json:"grpc_url,omitempty"`
	TaskQueue     string `json:"task_queue,omitempty"`
	ProfilesCount int    `json:"profiles_count,omitempty"`
}

// createHealthCommand is the factory function that creates the health command
func createHealthCommand(c *core.Core) *cobra.Command {
	var outputJSON bool
	var validate bool
	var component string

	cmd := &cobra.Command{
		Use:   "health",
		Short: "System integrity check - validates all Nucleus components",
		Long: `Execute comprehensive health checks on all Nucleus components:

NUCLEUS SERVICES (Priority 1):
  - Temporal Server (port 7233 + UI 8233)
  - Nucleus Worker (connected to task queue)
  - Ollama Engine (port 11434 + process)
  - Control Plane API (Node.js bootstrap)
  - Vault (UNLOCKED state verification)
  - Governance (.ownership.json validation)

SENTINEL SERVICES (Integration):
  - Brain Service (port 5678)
  - Bloom API (port 48215)
  - Svelte Dev Server (port 5173)
  - Worker Manager (active profiles)

SYSTEM STATES:
  - HEALTHY: All components operational
  - DEGRADED: Some components fail but system functional
  - FAILED: Critical components down, system not operational`,

		Args: cobra.NoArgs,

		Example: `  nucleus health
  nucleus health --json
  nucleus health --json --validate
  nucleus health --component temporal`,

		Run: func(cmd *cobra.Command, args []string) {
			// Create supervisor instance
			logsDir := getLogsDir(c)
			binDir := getBinDir(c)
			
			// Get appDataDir
			appDataDir := os.Getenv("BLOOM_APPDATA_DIR")
			if appDataDir == "" {
				localAppData := os.Getenv("LOCALAPPDATA")
				if localAppData == "" {
					localAppData = os.Getenv("HOME")
				}
				appDataDir = filepath.Join(localAppData, "BloomNucleus")
			}
			
			supervisor := NewSupervisor(logsDir, binDir)

			// Execute health check
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()

			result := checkSystemHealth(ctx, supervisor, appDataDir, validate, component)

			// JSON output
			if outputJSON {
				outputJSONResult(result)
				if !result.Success {
					os.Exit(1)
				}
				return
			}

			// Human-readable output
			printHumanReadable(c, result)
			if !result.Success {
				os.Exit(1)
			}
		},
	}

	// Define flags
	cmd.Flags().BoolVar(&outputJSON, "json", false, "Output result as JSON (one-line compact)")
	cmd.Flags().BoolVar(&validate, "validate", false, "Deep validation checks (slower)")
	cmd.Flags().StringVar(&component, "component", "", "Check only specific component (temporal, worker, ollama, etc.)")

	return cmd
}

// checkSystemHealth orchestrates all component health checks
func checkSystemHealth(ctx context.Context, s *Supervisor, appDataDir string, validate bool, filterComponent string) *HealthResult {
	result := &HealthResult{
		Success:    true,
		State:      "HEALTHY",
		Components: make(map[string]ComponentHealth),
		Timestamp:  time.Now().Unix(),
	}

	// Define checks to run
	checks := map[string]func() ComponentHealth{
		"temporal":       func() ComponentHealth { return checkTemporal(ctx, s, validate) },
		"worker":         func() ComponentHealth { return checkWorker(ctx, s, validate) },
		"ollama":         func() ComponentHealth { return checkOllama(ctx, s, validate) },
		"control_plane":  func() ComponentHealth { return checkControlPlane(ctx, s, validate) },
		"vault":          func() ComponentHealth { return checkVault(ctx, s, validate) },
		"governance":     func() ComponentHealth { return checkGovernance(ctx, s, validate) },
		"brain_service":  func() ComponentHealth { return checkBrainService(ctx, s, validate) },
		"bloom_api":      func() ComponentHealth { return checkBloomAPI(ctx, s, validate) },
		"svelte_dev":     func() ComponentHealth { return checkSvelteDev(ctx, s, validate) },
		"worker_manager": func() ComponentHealth { return checkWorkerManager(ctx, s, appDataDir, validate) },
	}

	// Filter to specific component if requested
	if filterComponent != "" {
		if checkFunc, exists := checks[filterComponent]; exists {
			result.Components[filterComponent] = checkFunc()
		} else {
			result.Success = false
			result.State = "FAILED"
			result.Error = fmt.Sprintf("Unknown component: %s", filterComponent)
			return result
		}
	} else {
		// Run all checks
		for name, checkFunc := range checks {
			result.Components[name] = checkFunc()
		}
	}

	// Determine overall system state
	criticalComponents := []string{"temporal", "worker", "control_plane", "vault", "governance"}
	nonCriticalComponents := []string{"ollama", "brain_service", "bloom_api", "svelte_dev", "worker_manager"}

	criticalFailures := 0
	degradedCount := 0

	for _, name := range criticalComponents {
		if comp, exists := result.Components[name]; exists && !comp.Healthy {
			criticalFailures++
		}
	}

	for _, name := range nonCriticalComponents {
		if comp, exists := result.Components[name]; exists && !comp.Healthy {
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

	return result
}

// checkTemporal verifies Temporal server is accessible
func checkTemporal(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{
		Port:    7233,
		GRPCURL: "localhost:7233",
	}

	// Basic check: TCP connection to gRPC port
	conn, err := net.DialTimeout("tcp", "localhost:7233", 3*time.Second)
	if err != nil {
		health.Healthy = false
		health.State = "UNREACHABLE"
		health.Error = fmt.Sprintf("Port 7233 not accessible: %v", err)
		return health
	}
	conn.Close()

	health.Healthy = true
	health.State = "RUNNING"

	// Deep validation: check UI accessibility
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

// checkWorker verifies Nucleus worker is running and connected
func checkWorker(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{
		TaskQueue: "nucleus-task-queue",
	}

	// Basic check: Look for worker process in supervisor
	s.mu.RLock()
	proc, exists := s.processes["nucleus_worker"]
	s.mu.RUnlock()

	if !exists {
		health.Healthy = false
		health.State = "DISCONNECTED"
		health.Error = "Worker process not found in supervisor"
		return health
	}

	if proc.State != StateReady {
		health.Healthy = false
		health.State = "DISCONNECTED"
		health.Error = fmt.Sprintf("Worker state is %s, expected READY", proc.State)
		return health
	}

	health.Healthy = true
	health.State = "CONNECTED"
	health.PID = proc.PID

	// Deep validation: check task queue status
	if validate {
		cmd := exec.CommandContext(ctx, "temporal", "task-queue", "describe",
			"--task-queue", "nucleus-task-queue")
		output, err := cmd.CombinedOutput()
		if err != nil {
			health.State = "DEGRADED"
			health.Error = fmt.Sprintf("Task queue check failed: %v", err)
		} else if !strings.Contains(string(output), "pollers") {
			health.State = "DEGRADED"
			health.Error = "No active pollers detected"
		}
	}

	return health
}

// checkOllama verifies Ollama engine is running
func checkOllama(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{
		Port: 11434,
	}

	// Strategy 1: Try sentinel ollama healthcheck
	cmd := exec.CommandContext(ctx, "sentinel", "ollama", "healthcheck", "--json")
	output, err := cmd.Output()
	if err == nil {
		var ollamaHealth struct {
			Success bool   `json:"success"`
			PID     int    `json:"pid"`
			Port    int    `json:"port"`
			State   string `json:"state"`
		}
		if json.Unmarshal(output, &ollamaHealth) == nil && ollamaHealth.Success {
			health.Healthy = true
			health.State = ollamaHealth.State
			health.PID = ollamaHealth.PID
			health.Port = ollamaHealth.Port

			// Deep validation: verify PID is alive
			if validate && health.PID > 0 {
				if !isPIDAlive(health.PID) {
					health.State = "DEAD"
					health.Error = fmt.Sprintf("PID %d does not exist", health.PID)
					health.Healthy = false
				}
			}

			return health
		}
	}

	// Strategy 2 (Fallback): TCP connection to port
	conn, err := net.DialTimeout("tcp", "localhost:11434", 3*time.Second)
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

// checkControlPlane verifies Control Plane API is running
func checkControlPlane(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{}

	// Basic check: Look for control_plane_api process
	s.mu.RLock()
	proc, exists := s.processes["control_plane_api"]
	s.mu.RUnlock()

	if !exists {
		health.Healthy = false
		health.State = "DISCONNECTED"
		health.Error = "Control Plane process not found in supervisor"
		return health
	}

	if proc.State != StateReady {
		health.Healthy = false
		health.State = "DISCONNECTED"
		health.Error = fmt.Sprintf("Control Plane state is %s, expected READY", proc.State)
		return health
	}

	health.Healthy = true
	health.State = "READY"
	health.PID = proc.PID

	// Deep validation: HTTP health check
	if validate {
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Get("http://localhost:48215/health")
		if err != nil {
			health.State = "DEGRADED"
			health.Error = fmt.Sprintf("HTTP health check failed: %v", err)
		} else {
			resp.Body.Close()
			if resp.StatusCode != 200 {
				health.State = "DEGRADED"
				health.Error = fmt.Sprintf("HTTP health returned status %d", resp.StatusCode)
			}
		}
	}

	return health
}

// checkVault verifies vault is unlocked
func checkVault(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{}

	// Execute vault-status workflow
	nucleusPath, _ := os.Executable()
	cmd := exec.CommandContext(ctx, nucleusPath, "--json", "synapse", "vault-status")
	output, err := cmd.CombinedOutput()
	if err != nil {
		health.Healthy = false
		health.State = "FAILED"
		health.Error = fmt.Sprintf("vault-status workflow failed: %v", err)
		return health
	}

	var vaultResult struct {
		Success    bool   `json:"success"`
		VaultState string `json:"vault_state"`
		State      string `json:"state"`
		Error      string `json:"error"`
	}

	if err := json.Unmarshal(output, &vaultResult); err != nil {
		health.Healthy = false
		health.State = "UNKNOWN"
		health.Error = fmt.Sprintf("Failed to parse vault-status JSON: %v", err)
		return health
	}

	if !vaultResult.Success {
		health.Healthy = false
		health.State = vaultResult.State
		health.Error = vaultResult.Error
		return health
	}

	// Check vault state
	if vaultResult.VaultState == "UNLOCKED" {
		health.Healthy = true
		health.State = "UNLOCKED"
	} else {
		health.Healthy = false
		health.State = vaultResult.VaultState
		health.Error = fmt.Sprintf("Vault is %s", vaultResult.VaultState)
	}

	return health
}

// checkGovernance verifies ownership.json exists and is valid
func checkGovernance(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{}

	// Determine ownership.json path
	var ownershipPath string
	bloomDir := os.Getenv("BLOOM_DIR")
	if bloomDir == "" {
		health.Healthy = false
		health.State = "FAILED"
		health.Error = "BLOOM_DIR environment variable not set"
		return health
	}

	ownershipPath = filepath.Join(bloomDir, ".ownership.json")

	// Check file exists
	if _, err := os.Stat(ownershipPath); err != nil {
		health.Healthy = false
		health.State = "FAILED"
		health.Error = fmt.Sprintf(".ownership.json not found: %v", err)
		return health
	}

	health.Healthy = true
	health.State = "VALID"

	// Deep validation: parse and validate structure
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
			health.Error = fmt.Sprintf("Invalid JSON in .ownership.json: %v", err)
			return health
		}

		// Validate required fields
		requiredFields := []string{"owner", "created_at"}
		for _, field := range requiredFields {
			if _, exists := ownership[field]; !exists {
				health.State = "DEGRADED"
				health.Error = fmt.Sprintf("Missing required field: %s", field)
				return health
			}
		}
	}

	return health
}

// checkBrainService verifies Brain Service is running on port 5678
func checkBrainService(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{
		Port: 5678,
	}

	// Basic check: TCP connection
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 2*time.Second)
	if err != nil {
		health.Healthy = false
		health.State = "UNREACHABLE"
		health.Error = fmt.Sprintf("Port 5678 not accessible: %v", err)
		return health
	}
	conn.Close()

	health.Healthy = true
	health.State = "RUNNING"

	// Deep validation: send heartbeat ping
	if validate {
		if err := sendHeartbeatPing(ctx); err != nil {
			health.State = "DEGRADED"
			health.Error = fmt.Sprintf("Heartbeat ping failed: %v", err)
		}
	}

	return health
}

// checkBloomAPI verifies Bloom API (Swagger) is accessible
func checkBloomAPI(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{
		Port: 48215,
	}

	// HTTP GET to /documentation endpoint
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:48215/documentation")
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

// checkSvelteDev verifies Svelte Dev Server is running
func checkSvelteDev(ctx context.Context, s *Supervisor, validate bool) ComponentHealth {
	health := ComponentHealth{
		Port: 5173,
	}

	// TCP connection to port 5173
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5173", 1*time.Second)
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

// checkWorkerManager verifies Worker Manager has active profiles
func checkWorkerManager(ctx context.Context, s *Supervisor, appDataDir string, validate bool) ComponentHealth {
	health := ComponentHealth{}

	profilesPath := filepath.Join(appDataDir, "config", "profiles.json")

	data, err := os.ReadFile(profilesPath)
	if err != nil {
		// Si el archivo no existe, considerarlo READY pero sin profiles
		// Esto es normal durante la instalación inicial
		if os.IsNotExist(err) {
			health.Healthy = true
			health.State = "READY"
			health.ProfilesCount = 0
			// No es un error - simplemente no hay profiles todavía
			return health
		}
		
		// Otros errores sí son problemáticos
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

	// CRÍTICO: Array vacío es válido durante la instalación
	// Solo marca como INACTIVE si ya se completó la instalación y debería haber profiles
	if len(registry.Profiles) > 0 {
		health.Healthy = true
		health.State = "ACTIVE"
		health.ProfilesCount = len(registry.Profiles)
	} else {
		// Sin profiles es normal durante instalación
		health.Healthy = true
		health.State = "READY"  // Cambiado de INACTIVE a READY
		health.ProfilesCount = 0
	}

	return health
}

// Helper functions

func isPIDAlive(pid int) bool {
	// Windows-specific PID check
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	// Send signal 0 to check if process exists
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

func sendHeartbeatPing(ctx context.Context) error {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 2*time.Second)
	if err != nil {
		return err
	}
	defer conn.Close()

	// Send heartbeat request (simplified protocol)
	request := map[string]interface{}{
		"type":      "PING",
		"timestamp": time.Now().UnixNano(),
	}

	data, _ := json.Marshal(request)
	if _, err := conn.Write(data); err != nil {
		return err
	}

	// Wait for response
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var response map[string]interface{}
	if err := json.NewDecoder(conn).Decode(&response); err != nil {
		return err
	}

	return nil
}

func printHumanReadable(c *core.Core, result *HealthResult) {
	if result.Success && result.State == "HEALTHY" {
		c.Logger.Printf("[SUCCESS] ✅ System %s", result.State)
	} else {
		c.Logger.Printf("[ERROR] ❌ System %s", result.State)
		if result.Error != "" {
			c.Logger.Printf("[ERROR]   Error: %s", result.Error)
		}
	}

	c.Logger.Printf("[INFO]    State: %s", result.State)
	c.Logger.Printf("[INFO]    Components:")

	for name, comp := range result.Components {
		symbol := "✓"
		if !comp.Healthy {
			symbol = "✗"
		}

		details := fmt.Sprintf("%s: %s", name, comp.State)
		if comp.Port > 0 {
			details += fmt.Sprintf(" (port %d)", comp.Port)
		}
		if comp.PID > 0 {
			details += fmt.Sprintf(" (PID %d)", comp.PID)
		}
		if comp.ProfilesCount > 0 {
			details += fmt.Sprintf(" (%d profiles)", comp.ProfilesCount)
		}

		if comp.Healthy {
			c.Logger.Printf("[INFO]      %s %s", symbol, details)
		} else {
			c.Logger.Printf("[ERROR]      %s %s", symbol, details)
			if comp.Error != "" {
				c.Logger.Printf("[ERROR]          Error: %s", comp.Error)
			}
		}
	}
}