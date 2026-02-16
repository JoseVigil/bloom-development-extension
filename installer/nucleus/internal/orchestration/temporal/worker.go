package temporal

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"

	"nucleus/internal/core"
	"nucleus/internal/orchestration/activities"
	temporalworkflows "nucleus/internal/orchestration/temporal/workflows"
	"github.com/spf13/cobra"
)

// Worker envuelve el worker de Temporal
type Worker struct {
	worker worker.Worker
}

// NewWorker crea un nuevo worker
func NewWorker(c client.Client, taskQueue string) *Worker {
	w := worker.New(c, taskQueue, worker.Options{})
	return &Worker{worker: w}
}

// RegisterWorkflow registra un workflow
func (w *Worker) RegisterWorkflow(workflow interface{}) {
	w.worker.RegisterWorkflow(workflow)
}

// RegisterActivity registra una activity
func (w *Worker) RegisterActivity(activity interface{}) {
	w.worker.RegisterActivity(activity)
}

// RegisterActivityWithOptions registra una activity con opciones personalizadas
func (w *Worker) RegisterActivityWithOptions(act interface{}, options activity.RegisterOptions) {
	w.worker.RegisterActivityWithOptions(act, options)
}

// Start inicia el worker
func (w *Worker) Start() error {
	return w.worker.Start()
}

// Stop detiene el worker
func (w *Worker) Stop() {
	w.worker.Stop()
}

// WorkerManager gestiona múltiples workers
type WorkerManager struct {
	workers []*Worker
	client  *Client
}

// NewWorkerManager crea un nuevo manager de workers
func NewWorkerManager(client *Client) *WorkerManager {
	return &WorkerManager{
		workers: make([]*Worker, 0),
		client:  client,
	}
}

// CreateWorker crea y registra un nuevo worker
func (wm *WorkerManager) CreateWorker(taskQueue string) *Worker {
	w := NewWorker(wm.client.GetClient(), taskQueue)
	wm.workers = append(wm.workers, w)
	return w
}

// StartAll inicia todos los workers
func (wm *WorkerManager) StartAll(ctx context.Context) error {
	for i, w := range wm.workers {
		if err := w.Start(); err != nil {
			return fmt.Errorf("failed to start worker %d: %w", i, err)
		}
	}
	return nil
}

// StopAll detiene todos los workers
func (wm *WorkerManager) StopAll() {
	for _, w := range wm.workers {
		w.Stop()
	}
}

// ───────────────────────────────────────────────────────────────────────────
// CLI COMMANDS
// ───────────────────────────────────────────────────────────────────────────

func init() {
	core.RegisterCommand("ORCHESTRATION", workerStartCmd)
}

func workerStartCmd(c *core.Core) *cobra.Command {
	var taskQueue string

	cmd := &cobra.Command{
		Use:   "worker start",
		Short: "Inicia el worker de Temporal para procesar workflows",
		Long:  "Levanta un worker que escucha en la task queue y ejecuta workflows y activities registrados",
		Run: func(cmd *cobra.Command, args []string) {
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION", false)
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			logger.Info("Iniciando Temporal Worker...")
			logger.Info("Task Queue: %s", taskQueue)

			ctx := context.Background()
			temporalClient, err := NewClient(ctx, &c.Paths, false)
			if err != nil {
				logger.Error("Fallo al conectar con Temporal: %v", err)
				os.Exit(1)
			}
			defer temporalClient.Close()

			// Crear worker
			w := NewWorker(temporalClient.GetClient(), taskQueue)

			// ✅ REGISTRAR WORKFLOWS
			logger.Info("Registrando workflows...")
			
			// Workflow principal de ciclo de vida del perfil
			w.RegisterWorkflow(temporalworkflows.ProfileLifecycleWorkflow)
			
			// Recovery workflow
			w.RegisterWorkflow(temporalworkflows.RecoveryFlowWorkflow)
			
			// Workflows adicionales existentes
			w.RegisterWorkflow(temporalworkflows.StartOllamaWorkflow)
			w.RegisterWorkflow(temporalworkflows.VaultStatusWorkflow)
			w.RegisterWorkflow(temporalworkflows.ShutdownAllWorkflow)
			w.RegisterWorkflow(temporalworkflows.SeedWorkflow)

			logger.Success("✅ Workflows registrados")

			// ✅ REGISTRAR ACTIVITIES
			logger.Info("Registrando activities...")

			// Construir paths usando PathConfig disponible
			logsDir := c.Paths.Logs
			telemetryPath := filepath.Join(c.Paths.Root, "telemetry.json")
			sentinelExe := filepath.Join(c.Paths.Bin, "sentinel", "sentinel.exe")

			// Verificar que sentinel existe
			if _, err := os.Stat(sentinelExe); os.IsNotExist(err) {
				logger.Warning("⚠️  Sentinel executable not found at: %s", sentinelExe)
				logger.Info("Worker will start but activities will fail without sentinel")
			}

			// Crear instancia de SentinelActivities
			sentinelAct := activities.NewSentinelActivities(
				logsDir,
				telemetryPath,
				sentinelExe,
			)

			// Registrar activities con nombres consistentes que usa el workflow
			w.RegisterActivityWithOptions(sentinelAct.LaunchSentinel, activity.RegisterOptions{
				Name: "sentinel.LaunchSentinel",
			})

			w.RegisterActivityWithOptions(sentinelAct.StopSentinel, activity.RegisterOptions{
				Name: "sentinel.StopSentinel",
			})

			w.RegisterActivityWithOptions(sentinelAct.StartOllama, activity.RegisterOptions{
				Name: "sentinel.StartOllama",
			})

			w.RegisterActivityWithOptions(sentinelAct.SeedProfile, activity.RegisterOptions{
				Name: "sentinel.SeedProfile",
			})

			logger.Success("✅ Activities registradas")

			// Iniciar worker
			logger.Info("Iniciando worker...")
			if err := w.Start(); err != nil {
				logger.Error("Fallo al iniciar worker: %v", err)
				os.Exit(1)
			}

			logger.Success("✅ Worker iniciado exitosamente")
			logger.Info("Escuchando en task queue: %s", taskQueue)
			logger.Info("Presione Ctrl+C para detener")

			// Esperar señal de interrupción
			sigChan := make(chan os.Signal, 1)
			signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

			<-sigChan
			logger.Info("Señal de interrupción recibida, deteniendo worker...")

			w.Stop()
			logger.Success("✅ Worker detenido exitosamente")
		},
	}

	cmd.Flags().StringVarP(&taskQueue, "task-queue", "q", "profile-orchestration", "Task queue de Temporal")

	return cmd
}