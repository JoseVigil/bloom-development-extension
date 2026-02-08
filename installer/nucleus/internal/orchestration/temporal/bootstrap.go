package temporal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

// TemporalProcess maneja el proceso hijo de Temporal
type TemporalProcess struct {
	cmd            *exec.Cmd
	logFile        *os.File
	logsDir        string
	isRunning      bool
	executablePath string
	dbPath         string
}

// NewTemporalProcess crea una nueva instancia del proceso Temporal
func NewTemporalProcess(logsDir string, executablePath string) *TemporalProcess {
	return &TemporalProcess{
		logsDir:        logsDir,
		executablePath: executablePath,
		isRunning:      false,
	}
}

// Start inicia el proceso temporal.exe
func (tp *TemporalProcess) Start(ctx context.Context, logger *core.Logger) error {
	if tp.isRunning {
		return fmt.Errorf("temporal already running")
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
		"--port", "7233",
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

	// Esperar a que Temporal esté listo con múltiples health checks
	if err := tp.waitForReady(ctx, logger); err != nil {
		tp.Stop(logger)
		return fmt.Errorf("temporal failed to become ready: %w", err)
	}

	return nil
}

// waitForReady espera a que Temporal responda mediante múltiples health checks
func (tp *TemporalProcess) waitForReady(ctx context.Context, logger *core.Logger) error {
	timeout := time.After(45 * time.Second) // Aumentado a 45s
	ticker := time.NewTicker(1 * time.Second) // Check cada segundo
	defer ticker.Stop()

	httpClient := &http.Client{Timeout: 3 * time.Second}
	attemptCount := 0

	logger.Info("Waiting for Temporal to be ready (timeout: 45s)...")

	for {
		select {
		case <-timeout:
			// Leer últimas líneas del log para diagnóstico
			tp.logFile.Sync()
			lastLines := tp.readLastLogLines(20)
			return fmt.Errorf("timeout waiting for temporal to start\nLast log lines:\n%s", lastLines)

		case <-ctx.Done():
			return ctx.Err()

		case <-ticker.C:
			attemptCount++
			
			// Health check 1: gRPC endpoint (puerto 7233)
			grpcReady := tp.checkGRPCHealth()
			
			// Health check 2: UI endpoint (puerto 8233)
			uiReady := tp.checkUIHealth(httpClient)
			
			// Log del progreso cada 5 intentos
			if attemptCount % 5 == 0 {
				logger.Info("Health check attempt %d - gRPC: %v, UI: %v", attemptCount, grpcReady, uiReady)
			}

			// Temporal está listo cuando AL MENOS el gRPC responde
			if grpcReady {
				logger.Success("Temporal gRPC server ready on port 7233")
				
				// Esperar un poco más por la UI (opcional)
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

// checkGRPCHealth verifica que el puerto gRPC esté abierto
func (tp *TemporalProcess) checkGRPCHealth() bool {
	conn, err := net.DialTimeout("tcp", "localhost:7233", 1*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
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

	// Sync antes de leer
	tp.logFile.Sync()
	
	// Abrir el archivo en modo lectura
	readFile, err := os.Open(tp.logFile.Name())
	if err != nil {
		return fmt.Sprintf("(error reading log: %v)", err)
	}
	defer readFile.Close()

	// Leer todo el contenido
	content, err := io.ReadAll(readFile)
	if err != nil {
		return fmt.Sprintf("(error reading log content: %v)", err)
	}

	if len(content) == 0 {
		return "(log file is empty - temporal may not be writing logs)"
	}

	// Dividir en líneas y tomar las últimas N
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
		
		// Enviar señal de terminación
		if err := tp.cmd.Process.Signal(os.Interrupt); err != nil {
			logger.Warning("Failed to send interrupt, forcing kill: %v", err)
			tp.cmd.Process.Kill()
		}
		
		// Esperar hasta 5 segundos
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
			} else {
				logger.Success("Temporal process stopped cleanly")
			}
		}
	}

	// Cerrar archivo de log
	if tp.logFile != nil {
		tp.logFile.Close()
	}

	tp.isRunning = false
	return nil
}

// getTemporalExecutablePath devuelve la ruta del ejecutable temporal según el SO
func getTemporalExecutablePath() (string, error) {
	var temporalPath string
	
	switch runtime.GOOS {
	case "windows":
		temporalPath = filepath.Join(os.Getenv("LOCALAPPDATA"), "BloomNucleus", "bin", "temporal", "temporal.exe")
	case "darwin":
		temporalPath = filepath.Join(os.Getenv("HOME"), "Library", "Application Support", "BloomNucleus", "bin", "temporal", "temporal")
	case "linux":
		temporalPath = filepath.Join(os.Getenv("HOME"), ".local", "share", "BloomNucleus", "bin", "temporal", "temporal")
	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	return temporalPath, nil
}

// checkTemporalHealth hace un health check rápido de Temporal
func checkTemporalHealth() (operational bool, state string, healthChecks map[string]bool) {
	healthChecks = map[string]bool{
		"grpc": false,
		"ui":   false,
	}

	// Check gRPC port
	conn, err := net.DialTimeout("tcp", "localhost:7233", 2*time.Second)
	if err == nil {
		conn.Close()
		healthChecks["grpc"] = true
	}

	// Check UI port
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://localhost:8233/")
	if err == nil {
		resp.Body.Close()
		if resp.StatusCode == 200 {
			healthChecks["ui"] = true
		}
	}

	// Determinar estado
	if healthChecks["grpc"] && healthChecks["ui"] {
		return true, "RUNNING", healthChecks
	} else if healthChecks["grpc"] {
		return true, "RUNNING (UI not ready)", healthChecks
	} else {
		return false, "STOPPED", healthChecks
	}
}

// Variable global para mantener referencia al proceso Temporal
var globalTemporalProcess *TemporalProcess

func init() {
	core.RegisterCommand("ORCHESTRATION", BuildTemporalCommands)
}

// BuildTemporalCommands crea todos los subcomandos de Temporal
func BuildTemporalCommands(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "temporal",
		Short: "Manage Temporal server lifecycle",
		Long:  "Start, stop, restart, and monitor the embedded Temporal server for workflow orchestration",
		Example: `    nucleus temporal start
    nucleus temporal stop
    nucleus temporal status
    nucleus temporal diagnostics`,
	}

	cmd.AddCommand(temporalStartCmd(c))
	cmd.AddCommand(temporalStopCmd(c))
	cmd.AddCommand(temporalStatusCmd(c))
	cmd.AddCommand(temporalDiagnosticsCmd(c))

	return cmd
}

func temporalStartCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "start",
		Short: "Start the Temporal server",
		Long:  "Launch the embedded Temporal server in the background",
		Example: `    nucleus temporal start
    nucleus --json temporal start

JSON Output:
    {
      "status": "started",
      "pid": 22048,
      "grpc_url": "localhost:7233",
      "ui_url": "http://localhost:8233",
      "grpc_port": 7233,
      "ui_port": 8233
    }`,
		Run: func(cmd *cobra.Command, args []string) {
			// Detectar --json PRIMERO
			jsonOutput := false
			if rootCmd := cmd.Root(); rootCmd != nil {
				if flag := rootCmd.PersistentFlags().Lookup("json"); flag != nil {
					jsonOutput = flag.Value.String() == "true"
				}
			}
			if !jsonOutput {
				for _, arg := range os.Args {
					if arg == "--json" {
						jsonOutput = true
						break
					}
				}
			}

			// Inicializar logger CON silentMode desde el inicio
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION", jsonOutput)
			if err != nil {
				if !jsonOutput {
					fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
				}
				os.Exit(1)
			}
			defer logger.Close()

			logger.Info("Iniciando Temporal Server...")

			if globalTemporalProcess != nil && globalTemporalProcess.isRunning {
				if jsonOutput {
					output, _ := json.MarshalIndent(map[string]interface{}{
						"status": "already_running",
						"error":  "Temporal is already running",
					}, "", "  ")
					fmt.Println(string(output))
				} else {
					logger.Warning("Temporal ya está corriendo")
				}
				return
			}

			temporalPath, err := getTemporalExecutablePath()
			if err != nil {
				if jsonOutput {
					output, _ := json.MarshalIndent(map[string]interface{}{
						"status": "error",
						"error":  err.Error(),
					}, "", "  ")
					fmt.Println(string(output))
				} else {
					logger.Error("Error al obtener ruta de Temporal: %v", err)
				}
				os.Exit(1)
			}

			if _, err := os.Stat(temporalPath); os.IsNotExist(err) {
				if jsonOutput {
					output, _ := json.MarshalIndent(map[string]interface{}{
						"status": "error",
						"error":  "Temporal executable not found",
						"path":   temporalPath,
					}, "", "  ")
					fmt.Println(string(output))
				} else {
					logger.Error("Temporal executable not found at: %s", temporalPath)
					logger.Info("Please run 'nucleus setup' to install Temporal")
				}
				os.Exit(1)
			}

			globalTemporalProcess = NewTemporalProcess(c.Paths.Logs, temporalPath)

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			if err := globalTemporalProcess.Start(ctx, logger); err != nil {
				if jsonOutput {
					output, _ := json.MarshalIndent(map[string]interface{}{
						"status": "error",
						"error":  err.Error(),
					}, "", "  ")
					fmt.Println(string(output))
				} else {
					logger.Error("Failed to start Temporal: %v", err)
				}
				os.Exit(1)
			}

			// Modo JSON: retornar inmediatamente con info
			if jsonOutput {
				output, _ := json.MarshalIndent(map[string]interface{}{
					"status":    "started",
					"pid":       globalTemporalProcess.cmd.Process.Pid,
					"grpc_url":  "localhost:7233",
					"ui_url":    "http://localhost:8233",
					"grpc_port": 7233,
					"ui_port":   8233,
				}, "", "  ")
				fmt.Println(string(output))
				return
			}

			// Modo interactivo: esperar señal
			logger.Success("Temporal Server started successfully")
			logger.Info("gRPC endpoint: localhost:7233")
			logger.Info("Web UI: http://localhost:8233")
			logger.Info("Press Ctrl+C to stop")

			sigChan := make(chan os.Signal, 1)
			signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

			go func() {
				<-sigChan
				logger.Info("Received interrupt signal, stopping Temporal...")
				cancel()
			}()

			<-ctx.Done()

			logger.Info("Shutting down Temporal Server...")
			if err := globalTemporalProcess.Stop(logger); err != nil {
				logger.Error("Error stopping Temporal: %v", err)
				os.Exit(1)
			}

			logger.Success("Temporal Server stopped")
		},
	}

	return cmd
}

func temporalStopCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "stop",
		Short: "Stop the Temporal server",
		Long:  "Gracefully shutdown the running Temporal server",
		Example: `    nucleus temporal stop
    nucleus --json temporal stop

JSON Output:
    {
      "status": "stopped",
      "message": "Temporal server stopped successfully"
    }`,
		Run: func(cmd *cobra.Command, args []string) {
			// Detectar --json PRIMERO
			jsonOutput := false
			if rootCmd := cmd.Root(); rootCmd != nil {
				if flag := rootCmd.PersistentFlags().Lookup("json"); flag != nil {
					jsonOutput = flag.Value.String() == "true"
				}
			}
			if !jsonOutput {
				for _, arg := range os.Args {
					if arg == "--json" {
						jsonOutput = true
						break
					}
				}
			}

			// Inicializar logger CON silentMode desde el inicio
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION", jsonOutput)
			if err != nil {
				if !jsonOutput {
					fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
				}
				os.Exit(1)
			}
			defer logger.Close()

			if globalTemporalProcess == nil || !globalTemporalProcess.isRunning {
				operational, _, _ := checkTemporalHealth()
				if !operational {
					if jsonOutput {
						output, _ := json.MarshalIndent(map[string]interface{}{
							"status": "not_running",
							"message": "Temporal is not running",
						}, "", "  ")
						fmt.Println(string(output))
					} else {
						logger.Info("Temporal no está corriendo")
					}
				}
				return
			}

			logger.Info("Deteniendo Temporal Server...")
			
			if err := globalTemporalProcess.Stop(logger); err != nil {
				if jsonOutput {
					output, _ := json.MarshalIndent(map[string]interface{}{
						"status": "error",
						"error": err.Error(),
					}, "", "  ")
					fmt.Println(string(output))
				} else {
					logger.Error("Error al detener Temporal: %v", err)
				}
				os.Exit(1)
			}

			if jsonOutput {
				output, _ := json.MarshalIndent(map[string]interface{}{
					"status": "stopped",
					"message": "Temporal server stopped successfully",
				}, "", "  ")
				fmt.Println(string(output))
			} else {
				logger.Success("Temporal Server detenido exitosamente")
			}
			globalTemporalProcess = nil
		},
	}

	return cmd
}

func temporalStatusCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Check Temporal server status",
		Long:  "Query if the Temporal server is operational via HTTP health check",
		Example: `    nucleus temporal status
    nucleus --json temporal status

JSON Output:
    {
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
		Run: func(cmd *cobra.Command, args []string) {
			// Detectar --json PRIMERO
			jsonOutput := false
			if rootCmd := cmd.Root(); rootCmd != nil {
				if flag := rootCmd.PersistentFlags().Lookup("json"); flag != nil {
					jsonOutput = flag.Value.String() == "true"
				}
			}
			if !jsonOutput {
				for _, arg := range os.Args {
					if arg == "--json" {
						jsonOutput = true
						break
					}
				}
			}

			// Inicializar logger CON silentMode desde el inicio
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION", jsonOutput)
			if err != nil {
				if !jsonOutput {
					fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
				}
				os.Exit(1)
			}
			defer logger.Close()

			logger.Info("Checking Temporal Server status...")

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

			if operational {
				logger.Success("Status check completed - Temporal is operational")
			} else {
				logger.Warning("Status check completed - Temporal is not running")
			}

			if !operational {
				os.Exit(1)
			}
		},
	}

	return cmd
}

func temporalDiagnosticsCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "diagnostics",
		Short: "Run comprehensive Temporal diagnostics",
		Long:  "Check Temporal installation, ports, health, logs, database, and telemetry",
		Example: `    nucleus temporal diagnostics
    nucleus --json temporal diagnostics

JSON Output:
    {
      "executable": {
        "path": "C:\\Users\\user\\AppData\\Local\\BloomNucleus\\bin\\temporal\\temporal.exe",
        "exists": true,
        "size": 52428800
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
        "size": 204800
      },
      "overall_status": "HEALTHY"
    }`,
		Run: func(cmd *cobra.Command, args []string) {
			// Detectar --json PRIMERO
			jsonOutput := false
			if rootCmd := cmd.Root(); rootCmd != nil {
				if flag := rootCmd.PersistentFlags().Lookup("json"); flag != nil {
					jsonOutput = flag.Value.String() == "true"
				}
			}
			if !jsonOutput {
				for _, arg := range os.Args {
					if arg == "--json" {
						jsonOutput = true
						break
					}
				}
			}

			// Inicializar logger CON silentMode desde el inicio
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION", jsonOutput)
			if err != nil {
				if !jsonOutput {
					fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
				}
				os.Exit(1)
			}
			defer logger.Close()

			logger.Info("Running Temporal diagnostics...")

			if jsonOutput {
				runDiagnosticsJSON(c, logger)
			} else {
				runDiagnosticsHuman(c, logger)
			}
		},
	}

	return cmd
}

func runDiagnosticsJSON(c *core.Core, logger *core.Logger) {
	result := map[string]interface{}{}

	// 1. Executable
	logger.Info("Checking Temporal executable...")
	temporalPath, _ := getTemporalExecutablePath()
	execInfo := map[string]interface{}{
		"path":   temporalPath,
		"exists": false,
	}
	if info, err := os.Stat(temporalPath); err == nil {
		execInfo["exists"] = true
		execInfo["size"] = info.Size()
		logger.Info("Temporal executable found: %s (%d bytes)", temporalPath, info.Size())
	} else {
		logger.Warning("Temporal executable NOT FOUND: %s", temporalPath)
	}
	result["executable"] = execInfo

	// 2. Health
	logger.Info("Checking Temporal health...")
	operational, state, healthChecks := checkTemporalHealth()
	result["health"] = map[string]interface{}{
		"operational":     operational,
		"state":           state,
		"grpc_responding": healthChecks["grpc"],
		"ui_responding":   healthChecks["ui"],
	}
	logger.Info("Health check complete - State: %s, Operational: %v", state, operational)

	// 3. Database
	logger.Info("Checking database...")
	dbPath := filepath.Join(c.Paths.Logs, "temporal", "temporal.db")
	dbInfo := map[string]interface{}{
		"path":   dbPath,
		"exists": false,
	}
	if info, err := os.Stat(dbPath); err == nil {
		dbInfo["exists"] = true
		dbInfo["size"] = info.Size()
		logger.Info("Database found: %s (%d bytes)", dbPath, info.Size())
	} else {
		logger.Info("Database not found: %s", dbPath)
	}
	result["database"] = dbInfo

	// Overall status
	if execInfo["exists"].(bool) && operational {
		result["overall_status"] = "HEALTHY"
		logger.Success("Overall status: HEALTHY")
	} else if execInfo["exists"].(bool) {
		result["overall_status"] = "INSTALLED_NOT_RUNNING"
		logger.Warning("Overall status: INSTALLED_NOT_RUNNING")
	} else {
		result["overall_status"] = "NOT_INSTALLED"
		logger.Error("Overall status: NOT_INSTALLED")
	}

	logger.Info("Diagnostics complete")

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))

	if result["overall_status"] != "HEALTHY" && result["overall_status"] != "INSTALLED_NOT_RUNNING" {
		os.Exit(1)
	}
}

func runDiagnosticsHuman(c *core.Core, logger *core.Logger) {
	logger.Info("=== TEMPORAL DIAGNOSTICS ===")

	// 1. Temporal Executable
	logger.Info("[1] Temporal Executable")
	temporalPath, _ := getTemporalExecutablePath()
	if info, err := os.Stat(temporalPath); err == nil {
		logger.Success("  Found: %s", temporalPath)
		logger.Info("  Size: %d bytes", info.Size())
	} else {
		logger.Error("  NOT FOUND: %s", temporalPath)
	}

	// 2. Health
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

	// 3. Database
	logger.Info("[3] Database")
	dbPath := filepath.Join(c.Paths.Logs, "temporal", "temporal.db")
	if info, err := os.Stat(dbPath); err == nil {
		logger.Success("  Database: %s", dbPath)
		logger.Info("  Size: %d bytes", info.Size())
	} else {
		logger.Info("  Database not found (will be created on first run)")
	}

	// 4. Logs
	logger.Info("[4] Logs")
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
	if operational {
		logger.Success("Overall Status: HEALTHY")
	} else {
		logger.Warning("Overall Status: INSTALLED_NOT_RUNNING")
		logger.Info("Run: nucleus temporal start")
	}

	if !operational {
		os.Exit(1)
	}
}