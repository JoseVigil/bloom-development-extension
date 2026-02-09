package bootstrap

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

func createTemporalDiagnosticsCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "diagnostics",
		Short: "Run comprehensive Temporal diagnostics",
		Long:  "Checks Temporal installation, ports, health, logs, database, and telemetry",
		Annotations: map[string]string{
			"category": "TEMPORAL_SERVER",
			"json_response": `{
  "executable": {
    "path": "C:\\Users\\user\\AppData\\Local\\BloomNucleus\\bin\\temporal\\temporal.exe",
    "exists": true,
    "size": 123456789
  },
  "health": {
    "operational": true,
    "state": "RUNNING",
    "grpc_responding": true,
    "ui_responding": true
  },
  "database": {
    "path": "C:\\Users\\user\\AppData\\Local\\BloomNucleus\\logs\\temporal\\temporal.db",
    "exists": true,
    "size": 98304
  },
  "pid_file": {
    "path": "C:\\Users\\user\\AppData\\Local\\BloomNucleus\\logs\\temporal\\temporal.pid",
    "exists": true,
    "pid": 12345
  },
  "overall_status": "HEALTHY"
}`,
		},
		Example: `  nucleus temporal diagnostics
  nucleus --json temporal diagnostics`,
		Run: func(cmd *cobra.Command, args []string) {
			jsonOutput := getGlobalJSONFlag(cmd)

			if jsonOutput {
				runDiagnosticsJSON(c)
			} else {
				runDiagnosticsHuman(c)
			}
		},
	}

	return cmd
}

func runDiagnosticsJSON(c *core.Core) {
	result := map[string]interface{}{}

	temporalPath, _ := getTemporalExecutablePath()
	execInfo := map[string]interface{}{
		"path":   temporalPath,
		"exists": false,
	}
	if info, err := os.Stat(temporalPath); err == nil {
		execInfo["exists"] = true
		execInfo["size"] = info.Size()
	}
	result["executable"] = execInfo

	operational, state, healthChecks := checkTemporalHealth()
	result["health"] = map[string]interface{}{
		"operational":     operational,
		"state":           state,
		"grpc_responding": healthChecks["grpc"],
		"ui_responding":   healthChecks["ui"],
	}

	dbPath := filepath.Join(c.Paths.Logs, "temporal", "temporal.db")
	dbInfo := map[string]interface{}{
		"path":   dbPath,
		"exists": false,
	}
	if info, err := os.Stat(dbPath); err == nil {
		dbInfo["exists"] = true
		dbInfo["size"] = info.Size()
	}
	result["database"] = dbInfo

	pidPath := filepath.Join(c.Paths.Logs, "temporal", "temporal.pid")
	pidInfo := map[string]interface{}{
		"path":   pidPath,
		"exists": false,
	}
	if pidData, err := os.ReadFile(pidPath); err == nil {
		pidInfo["exists"] = true
		if pid, err := strconv.Atoi(strings.TrimSpace(string(pidData))); err == nil {
			pidInfo["pid"] = pid
		}
	}
	result["pid_file"] = pidInfo

	if execInfo["exists"].(bool) && operational {
		result["overall_status"] = "HEALTHY"
	} else if execInfo["exists"].(bool) {
		result["overall_status"] = "INSTALLED_NOT_RUNNING"
	} else {
		result["overall_status"] = "NOT_INSTALLED"
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))

	switch result["overall_status"] {
	case "HEALTHY":
		os.Exit(ExitSuccess)
	case "INSTALLED_NOT_RUNNING":
		os.Exit(ExitNotRunning)
	case "NOT_INSTALLED":
		os.Exit(ExitNotInstalled)
	default:
		os.Exit(ExitGeneralError)
	}
}

func runDiagnosticsHuman(c *core.Core) {
	logger, err := core.InitLogger(&c.Paths, "TEMPORAL_SERVER", false)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
		os.Exit(ExitGeneralError)
	}
	defer logger.Close()

	logger.Info("=== TEMPORAL DIAGNOSTICS ===")

	logger.Info("[1] Temporal Executable")
	temporalPath, _ := getTemporalExecutablePath()
	execExists := false
	if info, err := os.Stat(temporalPath); err == nil {
		execExists = true
		logger.Success("  Found: %s", temporalPath)
		logger.Info("  Size: %d bytes", info.Size())
	} else {
		logger.Error("  NOT FOUND: %s", temporalPath)
	}

	logger.Info("[2] Temporal Health")
	operational, state, healthChecks := checkTemporalHealth()
	if operational {
		logger.Success("  Status: %s", state)
		logger.Info("  gRPC: %v", healthChecks["grpc"])
		logger.Info("  UI:   %v", healthChecks["ui"])
	} else {
		logger.Warning("  Status: %s", state)
		logger.Info("  Use 'nucleus temporal start' to start")
	}

	logger.Info("[3] Database")
	dbPath := filepath.Join(c.Paths.Logs, "temporal", "temporal.db")
	if info, err := os.Stat(dbPath); err == nil {
		logger.Success("  Database: %s", dbPath)
		logger.Info("  Size: %d bytes", info.Size())
	} else {
		logger.Info("  Database not found (will be created on first run)")
	}

	logger.Info("[4] PID File")
	pidPath := filepath.Join(c.Paths.Logs, "temporal", "temporal.pid")
	if pidData, err := os.ReadFile(pidPath); err == nil {
		logger.Success("  PID file: %s", pidPath)
		if pid, err := strconv.Atoi(strings.TrimSpace(string(pidData))); err == nil {
			logger.Info("  PID: %d", pid)
		}
	} else {
		logger.Info("  PID file not found (no active process)")
	}

	logger.Info("[5] Logs")
	nucleusLogs := filepath.Join(c.Paths.Logs, "nucleus")
	temporalLogs := filepath.Join(c.Paths.Logs, "temporal")
	
	if _, err := os.Stat(nucleusLogs); err == nil {
		logger.Success("  Nucleus logs: %s", nucleusLogs)
	} else {
		logger.Warning("  Nucleus logs NOT FOUND: %s", nucleusLogs)
	}
	
	if _, err := os.Stat(temporalLogs); err == nil {
		logger.Success("  Temporal logs: %s", temporalLogs)
	} else {
		logger.Info("  Temporal logs (will be created): %s", temporalLogs)
	}

	logger.Info("=== SUMMARY ===")
	
	var exitCode int
	if execExists && operational {
		logger.Success("Overall Status: HEALTHY")
		exitCode = ExitSuccess
	} else if execExists && !operational {
		logger.Warning("Overall Status: INSTALLED_NOT_RUNNING")
		logger.Info("Run: nucleus temporal start")
		exitCode = ExitNotRunning
	} else {
		logger.Error("Overall Status: NOT_INSTALLED")
		logger.Info("Temporal executable not found. Please install Temporal.")
		exitCode = ExitNotInstalled
	}

	os.Exit(exitCode)
}