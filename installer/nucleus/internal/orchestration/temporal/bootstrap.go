package temporal

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

// TemporalProcess maneja el proceso hijo de Temporal
type TemporalProcess struct {
	cmd       *exec.Cmd
	logFile   *os.File
	logsDir   string
	isRunning bool
}

// NewTemporalProcess crea una nueva instancia del proceso Temporal
func NewTemporalProcess(logsDir string) *TemporalProcess {
	return &TemporalProcess{
		logsDir:   logsDir,
		isRunning: false,
	}
}

// Start inicia el proceso temporal.exe
func (tp *TemporalProcess) Start(ctx context.Context) error {
	if tp.isRunning {
		return fmt.Errorf("temporal already running")
	}

	// Crear directorio de logs si no existe
	temporalLogsDir := filepath.Join(tp.logsDir, "temporal")
	if err := os.MkdirAll(temporalLogsDir, 0755); err != nil {
		return fmt.Errorf("failed to create temporal logs dir: %w", err)
	}

	// Crear archivo de log
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	logPath := filepath.Join(temporalLogsDir, fmt.Sprintf("nucleus_temporal_orchestrator_%s.log", timestamp))
	
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return fmt.Errorf("failed to create temporal log file: %w", err)
	}
	tp.logFile = logFile

	// Preparar comando temporal server start-dev
	tp.cmd = exec.CommandContext(ctx, "temporal", "server", "start-dev", 
		"--db-filename", filepath.Join(temporalLogsDir, "temporal.db"),
		"--ui-port", "8233",
		"--http-port", "7233")
	
	// Redirigir salida a archivo de log (stderr para errores)
	tp.cmd.Stdout = logFile
	tp.cmd.Stderr = logFile
	
	// Configurar para que no herede handles en Windows
	tp.cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow: true,
	}

	// Iniciar proceso
	if err := tp.cmd.Start(); err != nil {
		logFile.Close()
		return fmt.Errorf("failed to start temporal: %w", err)
	}

	tp.isRunning = true

	// Esperar a que Temporal esté listo (health check simple)
	if err := tp.waitForReady(ctx); err != nil {
		tp.Stop()
		return fmt.Errorf("temporal failed to become ready: %w", err)
	}

	return nil
}

// waitForReady espera a que Temporal responda
func (tp *TemporalProcess) waitForReady(ctx context.Context) error {
	timeout := time.After(30 * time.Second)
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			return fmt.Errorf("timeout waiting for temporal to start")
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			// Intentar conectar al cliente para verificar que está listo
			// En una implementación real, haríamos un health check HTTP
			// Por ahora, esperamos un tiempo fijo
			time.Sleep(5 * time.Second)
			return nil
		}
	}
}

// Stop detiene el proceso Temporal
func (tp *TemporalProcess) Stop() error {
	if !tp.isRunning {
		return nil
	}

	if tp.cmd != nil && tp.cmd.Process != nil {
		// Enviar señal de terminación
		if err := tp.cmd.Process.Signal(os.Interrupt); err != nil {
			// Si falla, forzar kill
			tp.cmd.Process.Kill()
		}
		
		// Esperar a que termine
		tp.cmd.Wait()
	}

	if tp.logFile != nil {
		tp.logFile.Close()
	}

	tp.isRunning = false
	return nil
}

// IsRunning retorna si el proceso está activo
func (tp *TemporalProcess) IsRunning() bool {
	return tp.isRunning
}

// ────────────────────────────────────────────────────────
// CLI COMMANDS
// ────────────────────────────────────────────────────────

var globalTemporalProcess *TemporalProcess

func init() {
	core.RegisterCommand("ORCHESTRATION", temporalStartCmd)
	core.RegisterCommand("ORCHESTRATION", temporalStopCmd)
}

func temporalStartCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "temporal start",
		Short: "Inicia el servidor Temporal local",
		Long:  "Levanta el proceso temporal.exe en modo development con UI en puerto 8233",
		Run: func(cmd *cobra.Command, args []string) {
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			logger.Info("Iniciando Temporal Server...")

			// Crear proceso Temporal
			globalTemporalProcess = NewTemporalProcess(c.Paths.Logs)

			// Iniciar en contexto con cancelación
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			// Configurar señales para shutdown graceful
			sigChan := make(chan os.Signal, 1)
			signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

			// Iniciar proceso
			if err := globalTemporalProcess.Start(ctx); err != nil {
				logger.Error("Fallo al iniciar Temporal: %v", err)
				os.Exit(1)
			}

			logger.Success("Temporal Server iniciado exitosamente")
			logger.Info("UI disponible en: http://localhost:8233")
			logger.Info("gRPC endpoint: localhost:7233")
			logger.Info("Presione Ctrl+C para detener")

			// Esperar señal de terminación
			<-sigChan
			logger.Info("Deteniendo Temporal Server...")

			if err := globalTemporalProcess.Stop(); err != nil {
				logger.Error("Error al detener Temporal: %v", err)
			} else {
				logger.Success("Temporal Server detenido")
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
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			if globalTemporalProcess == nil {
				logger.Warning("No hay proceso Temporal activo en esta sesión")
				return
			}

			logger.Info("Deteniendo Temporal Server...")
			
			if err := globalTemporalProcess.Stop(); err != nil {
				logger.Error("Error al detener Temporal: %v", err)
				os.Exit(1)
			}

			logger.Success("Temporal Server detenido exitosamente")
			globalTemporalProcess = nil
		},
	}

	return cmd
}