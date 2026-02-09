package bootstrap

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"

	"nucleus/internal/core"
)

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

// Start inicia el proceso temporal.exe (modo interactivo)
func (tp *TemporalProcess) Start(ctx context.Context, logger *core.Logger) error {
	if tp.isRunning {
		return fmt.Errorf("temporal already running")
	}

	// Verificar si ya hay un proceso corriendo
	if existingPID, err := loadPID(tp.pidFile); err == nil {
		if isProcessRunning(existingPID) {
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
	initialLog := fmt.Sprintf("[%s] Starting Temporal Server (start-dev mode)\n", time.Now().Format("2006-01-02 15:04:05"))
	initialLog += fmt.Sprintf("Executable: %s\n", tp.executablePath)
	initialLog += fmt.Sprintf("Mode: start-dev (temporal.exe v1.5.1 compatible)\n")
	initialLog += fmt.Sprintf("Database: %s\n", tp.dbPath)
	initialLog += fmt.Sprintf("Log file: %s\n", logPath)
	initialLog += fmt.Sprintf("UI Port: 8233\n")
	initialLog += fmt.Sprintf("gRPC Port: 7233 (default)\n")
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
		"--log-format", "pretty",
		"--log-level", "info")
	
	// Redirigir stdout y stderr al archivo de log
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
	if err := savePID(tp.pidFile, tp.cmd.Process.Pid); err != nil {
		logger.Warning("Failed to save PID file: %v", err)
	}

	// Esperar a que Temporal esté listo
	if err := tp.waitForReady(ctx, logger); err != nil {
		tp.Stop(logger)
		return fmt.Errorf("temporal failed to become ready: %w", err)
	}

	return nil
}

// waitForReady espera a que Temporal responda mediante health checks
func (tp *TemporalProcess) waitForReady(ctx context.Context, logger *core.Logger) error {
	timeout := time.After(45 * time.Second)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	attemptCount := 0
	startTime := time.Now()

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
			
			grpcReady := checkGRPCHealth()
			uiReady := checkUIHealth()
			
			if attemptCount % 5 == 0 {
				logger.Info("Health check attempt %d - gRPC: %v, UI: %v", attemptCount, grpcReady, uiReady)
			}

			if uiReady {
				logger.Success("Temporal UI ready on port 8233")
				
				if grpcReady {
					logger.Success("Temporal gRPC server responding on port 7233")
				} else {
					logger.Info("Temporal gRPC on port 7233 (start-dev mode, no TCP probe)")
				}
				
				return nil
			}
			
			// Fallback: si proceso está estable >15s sin crashear, asumir ready
			if attemptCount > 15 && tp.cmd.ProcessState == nil {
				logger.Warning("UI not responding but process stable for %v, assuming ready", time.Since(startTime))
				logger.Info("Temporal likely running on gRPC: localhost:7233, UI: http://localhost:8233")
				return nil
			}
		}
	}
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

	logger.Info("Stopping Temporal process (PID: %d)...", tp.cmd.Process.Pid)

	// Intentar terminar gracefully
	if err := tp.cmd.Process.Signal(os.Interrupt); err != nil {
		logger.Warning("Failed to send interrupt signal: %v", err)
		// Intentar kill forzado
		if err := tp.cmd.Process.Kill(); err != nil {
			return fmt.Errorf("failed to kill process: %w", err)
		}
	}

	// Esperar hasta 5 segundos para que termine
	done := make(chan error, 1)
	go func() {
		done <- tp.cmd.Wait()
	}()

	select {
	case <-time.After(5 * time.Second):
		logger.Warning("Process did not terminate gracefully, forcing kill...")
		tp.cmd.Process.Kill()
		<-done
	case err := <-done:
		if err != nil {
			logger.Warning("Process exited with error: %v", err)
		}
	}

	tp.isRunning = false

	// Cerrar log file
	if tp.logFile != nil {
		tp.logFile.Close()
	}

	// Limpiar PID file
	os.Remove(tp.pidFile)

	logger.Success("Temporal process stopped")
	return nil
}

// Wait espera a que el proceso termine (modo interactivo)
func (tp *TemporalProcess) Wait() error {
	if !tp.isRunning || tp.cmd == nil {
		return fmt.Errorf("no process running")
	}
	return tp.cmd.Wait()
}

// startTemporalBackground inicia Temporal en background (modo non-interactive)
func startTemporalBackground(c *core.Core, executablePath string) (int, error) {
	temporalLogsDir := filepath.Join(c.Paths.Logs, "temporal")
	if err := os.MkdirAll(temporalLogsDir, 0755); err != nil {
		return 0, fmt.Errorf("failed to create temporal logs dir: %w", err)
	}

	dbPath := filepath.Join(temporalLogsDir, "temporal.db")
	pidFile := filepath.Join(temporalLogsDir, "temporal.pid")

	// Verificar si ya hay un PID guardado
	if existingPID, err := loadPID(pidFile); err == nil {
		if isProcessRunning(existingPID) {
			return existingPID, nil
		}
		// PID stale, limpiar
		os.Remove(pidFile)
	}

	// Preparar comando
	cmd := exec.Command(executablePath,
		"server", "start-dev",
		"--db-filename", dbPath,
		"--ui-port", "8233",
		"--log-format", "pretty",
		"--log-level", "info")

	// CRÍTICO: Desacoplar completamente del proceso padre
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Stdin = nil

	// Windows: Crear proceso en nuevo grupo
	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP,
			HideWindow:    true,
		}
	}

	// Iniciar proceso
	if err := cmd.Start(); err != nil {
		return 0, fmt.Errorf("failed to start temporal: %w", err)
	}

	pid := cmd.Process.Pid

	// Guardar PID
	if err := savePID(pidFile, pid); err != nil {
		// No es crítico, continuar
	}

	// NO ESPERAR al proceso - debe quedar desacoplado
	// El proceso padre (nucleus ensure) debe terminar inmediatamente

	return pid, nil
}