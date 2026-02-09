package bootstrap  

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("TEMPORAL_SERVER", temporalCleanupCmd)
}

// temporalCleanupCmd implementa la lógica de limpieza conservadora
func temporalCleanupCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "cleanup",
		Short: "Clean up zombie Temporal processes on port 7233",
		Long: `Detects and terminates orphaned temporal.exe processes that are occupying port 7233.
Only kills processes that are verified to be Temporal executables from BloomNucleus paths.
Conservative approach - validates before terminating.`,
		Annotations: map[string]string{
			"category": "TEMPORAL_SERVER",
			"json_response": `{
  "command": "temporal_cleanup",
  "port": 7233,
  "found_process": true,
  "pid": 19580,
  "executable": "C:\\Users\\user\\AppData\\Local\\BloomNucleus\\bin\\temporal\\temporal.exe",
  "action_taken": "killed",
  "port_free_after": true,
  "errors": []
}`,
		},
		Example: `    nucleus temporal cleanup
    nucleus --json temporal cleanup`,
		Run: func(cmd *cobra.Command, args []string) {
			jsonOutput := getGlobalJSONFlag(cmd)

			if jsonOutput {
				runCleanupJSON(c)
			} else {
				runCleanupHuman(c)
			}
		},
	}

	return cmd
}

// CleanupResult estructura el resultado de la operación cleanup
type CleanupResult struct {
	Command       string   `json:"command"`
	Port          int      `json:"port"`
	FoundProcess  bool     `json:"found_process"`
	PID           int      `json:"pid,omitempty"`
	Executable    string   `json:"executable,omitempty"`
	ActionTaken   string   `json:"action_taken"`
	PortFreeAfter bool     `json:"port_free_after"`
	Reason        string   `json:"reason,omitempty"`
	Errors        []string `json:"errors"`
}

func runCleanupJSON(c *core.Core) {
	result := executeCleanup(c, nil)
	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))

	if len(result.Errors) > 0 {
		os.Exit(ExitGeneralError)
	}
	os.Exit(ExitSuccess)
}

func runCleanupHuman(c *core.Core) {
	logger, err := core.InitLogger(&c.Paths, "TEMPORAL_SERVER", false)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
		os.Exit(ExitGeneralError)
	}
	defer logger.Close()

	logger.Info("=== TEMPORAL CLEANUP ===")
	result := executeCleanup(c, logger)

	logger.Info("=== CLEANUP SUMMARY ===")
	logger.Info("Action: %s", result.ActionTaken)
	
	if result.FoundProcess {
		logger.Info("PID: %d", result.PID)
		logger.Info("Executable: %s", result.Executable)
	}
	
	logger.Info("Port 7233 free: %v", result.PortFreeAfter)

	if len(result.Errors) > 0 {
		logger.Error("Errors encountered:")
		for _, e := range result.Errors {
			logger.Error("  - %s", e)
		}
		os.Exit(ExitGeneralError)
	}

	os.Exit(ExitSuccess)
}

func executeCleanup(c *core.Core, logger *core.Logger) CleanupResult {
	result := CleanupResult{
		Command: "temporal_cleanup",
		Port:    7233,
		Errors:  []string{},
	}

	if logger != nil {
		logger.Info("[1] Checking port 7233 status...")
	}

	// Paso 1: Detectar si el puerto 7233 está en uso
	pid, executable, err := getProcessOnPort(7233)
	if err != nil {
		// Puerto libre o error detectando
		result.FoundProcess = false
		result.ActionTaken = "none"
		result.Reason = "port already free"
		result.PortFreeAfter = true

		if logger != nil {
			logger.Success("Port 7233 is already free - nothing to clean")
		}
		return result
	}

	result.FoundProcess = true
	result.PID = pid
	result.Executable = executable

	if logger != nil {
		logger.Warning("Found process on port 7233")
		logger.Info("  PID: %d", pid)
		logger.Info("  Executable: %s", executable)
	}

	// Paso 2: Validar que el ejecutable es Temporal de BloomNucleus
	if logger != nil {
		logger.Info("[2] Validating process identity...")
	}

	if !isValidTemporalExecutable(executable) {
		result.ActionTaken = "none"
		result.Reason = "process validation failed - not a recognized Temporal executable"
		result.Errors = append(result.Errors, "executable path does not match expected Temporal location")

		if logger != nil {
			logger.Error("VALIDATION FAILED")
			logger.Error("Process does not match expected Temporal executable")
			logger.Error("Expected: temporal.exe in BloomNucleus directory")
			logger.Error("Found: %s", executable)
			logger.Warning("Will NOT terminate this process for safety")
		}
		return result
	}

	if logger != nil {
		logger.Success("Process validated as Temporal")
	}

	// Paso 3: Terminar el proceso
	if logger != nil {
		logger.Info("[3] Terminating process...")
	}

	if err := killProcess(pid); err != nil {
		result.ActionTaken = "kill_failed"
		result.Errors = append(result.Errors, fmt.Sprintf("failed to kill process: %v", err))

		if logger != nil {
			logger.Error("Failed to kill process: %v", err)
		}
		return result
	}

	result.ActionTaken = "killed"

	if logger != nil {
		logger.Success("Process terminated (PID: %d)", pid)
	}

	// Paso 4: Verificar que el puerto quedó libre
	if logger != nil {
		logger.Info("[4] Verifying port is now free...")
	}

	// Pequeña pausa para que el SO libere el puerto
	// time.Sleep(500 * time.Millisecond)

	_, _, portStillInUse := getProcessOnPort(7233)
	result.PortFreeAfter = portStillInUse != nil // nil = error = libre

	if result.PortFreeAfter {
		if logger != nil {
			logger.Success("Port 7233 is now free")
		}
	} else {
		result.Errors = append(result.Errors, "port still occupied after kill")
		if logger != nil {
			logger.Warning("Port 7233 still occupied - may need force-stop")
		}
	}

	// Limpiar PID file si existe
	pidPath := filepath.Join(c.Paths.Logs, "temporal", "temporal.pid")
	if _, err := os.Stat(pidPath); err == nil {
		os.Remove(pidPath)
		if logger != nil {
			logger.Info("Cleaned up stale PID file")
		}
	}

	return result
}

// getProcessOnPort obtiene el PID y ejecutable del proceso dueño de un puerto en Windows
func getProcessOnPort(port int) (int, string, error) {
	// Usar netstat para obtener PID del puerto
	cmd := exec.Command("netstat", "-ano")
	output, err := cmd.Output()
	if err != nil {
		return 0, "", fmt.Errorf("netstat failed: %w", err)
	}

	lines := strings.Split(string(output), "\n")
	portStr := fmt.Sprintf(":%d", port)
	
	for _, line := range lines {
		// Buscar líneas con estado LISTENING en el puerto específico
		if !strings.Contains(line, portStr) || !strings.Contains(line, "LISTENING") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}

		// Último campo es el PID
		pidStr := fields[len(fields)-1]
		pid, err := strconv.Atoi(pidStr)
		if err != nil {
			continue
		}

		// Obtener path del ejecutable usando WMIC
		executable, err := getExecutablePath(pid)
		if err != nil {
			// Si falla obtener el path, aún retornamos el PID
			return pid, "", nil
		}

		return pid, executable, nil
	}

	return 0, "", fmt.Errorf("no process found on port %d", port)
}

// getExecutablePath obtiene el path del ejecutable de un PID usando WMIC
func getExecutablePath(pid int) (string, error) {
	cmd := exec.Command("wmic", "process", "where", fmt.Sprintf("ProcessId=%d", pid), "get", "ExecutablePath")
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("wmic failed: %w", err)
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !strings.Contains(line, "ExecutablePath") {
			return line, nil
		}
	}

	return "", fmt.Errorf("no executable path found for PID %d", pid)
}

// isValidTemporalExecutable valida que el ejecutable sea temporal.exe de BloomNucleus
func isValidTemporalExecutable(path string) bool {
	if path == "" {
		return false
	}

	// Normalizar path
	path = strings.ToLower(filepath.Clean(path))

	// Verificar que sea temporal.exe
	if !strings.HasSuffix(path, "temporal.exe") {
		return false
	}

	// Verificar que esté en directorio BloomNucleus
	if !strings.Contains(path, "bloomnucleus") {
		return false
	}

	return true
}

// killProcess termina un proceso usando taskkill en Windows
func killProcess(pid int) error {
	// taskkill /F /PID <pid>
	cmd := exec.Command("taskkill", "/F", "/PID", strconv.Itoa(pid))
	output, err := cmd.CombinedOutput()
	
	if err != nil {
		return fmt.Errorf("taskkill failed: %v, output: %s", err, string(output))
	}

	return nil
}