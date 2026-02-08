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
			grpcReady := tp.checkGRPCHealth(httpClient)
			
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

// checkGRPCHealth verifica el endpoint gRPC de Temporal
func (tp *TemporalProcess) checkGRPCHealth(client *http.Client) bool {
	// Temporal expone un endpoint de salud en el puerto HTTP (7233)
	resp, err := client.Get("http://localhost:7233/")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	
	// Cualquier respuesta (incluso 404) indica que el servidor está vivo
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
			}
		}
	}

	if tp.logFile != nil {
		finalLog := fmt.Sprintf("\n[%s] Temporal Server stopped\n", time.Now().Format("2006-01-02 15:04:05"))
		tp.logFile.WriteString(finalLog)
		tp.logFile.Sync()
		tp.logFile.Close()
	}

	tp.isRunning = false
	return nil
}

// IsRunning retorna si el proceso está activo
func (tp *TemporalProcess) IsRunning() bool {
	return tp.isRunning
}

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

// ────────────────────────────────────────────────────────────────
// CLI COMMANDS
// ────────────────────────────────────────────────────────────────

var globalTemporalProcess *TemporalProcess

func init() {
	core.RegisterCommand("ORCHESTRATION", temporalStartCmd)
	core.RegisterCommand("ORCHESTRATION", temporalStopCmd)
	core.RegisterCommand("ORCHESTRATION", temporalStatusCmd)
	core.RegisterCommand("ORCHESTRATION", temporalDiagnosticsCmd)
}

func temporalStartCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "temporal start",
		Short: "Inicia el servidor Temporal local",
		Long:  "Levanta el proceso temporal.exe en modo development con UI en puerto 8233",
		Run: func(cmd *cobra.Command, args []string) {
			// Inicializar logger PRIMERO
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION", false)
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
				os.Exit(1)
			}
			defer func() {
				logger.Info("Closing logger...")
				logger.Close()
			}()

			logger.Info("=== TEMPORAL START SEQUENCE ===")
			logger.Info("Iniciando Temporal Server...")
			logger.Info("Logs directory: %s", c.Paths.Logs)

			// Determinar la ruta al ejecutable temporal
			temporalExePath, err := getTemporalExecutablePath()
			if err != nil {
				logger.Error("No se pudo localizar temporal.exe: %v", err)
				logger.Info("Ruta esperada (Windows): %%LOCALAPPDATA%%\\BloomNucleus\\bin\\temporal\\temporal.exe")
				logger.Info("Ruta esperada (macOS): ~/Library/Application Support/BloomNucleus/bin/temporal/temporal")
				logger.Info("Ruta esperada (Linux): ~/.local/share/BloomNucleus/bin/temporal/temporal")
				os.Exit(1)
			}

			logger.Info("Ejecutable Temporal encontrado: %s", temporalExePath)

			// Verificar que el ejecutable es válido
			if info, err := os.Stat(temporalExePath); err == nil {
				logger.Info("Executable size: %d bytes, mode: %s", info.Size(), info.Mode())
			}

			// Crear proceso Temporal con la ruta completa
			globalTemporalProcess = NewTemporalProcess(c.Paths.Logs, temporalExePath)

			// Iniciar en contexto con cancelación
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			// Configurar señales para shutdown graceful
			sigChan := make(chan os.Signal, 1)
			signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

			// Iniciar proceso (pasamos el logger)
			logger.Info("Starting Temporal process...")
			if err := globalTemporalProcess.Start(ctx, logger); err != nil {
				logger.Error("Fallo al iniciar Temporal: %v", err)
				os.Exit(1)
			}

			logger.Success("=== TEMPORAL READY ===")
			logger.Info("UI disponible en: http://localhost:8233")
			logger.Info("gRPC endpoint: localhost:7233")
			logger.Info("Presione Ctrl+C para detener")

			// Esperar señal de terminación
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
		Use:   "temporal stop",
		Short: "Detiene el servidor Temporal local",
		Long:  "Envía señal de terminación al proceso temporal.exe",
		Run: func(cmd *cobra.Command, args []string) {
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION", false)
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			if globalTemporalProcess == nil {
				logger.Warning("No hay proceso Temporal activo en esta sesión")
				logger.Info("Verificando si Temporal está corriendo...")
				
				operational, state, _ := checkTemporalHealth()
				if operational {
					logger.Warning("Temporal está corriendo pero no fue iniciado por esta sesión de nucleus")
					logger.Info("Estado: %s", state)
					logger.Info("Puede que necesites detenerlo manualmente o desde otra terminal")
				} else {
					logger.Info("Temporal no está corriendo")
				}
				return
			}

			logger.Info("Deteniendo Temporal Server...")
			
			if err := globalTemporalProcess.Stop(logger); err != nil {
				logger.Error("Error al detener Temporal: %v", err)
				os.Exit(1)
			}

			logger.Success("Temporal Server detenido exitosamente")
			globalTemporalProcess = nil
		},
	}

	return cmd
}

func temporalStatusCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "temporal status",
		Short: "Verifica el estado del servidor Temporal",
		Long:  "Consulta si el servidor Temporal está operativo mediante health check HTTP",
		Annotations: map[string]string{
			"category": "ORCHESTRATION",
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
			// Detectar si se solicitó output JSON
			jsonOutput := false
			if cmd.Flag("json") != nil && cmd.Flag("json").Changed {
				jsonOutput = true
			}
			for _, arg := range os.Args {
				if arg == "--json" {
					jsonOutput = true
					break
				}
			}

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
				logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION", false)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
					os.Exit(1)
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
				os.Exit(1)
			}
		},
	}

	return cmd
}

func temporalDiagnosticsCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "temporal diagnostics",
		Short: "Run comprehensive Temporal diagnostics",
		Long:  "Checks Temporal installation, ports, health, logs, database, and telemetry",
		Annotations: map[string]string{
			"category": "ORCHESTRATION",
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
  "overall_status": "HEALTHY"
}`,
		},
		Example: `    nucleus temporal diagnostics
    nucleus --json temporal diagnostics`,
		Run: func(cmd *cobra.Command, args []string) {
			jsonOutput := false
			for _, arg := range os.Args {
				if arg == "--json" {
					jsonOutput = true
					break
				}
			}

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

	if execInfo["exists"].(bool) && operational {
		result["overall_status"] = "HEALTHY"
	} else if execInfo["exists"].(bool) {
		result["overall_status"] = "INSTALLED_NOT_RUNNING"
	} else {
		result["overall_status"] = "NOT_INSTALLED"
	}

	output, _ := json.MarshalIndent(result, "", "  ")
	fmt.Println(string(output))

	if result["overall_status"] != "HEALTHY" && result["overall_status"] != "INSTALLED_NOT_RUNNING" {
		os.Exit(1)
	}
}

func runDiagnosticsHuman(c *core.Core) {
	logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION", false)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Close()

	logger.Info("=== TEMPORAL DIAGNOSTICS ===")

	logger.Info("[1] Temporal Executable")
	temporalPath, _ := getTemporalExecutablePath()
	if info, err := os.Stat(temporalPath); err == nil {
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