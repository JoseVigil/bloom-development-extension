package temporal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

// ────────────────────────────────────────────────────────────────
// EXIT CODES
// ────────────────────────────────────────────────────────────────

const (
	ExitSuccess         = 0
	ExitGeneralError    = 1
	ExitNotRunning      = 2
	ExitNotInstalled    = 3
)

// ────────────────────────────────────────────────────────────────
// TEMPORAL PROCESS MANAGEMENT
// ────────────────────────────────────────────────────────────────

// TemporalProcess maneja el proceso hijo de Temporal
type TemporalProcess struct {
	cmd            *exec.Cmd
	logFile        *os.File
	logsDir        string
	isRunning      bool
	executablePath string
	dbPath         string
	pidFile        string
}

// NewTemporalProcess crea una nueva instancia del proceso Temporal
func NewTemporalProcess(logsDir string, executablePath string) *TemporalProcess {
	return &TemporalProcess{
		logsDir:        logsDir,
		executablePath: executablePath,
		isRunning:      false,
		pidFile:        filepath.Join(logsDir, "temporal", "temporal.pid"),
	}
}

// Start inicia el proceso temporal.exe
func (tp *TemporalProcess) Start(ctx context.Context, logger *core.Logger) error {
	if tp.isRunning {
		return fmt.Errorf("temporal already running")
	}

	// Verificar si ya hay un proceso corriendo
	if existingPID, err := tp.loadPID(); err == nil {
		if tp.isProcessRunning(existingPID) {
			return fmt.Errorf("temporal already running with PID %d (use 'nucleus temporal stop' to stop it)", existingPID)
		}
		// PID stale, limpiar
		logger.Warning("Found stale PID file, cleaning up...")
		os.Remove(tp.pidFile)
	}

	// Crear directorio de logs si no existe
	temporalLogsDir := filepath.Join(tp.logsDir, "temporal")
	if err := os.MkdirAll(temporalLogsDir, 0755); err != nil {
		return fmt.Errorf("failed to create temporal logs dir: %w", err)
	}

	// Crear archivo de log con timestamp
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	logPath := filepath.Join(temporalLogsDir, fmt.Sprintf("nucleus_temporal_orchestrator_%s.log", timestamp))
	
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return fmt.Errorf("failed to create temporal log file: %w", err)
	}
	tp.logFile = logFile

	// Path a la base de datos
	tp.dbPath = filepath.Join(temporalLogsDir, "temporal.db")

	// Log inicial
	initialLog := fmt.Sprintf("[%s] Starting Temporal Server\n", time.Now().Format("2006-01-02 15:04:05"))
	initialLog += fmt.Sprintf("Executable: %s\n", tp.executablePath)
	initialLog += fmt.Sprintf("Database: %s\n", tp.dbPath)
	initialLog += fmt.Sprintf("Log file: %s\n", logPath)
	initialLog += fmt.Sprintf("UI Port: 8233\n")
	initialLog += fmt.Sprintf("gRPC Port: 7233\n")
	initialLog += strings.Repeat("=", 80) + "\n"
	
	if _, err := tp.logFile.WriteString(initialLog); err != nil {
		logger.Warning("Failed to write initial log: %v", err)
	}
	tp.logFile.Sync()

	logger.Info("Temporal log file: %s", logPath)

	// Preparar comando temporal server start-dev
	tp.cmd = exec.CommandContext(ctx, tp.executablePath, 
		"server", "start-dev",
		"--db-filename", tp.dbPath,
		"--ui-port", "8233",
		"--http-port", "7233",
		"--log-format", "pretty",
		"--log-level", "info")
	
	// Redirigir AMBOS stdout y stderr al archivo de log
	tp.cmd.Stdout = tp.logFile
	tp.cmd.Stderr = tp.logFile
	
	// Configurar para Windows
	if runtime.GOOS == "windows" {
		tp.cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000, // CREATE_NO_WINDOW
		}
	}

	// Iniciar proceso
	logger.Info("Launching Temporal process...")
	if err := tp.cmd.Start(); err != nil {
		logFile.Close()
		return fmt.Errorf("failed to start temporal: %w", err)
	}

	tp.isRunning = true
	logger.Info("Temporal process started (PID: %d)", tp.cmd.Process.Pid)

	// Guardar PID
	if err := tp.savePID(); err != nil {
		logger.Warning("Failed to save PID file: %v", err)
	}

	// Esperar a que Temporal esté listo con múltiples health checks
	if err := tp.waitForReady(ctx, logger); err != nil {
		tp.Stop(logger)
		return fmt.Errorf("temporal failed to become ready: %w", err)
	}

	return nil
}

// waitForReady espera a que Temporal responda mediante múltiples health checks
func (tp *TemporalProcess) waitForReady(ctx context.Context, logger *core.Logger) error {
	timeout := time.After(45 * time.Second)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	httpClient := &http.Client{Timeout: 3 * time.Second}
	attemptCount := 0

	logger.Info("Waiting for Temporal to be ready (timeout: 45s)...")

	for {
		select {
		case <-timeout:
			tp.logFile.Sync()
			lastLines := tp.readLastLogLines(20)
			return fmt.Errorf("timeout waiting for temporal to start\nLast log lines:\n%s", lastLines)

		case <-ctx.Done():
			return ctx.Err()

		case <-ticker.C:
			attemptCount++
			
			grpcReady := tp.checkGRPCHealth(httpClient)
			uiReady := tp.checkUIHealth(httpClient)
			
			if attemptCount % 5 == 0 {
				logger.Info("Health check attempt %d - gRPC: %v, UI: %v", attemptCount, grpcReady, uiReady)
			}

			if grpcReady {
				logger.Success("Temporal gRPC server ready on port 7233")
				
				if !uiReady {
					logger.Info("Waiting for UI to be ready...")
					time.Sleep(2 * time.Second)
					uiReady = tp.checkUIHealth(httpClient)
				}
				
				if uiReady {
					logger.Success("Temporal UI ready on port 8233")
				} else {
					logger.Warning("UI not responding yet (this is usually fine)")
				}
				
				return nil
			}
		}
	}
}

// checkGRPCHealth verifica el endpoint gRPC de Temporal
func (tp *TemporalProcess) checkGRPCHealth(client *http.Client) bool {
	resp, err := client.Get("http://localhost:7233/")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode > 0
}

// checkUIHealth verifica el endpoint de la UI de Temporal
func (tp *TemporalProcess) checkUIHealth(client *http.Client) bool {
	resp, err := client.Get("http://localhost:8233/")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

// readLastLogLines lee las últimas N líneas del log
func (tp *TemporalProcess) readLastLogLines(n int) string {
	if tp.logFile == nil {
		return "(log file not available)"
	}

	tp.logFile.Sync()
	
	readFile, err := os.Open(tp.logFile.Name())
	if err != nil {
		return fmt.Sprintf("(error reading log: %v)", err)
	}
	defer readFile.Close()

	content, err := io.ReadAll(readFile)
	if err != nil {
		return fmt.Sprintf("(error reading log content: %v)", err)
	}

	if len(content) == 0 {
		return "(log file is empty - temporal may not be writing logs)"
	}

	lines := strings.Split(string(content), "\n")
	start := 0
	if len(lines) > n {
		start = len(lines) - n
	}

	return strings.Join(lines[start:], "\n")
}

// Stop detiene el proceso Temporal
func (tp *TemporalProcess) Stop(logger *core.Logger) error {
	if !tp.isRunning {
		return nil
	}

	if tp.cmd != nil && tp.cmd.Process != nil {
		logger.Info("Sending interrupt signal to Temporal (PID: %d)...", tp.cmd.Process.Pid)
		
		if err := tp.cmd.Process.Signal(os.Interrupt); err != nil {
			logger.Warning("Failed to send interrupt, forcing kill: %v", err)
			tp.cmd.Process.Kill()
		}
		
		done := make(chan error, 1)
		go func() {
			done <- tp.cmd.Wait()
		}()

		select {
		case <-time.After(5 * time.Second):
			logger.Warning("Temporal did not stop gracefully, forcing kill")
			tp.cmd.Process.Kill()
			<-done
		case err := <-done:
			if err != nil {
				logger.Info("Temporal process exited with: %v", err)
			}
		}
	}

	if tp.logFile != nil {
		finalLog := fmt.Sprintf("\n[%s] Temporal Server stopped\n", time.Now().Format("2006-01-02 15:04:05"))
		tp.logFile.WriteString(finalLog)
		tp.logFile.Sync()
		tp.logFile.Close()
	}

	// Limpiar PID file
	os.Remove(tp.pidFile)

	tp.isRunning = false
	return nil
}

// IsRunning retorna si el proceso está activo
func (tp *TemporalProcess) IsRunning() bool {
	return tp.isRunning
}

// savePID guarda el PID del proceso en un archivo
func (tp *TemporalProcess) savePID() error {
	if tp.cmd == nil || tp.cmd.Process == nil {
		return fmt.Errorf("no process to save")
	}

	pidDir := filepath.Dir(tp.pidFile)
	if err := os.MkdirAll(pidDir, 0755); err != nil {
		return fmt.Errorf("failed to create PID directory: %w", err)
	}

	pidData := fmt.Sprintf("%d", tp.cmd.Process.Pid)
	return os.WriteFile(tp.pidFile, []byte(pidData), 0644)
}

// loadPID carga el PID desde el archivo
func (tp *TemporalProcess) loadPID() (int, error) {
	data, err := os.ReadFile(tp.pidFile)
	if err != nil {
		return 0, err
	}

	pidStr := strings.TrimSpace(string(data))
	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		return 0, fmt.Errorf("invalid PID format: %w", err)
	}

	return pid, nil
}

// isProcessRunning verifica si un proceso con el PID dado está corriendo
func (tp *TemporalProcess) isProcessRunning(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	// En Unix, FindProcess siempre retorna un proceso, necesitamos verificar con Signal
	// En Windows, si el proceso no existe, FindProcess retorna error
	if runtime.GOOS == "windows" {
		return true
	}

	// En Unix, enviar signal 0 no mata el proceso, solo verifica si existe
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

// stopByPID detiene el proceso usando el PID guardado
func (tp *TemporalProcess) stopByPID(logger *core.Logger) error {
	pid, err := tp.loadPID()
	if err != nil {
		return fmt.Errorf("no PID file found or invalid: %w", err)
	}

	if !tp.isProcessRunning(pid) {
		logger.Warning("Process with PID %d is not running (stale PID file)", pid)
		os.Remove(tp.pidFile)
		return fmt.Errorf("process not running")
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		return fmt.Errorf("failed to find process: %w", err)
	}

	logger.Info("Sending interrupt signal to Temporal (PID: %d)...", pid)
	
	if err := process.Signal(os.Interrupt); err != nil {
		logger.Warning("Failed to send interrupt, forcing kill: %v", err)
		process.Kill()
	}

	// Esperar hasta 5 segundos
	timeout := time.After(5 * time.Second)
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			logger.Warning("Temporal did not stop gracefully, forcing kill")
			process.Kill()
			os.Remove(tp.pidFile)
			return nil
		case <-ticker.C:
			if !tp.isProcessRunning(pid) {
				logger.Success("Temporal stopped successfully")
				os.Remove(tp.pidFile)
				return nil
			}
		}
	}
}

// ────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ────────────────────────────────────────────────────────────────

// getTemporalExecutablePath determina la ruta al ejecutable temporal
func getTemporalExecutablePath() (string, error) {
	var temporalPath string
	
	switch runtime.GOOS {
	case "windows":
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData == "" {
			userProfile := os.Getenv("USERPROFILE")
			if userProfile == "" {
				return "", fmt.Errorf("no se puede determinar LOCALAPPDATA ni USERPROFILE")
			}
			localAppData = filepath.Join(userProfile, "AppData", "Local")
		}
		temporalPath = filepath.Join(localAppData, "BloomNucleus", "bin", "temporal", "temporal.exe")
		
	case "darwin":
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("no se puede determinar el directorio home: %w", err)
		}
		temporalPath = filepath.Join(homeDir, "Library", "Application Support", "BloomNucleus", "bin", "temporal", "temporal")
		
	case "linux":
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("no se puede determinar el directorio home: %w", err)
		}
		temporalPath = filepath.Join(homeDir, ".local", "share", "BloomNucleus", "bin", "temporal", "temporal")
		
	default:
		return "", fmt.Errorf("sistema operativo no soportado: %s", runtime.GOOS)
	}
	
	// Verificar que el ejecutable existe
	if _, err := os.Stat(temporalPath); err != nil {
		if os.IsNotExist(err) {
			return "", fmt.Errorf("ejecutable temporal no encontrado en: %s", temporalPath)
		}
		return "", fmt.Errorf("error al verificar ejecutable temporal: %w", err)
	}
	
	return temporalPath, nil
}

// checkTemporalHealth verifica si Temporal está operativo
func checkTemporalHealth() (bool, string, map[string]bool) {
	client := &http.Client{Timeout: 2 * time.Second}
	
	healthChecks := map[string]bool{
		"grpc": false,
		"ui":   false,
	}
	
	// Check gRPC
	if resp, err := client.Get("http://localhost:7233/"); err == nil {
		resp.Body.Close()
		healthChecks["grpc"] = resp.StatusCode > 0
	}
	
	// Check UI
	if resp, err := client.Get("http://localhost:8233/"); err == nil {
		resp.Body.Close()
		healthChecks["ui"] = resp.StatusCode == 200
	}
	
	// Temporal está operativo si al menos gRPC responde
	if healthChecks["grpc"] {
		return true, "RUNNING", healthChecks
	}
	
	return false, "STOPPED", healthChecks
}

// getGlobalJSONFlag obtiene el valor del flag --json de manera robusta
func getGlobalJSONFlag(cmd *cobra.Command) bool {
	// Intentar obtener del root command (donde está el flag global)
	root := cmd.Root()
	if root != nil {
		if flag := root.PersistentFlags().Lookup("json"); flag != nil {
			value, _ := strconv.ParseBool(flag.Value.String())
			return value
		}
	}
	
	// Fallback: parsear os.Args manualmente (por si acaso)
	for _, arg := range os.Args {
		if arg == "--json" || arg == "--json=true" {
			return true
		}
	}
	
	return false
}

// ────────────────────────────────────────────────────────────────
// CLI COMMANDS
// ────────────────────────────────────────────────────────────────

var globalTemporalProcess *TemporalProcess

func init() {
	// Registrar comando padre temporal con sus subcomandos
	core.RegisterCommand("TEMPORAL_SERVER", temporalCmd)
}

// temporalCmd es el comando padre que agrupa todos los subcomandos de temporal
func temporalCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "temporal",
		Short: "Temporal server management commands",
		Long:  "Manage the Temporal workflow server: start, stop, check status, and run diagnostics",
		Annotations: map[string]string{
			"category": "TEMPORAL_SERVER",
		},
	}

	// Agregar subcomandos
	cmd.AddCommand(temporalStartCmd(c))
	cmd.AddCommand(temporalStopCmd(c))
	cmd.AddCommand(temporalStatusCmd(c))
	cmd.AddCommand(temporalDiagnosticsCmd(c))

	return cmd
}

func temporalStartCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "start",
		Short: "Inicia el servidor Temporal local",
		Long:  "Levanta el proceso temporal.exe en modo development con UI en puerto 8233",
		Annotations: map[string]string{
			"category": "TEMPORAL_SERVER",
			"json_response": `{
  "success": true,
  "state": "RUNNING",
  "pid": 12345,
  "ui_url": "http://localhost:8233",
  "grpc_url": "localhost:7233",
  "ui_port": 8233,
  "grpc_port": 7233,
  "message": "Temporal server started successfully (running in background)"
}`,
		},
		Example: `    nucleus temporal start
    nucleus --json temporal start`,
		Run: func(cmd *cobra.Command, args []string) {
			// Detectar modo JSON
			jsonOutput := getGlobalJSONFlag(cmd)

			// Si es modo JSON, NO inicializar logger (para no contaminar stdout)
			var logger *core.Logger
			if !jsonOutput {
				var err error
				logger, err = core.InitLogger(&c.Paths, "TEMPORAL_SERVER", false)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
					os.Exit(ExitGeneralError)
				}
				defer func() {
					logger.Info("Closing logger...")
					logger.Close()
				}()

				logger.Info("=== TEMPORAL START SEQUENCE ===")
				logger.Info("Iniciando Temporal Server...")
				logger.Info("Logs directory: %s", c.Paths.Logs)
			}

			temporalExePath, err := getTemporalExecutablePath()
			if err != nil {
				if jsonOutput {
					result := map[string]interface{}{
						"success": false,
						"error":   "temporal executable not found",
						"message": err.Error(),
					}
					output, _ := json.MarshalIndent(result, "", "  ")
					fmt.Println(string(output))
				} else {
					logger.Error("No se pudo localizar temporal.exe: %v", err)
					logger.Info("Ruta esperada (Windows): %%LOCALAPPDATA%%\\BloomNucleus\\bin\\temporal\\temporal.exe")
					logger.Info("Ruta esperada (macOS): ~/Library/Application Support/BloomNucleus/bin/temporal/temporal")
					logger.Info("Ruta esperada (Linux): ~/.local/share/BloomNucleus/bin/temporal/temporal")
				}
				os.Exit(ExitNotInstalled)
			}

			if !jsonOutput {
				logger.Info("Ejecutable Temporal encontrado: %s", temporalExePath)
				if info, err := os.Stat(temporalExePath); err == nil {
					logger.Info("Executable size: %d bytes, mode: %s", info.Size(), info.Mode())
				}
			}

			globalTemporalProcess = NewTemporalProcess(c.Paths.Logs, temporalExePath)

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			if !jsonOutput {
				logger.Info("Starting Temporal process...")
			}

			// Crear un logger silencioso para modo JSON
			silentLogger := logger
			if jsonOutput {
				silentLogger, _ = core.InitLogger(&c.Paths, "TEMPORAL_SERVER", false)
				defer silentLogger.Close()
			}

			if err := globalTemporalProcess.Start(ctx, silentLogger); err != nil {
				if jsonOutput {
					result := map[string]interface{}{
						"success": false,
						"error":   "failed to start temporal",
						"message": err.Error(),
					}
					output, _ := json.MarshalIndent(result, "", "  ")
					fmt.Println(string(output))
				} else {
					logger.Error("Fallo al iniciar Temporal: %v", err)
				}
				os.Exit(ExitGeneralError)
			}

			// En modo JSON, imprimir resultado y salir
			if jsonOutput {
				result := map[string]interface{}{
					"success":    true,
					"state":      "RUNNING",
					"pid":        globalTemporalProcess.cmd.Process.Pid,
					"ui_url":     "http://localhost:8233",
					"grpc_url":   "localhost:7233",
					"ui_port":    8233,
					"grpc_port":  7233,
					"message":    "Temporal server started successfully (running in background)",
				}
				output, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(output))
				
				// Detach del proceso para que siga corriendo en background
				// En modo JSON no esperamos Ctrl+C
				return
			}

			// Modo normal (interactivo)
			sigChan := make(chan os.Signal, 1)
			signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

			logger.Success("=== TEMPORAL READY ===")
			logger.Info("UI disponible en: http://localhost:8233")
			logger.Info("gRPC endpoint: localhost:7233")
			logger.Info("Presione Ctrl+C para detener")

			<-sigChan
			logger.Info("=== SHUTTING DOWN ===")
			logger.Info("Deteniendo Temporal Server...")

			if err := globalTemporalProcess.Stop(logger); err != nil {
				logger.Error("Error al detener Temporal: %v", err)
			} else {
				logger.Success("Temporal Server detenido exitosamente")
			}
		},
	}

	return cmd
}

func temporalStopCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "stop",
		Short: "Detiene el servidor Temporal local",
		Long:  "Envía señal de terminación al proceso temporal.exe usando el PID guardado",
		Annotations: map[string]string{
			"category": "TEMPORAL_SERVER",
			"json_response": `{
  "success": true,
  "message": "Temporal server stopped successfully",
  "pid": 12345
}`,
		},
		Example: `    nucleus temporal stop
    nucleus --json temporal stop`,
		Run: func(cmd *cobra.Command, args []string) {
			jsonOutput := getGlobalJSONFlag(cmd)

			var logger *core.Logger
			if !jsonOutput {
				var err error
				logger, err = core.InitLogger(&c.Paths, "TEMPORAL_SERVER", false)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
					os.Exit(ExitGeneralError)
				}
				defer logger.Close()
				logger.Info("Deteniendo Temporal Server...")
			}

			// Primero intentar detener usando la instancia global
			if globalTemporalProcess != nil && globalTemporalProcess.IsRunning() {
				pid := globalTemporalProcess.cmd.Process.Pid
				
				// Crear logger silencioso para modo JSON
				silentLogger := logger
				if jsonOutput {
					silentLogger, _ = core.InitLogger(&c.Paths, "TEMPORAL_SERVER", false)
					defer silentLogger.Close()
				}
				
				if err := globalTemporalProcess.Stop(silentLogger); err != nil {
					if jsonOutput {
						result := map[string]interface{}{
							"success": false,
							"error":   "failed to stop temporal",
							"message": err.Error(),
						}
						output, _ := json.MarshalIndent(result, "", "  ")
						fmt.Println(string(output))
					} else {
						logger.Error("Error al detener Temporal: %v", err)
					}
					os.Exit(ExitGeneralError)
				}
				
				if jsonOutput {
					result := map[string]interface{}{
						"success": true,
						"message": "Temporal server stopped successfully",
						"pid":     pid,
					}
					output, _ := json.MarshalIndent(result, "", "  ")
					fmt.Println(string(output))
				} else {
					logger.Success("Temporal Server detenido exitosamente")
				}
				globalTemporalProcess = nil
				return
			}

			// Si no hay instancia global, intentar usar el PID file
			temporalExePath, err := getTemporalExecutablePath()
			if err != nil {
				if jsonOutput {
					result := map[string]interface{}{
						"success": false,
						"error":   "temporal executable not found",
						"message": err.Error(),
					}
					output, _ := json.MarshalIndent(result, "", "  ")
					fmt.Println(string(output))
				} else {
					logger.Error("No se pudo localizar temporal.exe: %v", err)
				}
				os.Exit(ExitNotInstalled)
			}

			tp := NewTemporalProcess(c.Paths.Logs, temporalExePath)
			
			// Obtener PID antes de intentar detener
			pid, _ := tp.loadPID()
			
			// Crear logger silencioso para modo JSON
			silentLogger := logger
			if jsonOutput {
				silentLogger, _ = core.InitLogger(&c.Paths, "TEMPORAL_SERVER", false)
				defer silentLogger.Close()
			}
			
			if err := tp.stopByPID(silentLogger); err != nil {
				// No se pudo detener, verificar si está corriendo
				operational, state, _ := checkTemporalHealth()
				
				if jsonOutput {
					result := map[string]interface{}{
						"success":     false,
						"error":       "no active temporal process found",
						"operational": operational,
						"state":       state,
					}
					if operational {
						result["message"] = "Temporal is running but could not be stopped automatically"
					} else {
						result["message"] = "Temporal is not running"
					}
					output, _ := json.MarshalIndent(result, "", "  ")
					fmt.Println(string(output))
				} else {
					logger.Warning("No se encontró proceso Temporal activo")
					logger.Info("Verificando si Temporal está corriendo...")
					
					if operational {
						logger.Warning("Temporal está corriendo pero no se pudo detener automáticamente")
						logger.Info("Estado: %s", state)
						logger.Info("Intente detenerlo manualmente o use 'nucleus temporal diagnostics' para más información")
					} else {
						logger.Info("Temporal no está corriendo")
					}
				}
				
				if operational {
					os.Exit(ExitGeneralError)
				}
				os.Exit(ExitSuccess)
			}

			if jsonOutput {
				result := map[string]interface{}{
					"success": true,
					"message": "Temporal server stopped successfully",
					"pid":     pid,
				}
				output, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(output))
			} else {
				logger.Success("Temporal Server detenido exitosamente")
			}
		},
	}

	return cmd
}

func temporalStatusCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Verifica el estado del servidor Temporal",
		Long:  "Consulta si el servidor Temporal está operativo mediante health check HTTP",
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
		Example: `    nucleus temporal status
    nucleus --json temporal status`,
		Run: func(cmd *cobra.Command, args []string) {
			// Obtener flag --json de manera robusta
			jsonOutput := getGlobalJSONFlag(cmd)

			operational, state, healthChecks := checkTemporalHealth()

			status := map[string]interface{}{
				"temporal": map[string]interface{}{
					"operational": operational,
					"state":       state,
					"ui_port":     8233,
					"grpc_port":   7233,
					"ui_url":      "http://localhost:8233",
					"grpc_url":    "localhost:7233",
					"health_checks": healthChecks,
				},
			}

			if jsonOutput {
				output, _ := json.MarshalIndent(status, "", "  ")
				fmt.Println(string(output))
			} else {
				logger, err := core.InitLogger(&c.Paths, "TEMPORAL_SERVER", false)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
					os.Exit(ExitGeneralError)
				}
				defer logger.Close()

				logger.Info("Verificando estado de Temporal Server...")

				if operational {
					logger.Success("Temporal Server: %s", state)
					logger.Info("✓ gRPC endpoint: localhost:7233 [%v]", healthChecks["grpc"])
					logger.Info("✓ UI endpoint: http://localhost:8233 [%v]", healthChecks["ui"])
				} else {
					logger.Warning("Temporal Server: %s", state)
					logger.Info("✗ gRPC endpoint: localhost:7233 [no response]")
					logger.Info("✗ UI endpoint: http://localhost:8233 [no response]")
					logger.Info("Use 'nucleus temporal start' para iniciar el servidor")
				}
			}

			if !operational {
				os.Exit(ExitNotRunning)
			}
		},
	}

	return cmd
}

func temporalDiagnosticsCmd(c *core.Core) *cobra.Command {
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
		Example: `    nucleus temporal diagnostics
    nucleus --json temporal diagnostics`,
		Run: func(cmd *cobra.Command, args []string) {
			// Obtener flag --json de manera robusta
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

	// PID file info
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

	// Determinar overall status
	if execInfo["exists"].(bool) && operational {
		result["overall_status"] = "HEALTHY"
	} else if execInfo["exists"].(bool) {
		result["overall_status"] = "INSTALLED_NOT_RUNNING"
	} else {
		result["overall_status"] = "NOT_INSTALLED"
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))

	// Exit codes consistentes
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
	
	// Determinar overall status y exit code
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