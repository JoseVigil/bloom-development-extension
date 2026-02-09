package bootstrap

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("TEMPORAL_SERVER", createTemporalCommand)
}

// createTemporalCommand crea el comando padre 'temporal'
func createTemporalCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "temporal",
		Short: "Manage Temporal Server lifecycle",
		Long:  "Commands to start, stop, monitor and manage the embedded Temporal Server",
		Annotations: map[string]string{
			"category": "TEMPORAL_SERVER",
		},
	}

	// Agregar subcomandos
	cmd.AddCommand(createTemporalStartCommand(c))
	cmd.AddCommand(createTemporalStopCommand(c))
	cmd.AddCommand(createTemporalStatusCommand(c))
	cmd.AddCommand(createTemporalDiagnosticsCommand(c))
	cmd.AddCommand(createTemporalEnsureCommand(c))
	cmd.AddCommand(temporalCleanupCmd(c))
	cmd.AddCommand(temporalForceStopCmd(c))

	return cmd
}

func createTemporalStartCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "start",
		Short: "Start Temporal Server (interactive mode)",
		Long: `Start Temporal Server in interactive mode.

This command starts the Temporal development server with:
- gRPC on port 7233 (default)
- UI on port 8233
- SQLite database
- Pretty-formatted logs

The server runs in foreground and can be stopped with Ctrl+C.

For non-interactive automation (Electron/installers), use 'nucleus temporal ensure'.`,
		Args: cobra.NoArgs,
		Annotations: map[string]string{
			"category": "TEMPORAL_SERVER",
			"json_response": `{
  "temporal": {
    "state": "RUNNING",
    "pid": 12345,
    "grpc_port": 7233,
    "ui_port": 8233,
    "ui_url": "http://localhost:8233",
    "grpc_url": "localhost:7233"
  }
}`,
		},
		Example: `  nucleus temporal start
  nucleus --json temporal start`,
		Run: func(cmd *cobra.Command, args []string) {
			runTemporalStart(c)
		},
	}

	return cmd
}

func createTemporalStopCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "stop",
		Short: "Stop running Temporal Server",
		Long:  "Stop the currently running Temporal Server instance",
		Args:  cobra.NoArgs,
		Annotations: map[string]string{
			"category": "TEMPORAL_SERVER",
			"json_response": `{
  "temporal": {
    "state": "STOPPED",
    "message": "Temporal Server stopped successfully"
  }
}`,
		},
		Example: `  nucleus temporal stop
  nucleus --json temporal stop`,
		Run: func(cmd *cobra.Command, args []string) {
			runTemporalStop(c)
		},
	}

	return cmd
}

func createTemporalStatusCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Check Temporal Server status",
		Long:  "Check if Temporal Server is running and responding",
		Args:  cobra.NoArgs,
		Annotations: map[string]string{
			"category": "TEMPORAL_SERVER",
			"json_response": `{
  "temporal": {
    "operational": true,
    "state": "RUNNING",
    "ui_port": 8233,
    "grpc_port": 7233,
    "ui_url": "http://localhost:8233",
    "grpc_url": "localhost:7233",
    "health_checks": {
      "grpc": true,
      "ui": true
    }
  }
}`,
		},
		Example: `  nucleus temporal status
  nucleus --json temporal status`,
		Run: func(cmd *cobra.Command, args []string) {
			jsonOutput := getGlobalJSONFlag(cmd)

			operational, state, healthChecks := checkTemporalHealth()

			status := map[string]interface{}{
				"temporal": map[string]interface{}{
					"operational":   operational,
					"state":         state,
					"ui_port":       8233,
					"grpc_port":     7233,
					"ui_url":        "http://localhost:8233",
					"grpc_url":      "localhost:7233",
					"health_checks": healthChecks,
				},
			}

			if jsonOutput {
				output, _ := json.MarshalIndent(status, "", "  ")
				fmt.Println(string(output))
			} else {
				logger, err := core.InitLogger(&c.Paths, "TEMPORAL_SERVER", false)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
					os.Exit(ExitGeneralError)
				}
				defer logger.Close()

				logger.Info("Checking Temporal Server status...")

				if operational {
					logger.Success("Temporal Server: %s", state)
					logger.Info("✓ gRPC endpoint: localhost:7233 [%v]", healthChecks["grpc"])
					logger.Info("✓ UI endpoint: http://localhost:8233 [%v]", healthChecks["ui"])
				} else {
					logger.Warning("Temporal Server: %s", state)
					logger.Info("✗ gRPC endpoint: localhost:7233 [no response]")
					logger.Info("✗ UI endpoint: http://localhost:8233 [no response]")
					logger.Info("Use 'nucleus temporal start' to start the server")
				}
			}

			if !operational {
				os.Exit(ExitNotRunning)
			}
		},
	}

	return cmd
}

func runTemporalStart(c *core.Core) {
	jsonOutput := getGlobalJSONFlag(nil)

	logger, err := core.InitLogger(&c.Paths, "TEMPORAL_SERVER", false)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
		os.Exit(ExitGeneralError)
	}
	defer logger.Close()

	// Verificar si Temporal ya está corriendo
	if isPortListening(7233) {
		if jsonOutput {
			response := map[string]interface{}{
				"temporal": map[string]interface{}{
					"state":   "ALREADY_RUNNING",
					"message": "Temporal Server is already running on port 7233",
				},
			}
			output, _ := json.MarshalIndent(response, "", "  ")
			fmt.Println(string(output))
		} else {
			logger.Warning("Temporal Server is already running on port 7233")
			logger.Info("Use 'nucleus temporal status' to check health")
		}
		os.Exit(ExitSuccess)
		return
	}

	// Obtener ruta del ejecutable
	temporalPath, err := getTemporalExecutablePath()
	if err != nil {
		logger.Error("Temporal executable not found: %v", err)
		os.Exit(ExitNotInstalled)
		return
	}

	// Crear proceso
	tp := NewTemporalProcess(c.Paths.Logs, temporalPath)

	// Configurar signal handling
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigChan
		logger.Info("\nReceived interrupt signal, shutting down...")
		cancel()
		tp.Stop(logger)
		os.Exit(0)
	}()

	// Iniciar Temporal
	logger.Info("Starting Temporal Server...")
	if err := tp.Start(ctx, logger); err != nil {
		logger.Error("Failed to start Temporal: %v", err)
		os.Exit(ExitGeneralError)
		return
	}

	if jsonOutput {
		response := map[string]interface{}{
			"temporal": map[string]interface{}{
				"state":    "RUNNING",
				"pid":      tp.cmd.Process.Pid,
				"grpc_port": 7233,
				"ui_port":   8233,
				"ui_url":    "http://localhost:8233",
				"grpc_url":  "localhost:7233",
			},
		}
		output, _ := json.MarshalIndent(response, "", "  ")
		fmt.Println(string(output))
	} else {
		logger.Success("✅ Temporal Server started successfully")
		logger.Info("   UI:   http://localhost:8233")
		logger.Info("   gRPC: localhost:7233")
		logger.Info("\nPress Ctrl+C to stop the server")
	}

	// Esperar a que termine
	if err := tp.Wait(); err != nil {
		logger.Warning("Temporal process exited: %v", err)
	}
}

func runTemporalStop(c *core.Core) {
	jsonOutput := getGlobalJSONFlag(nil)

	logger, err := core.InitLogger(&c.Paths, "TEMPORAL_SERVER", false)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
		os.Exit(ExitGeneralError)
	}
	defer logger.Close()

	pidFile := getPIDFilePath(c)

	// Cargar PID
	pid, err := loadPID(pidFile)
	if err != nil {
		if jsonOutput {
			response := map[string]interface{}{
				"temporal": map[string]interface{}{
					"state":   "NOT_RUNNING",
					"message": "No PID file found - Temporal is not running",
				},
			}
			output, _ := json.MarshalIndent(response, "", "  ")
			fmt.Println(string(output))
		} else {
			logger.Info("Temporal Server is not running (no PID file)")
		}
		os.Exit(ExitNotRunning)
		return
	}

	// Verificar si el proceso está corriendo
	if !isProcessRunning(pid) {
		os.Remove(pidFile)
		if jsonOutput {
			response := map[string]interface{}{
				"temporal": map[string]interface{}{
					"state":   "NOT_RUNNING",
					"message": "Stale PID file cleaned up",
				},
			}
			output, _ := json.MarshalIndent(response, "", "  ")
			fmt.Println(string(output))
		} else {
			logger.Info("Temporal Server is not running (stale PID)")
		}
		os.Exit(ExitNotRunning)
		return
	}

	// Detener proceso
	logger.Info("Stopping Temporal Server (PID: %d)...", pid)

	process, err := os.FindProcess(pid)
	if err != nil {
		logger.Error("Failed to find process: %v", err)
		os.Exit(ExitGeneralError)
		return
	}

	// Enviar señal de terminación
	if err := process.Signal(os.Interrupt); err != nil {
		logger.Warning("Failed to send interrupt, trying kill: %v", err)
		if err := process.Kill(); err != nil {
			logger.Error("Failed to kill process: %v", err)
			os.Exit(ExitGeneralError)
			return
		}
	}

	// Limpiar PID file
	os.Remove(pidFile)

	if jsonOutput {
		response := map[string]interface{}{
			"temporal": map[string]interface{}{
				"state":   "STOPPED",
				"message": "Temporal Server stopped successfully",
			},
		}
		output, _ := json.MarshalIndent(response, "", "  ")
		fmt.Println(string(output))
	} else {
		logger.Success("✅ Temporal Server stopped")
	}
}