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
	core.RegisterCommand("TEMPORAL_SERVER", temporalForceStopCmd)
}

// temporalForceStopCmd implementa la lógica de detención forzada
func temporalForceStopCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "force-stop",
		Short: "Forcefully stop all Temporal processes",
		Long: `Aggressively terminates ALL temporal.exe processes from BloomNucleus paths.
This includes processes not listening on port 7233 and those not tracked by Nucleus.
Use when cleanup is insufficient or Temporal is in an unrecoverable state.`,
		Annotations: map[string]string{
			"category": "TEMPORAL_SERVER",
			"json_response": `{
  "command": "temporal_force_stop",
  "processes_found": 2,
  "processes_killed": 2,
  "port_7233_free": true,
  "state_cleaned": true,
  "details": [
    {
      "pid": 19580,
      "executable": "C:\\Users\\user\\AppData\\Local\\BloomNucleus\\bin\\temporal\\temporal.exe",
      "killed": true
    }
  ],
  "errors": []
}`,
		},
		Example: `    nucleus temporal force-stop
    nucleus --json temporal force-stop`,
		Run: func(cmd *cobra.Command, args []string) {
			jsonOutput := getGlobalJSONFlag(cmd)

			if jsonOutput {
				runForceStopJSON(c)
			} else {
				runForceStopHuman(c)
			}
		},
	}

	return cmd
}

// ForceStopResult estructura el resultado de la operación force-stop
type ForceStopResult struct {
	Command         string              `json:"command"`
	ProcessesFound  int                 `json:"processes_found"`
	ProcessesKilled int                 `json:"processes_killed"`
	Port7233Free    bool                `json:"port_7233_free"`
	StateCleaned    bool                `json:"state_cleaned"`
	Details         []ProcessKillDetail `json:"details"`
	Errors          []string            `json:"errors"`
}

type ProcessKillDetail struct {
	PID        int    `json:"pid"`
	Executable string `json:"executable"`
	Killed     bool   `json:"killed"`
	Error      string `json:"error,omitempty"`
}

type TemporalProcessInfo struct {
	PID        int
	Executable string
}

func runForceStopJSON(c *core.Core) {
	result := executeForceStop(c, nil)
	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))

	if len(result.Errors) > 0 {
		os.Exit(ExitGeneralError)
	}
	os.Exit(ExitSuccess)
}

func runForceStopHuman(c *core.Core) {
	logger, err := core.InitLogger(&c.Paths, "TEMPORAL_SERVER", false)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
		os.Exit(ExitGeneralError)
	}
	defer logger.Close()

	logger.Warning("=== TEMPORAL FORCE-STOP ===")
	logger.Warning("This will terminate ALL Temporal processes")
	
	result := executeForceStop(c, logger)

	logger.Info("=== FORCE-STOP SUMMARY ===")
	logger.Info("Processes found: %d", result.ProcessesFound)
	logger.Info("Processes killed: %d", result.ProcessesKilled)
	logger.Info("Port 7233 free: %v", result.Port7233Free)
	logger.Info("State cleaned: %v", result.StateCleaned)

	if len(result.Errors) > 0 {
		logger.Error("Errors encountered:")
		for _, e := range result.Errors {
			logger.Error("  - %s", e)
		}
		os.Exit(ExitGeneralError)
	}

	logger.Success("Force-stop completed successfully")
	os.Exit(ExitSuccess)
}

func executeForceStop(c *core.Core, logger *core.Logger) ForceStopResult {
	result := ForceStopResult{
		Command: "temporal_force_stop",
		Details: []ProcessKillDetail{},
		Errors:  []string{},
	}

	// Paso 1: Ejecutar cleanup primero (intento conservador)
	if logger != nil {
		logger.Info("[1] Running cleanup first...")
	}

	cleanupResult := executeCleanup(c, logger)
	if cleanupResult.ActionTaken == "killed" {
		result.ProcessesFound++
		result.ProcessesKilled++
		result.Details = append(result.Details, ProcessKillDetail{
			PID:        cleanupResult.PID,
			Executable: cleanupResult.Executable,
			Killed:     true,
		})
	}

	// Paso 2: Buscar TODOS los procesos temporal.exe
	if logger != nil {
		logger.Info("[2] Searching for all Temporal processes...")
	}

	processes, err := findAllTemporalProcesses()
	if err != nil {
		result.Errors = append(result.Errors, fmt.Sprintf("failed to search processes: %v", err))
		if logger != nil {
			logger.Error("Failed to enumerate processes: %v", err)
		}
	}

	if logger != nil {
		logger.Info("Found %d Temporal process(es)", len(processes))
	}

	result.ProcessesFound += len(processes)

	// Paso 3: Matar todos los procesos encontrados
	if logger != nil && len(processes) > 0 {
		logger.Info("[3] Terminating all Temporal processes...")
	}

	for _, proc := range processes {
		if logger != nil {
			logger.Info("  Killing PID %d: %s", proc.PID, proc.Executable)
		}

		detail := ProcessKillDetail{
			PID:        proc.PID,
			Executable: proc.Executable,
		}

		if err := killProcess(proc.PID); err != nil {
			detail.Killed = false
			detail.Error = err.Error()
			result.Errors = append(result.Errors, fmt.Sprintf("failed to kill PID %d: %v", proc.PID, err))
			
			if logger != nil {
				logger.Error("  Failed to kill PID %d: %v", proc.PID, err)
			}
		} else {
			detail.Killed = true
			result.ProcessesKilled++
			
			if logger != nil {
				logger.Success("  Killed PID %d", proc.PID)
			}
		}

		result.Details = append(result.Details, detail)
	}

	// Paso 4: Verificar que el puerto 7233 quedó libre
	if logger != nil {
		logger.Info("[4] Verifying port 7233 is free...")
	}

	_, _, portErr := getProcessOnPort(7233)
	result.Port7233Free = portErr != nil // nil = error = libre

	if result.Port7233Free {
		if logger != nil {
			logger.Success("Port 7233 is now free")
		}
	} else {
		result.Errors = append(result.Errors, "port 7233 still occupied after force-stop")
		if logger != nil {
			logger.Error("WARNING: Port 7233 still occupied after killing all processes")
			logger.Error("This may indicate a process outside BloomNucleus control")
		}
	}

	// Paso 5: Limpiar estado interno
	if logger != nil {
		logger.Info("[5] Cleaning internal state...")
	}

	stateCleaned := cleanInternalState(c, logger)
	result.StateCleaned = stateCleaned

	return result
}

func findAllTemporalProcesses() ([]TemporalProcessInfo, error) {
	processes := []TemporalProcessInfo{}

	cmd := exec.Command("tasklist", "/FO", "CSV", "/NH")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("tasklist failed: %w", err)
	}

	lines := strings.Split(string(output), "\n")
	
	for _, line := range lines {
		if !strings.Contains(strings.ToLower(line), "temporal.exe") {
			continue
		}

		fields := strings.Split(line, ",")
		if len(fields) < 2 {
			continue
		}

		pidStr := strings.Trim(fields[1], "\" ")
		pid, err := strconv.Atoi(pidStr)
		if err != nil {
			continue
		}

		executable, err := getExecutablePath(pid)
		if err != nil {
			executable = "(unknown)"
		}

		if executable != "(unknown)" && !isValidTemporalExecutable(executable) {
			continue
		}

		processes = append(processes, TemporalProcessInfo{
			PID:        pid,
			Executable: executable,
		})
	}

	return processes, nil
}

func cleanInternalState(c *core.Core, logger *core.Logger) bool {
	success := true

	pidPath := filepath.Join(c.Paths.Logs, "temporal", "temporal.pid")
	if _, err := os.Stat(pidPath); err == nil {
		if err := os.Remove(pidPath); err != nil {
			success = false
			if logger != nil {
				logger.Warning("Failed to remove PID file: %v", err)
			}
		} else {
			if logger != nil {
				logger.Info("  Removed PID file")
			}
		}
	}

	if logger != nil && success {
		logger.Success("Internal state cleaned")
	}

	return success
}