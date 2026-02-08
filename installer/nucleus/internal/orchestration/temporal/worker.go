package temporal

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
	
	"nucleus/internal/core"
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

// ────────────────────────────────────────────────────────────
// CLI COMMANDS
// ────────────────────────────────────────────────────────────

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

			// Crear cliente Temporal
			ctx := context.Background()
			temporalClient, err := NewClient(ctx)
			if err != nil {
				logger.Error("Fallo al conectar con Temporal: %v", err)
				logger.Error("Asegúrate de que el servidor Temporal esté corriendo (nucleus temporal start)")
				os.Exit(1)
			}
			defer temporalClient.Close()

			// Crear worker
			w := NewWorker(temporalClient.GetClient(), taskQueue)

			// Registrar workflows y activities
			// NOTA: Aquí se registran todos los workflows y activities del sistema
			// En una implementación completa, esto vendría de un registro centralizado
			logger.Info("Registrando workflows y activities...")
			
			// Ejemplo de registro (comentado porque necesitaríamos importar workflows)
			// w.RegisterWorkflow(workflows.ProfileLifecycleWorkflow)
			// w.RegisterWorkflow(workflows.RecoveryFlowWorkflow)
			// w.RegisterActivity(activities.SentinelActivities)
			
			logger.Warning("ADVERTENCIA: Registros de workflows/activities deben agregarse manualmente")
			logger.Warning("Ver documentación en internal/orchestration/workflows/ y activities/")

			// Iniciar worker
			if err := w.Start(); err != nil {
				logger.Error("Fallo al iniciar worker: %v", err)
				os.Exit(1)
			}

			logger.Success("Worker iniciado exitosamente")
			logger.Info("Escuchando en task queue: %s", taskQueue)
			logger.Info("Presione Ctrl+C para detener")

			// Configurar señales para shutdown graceful
			sigChan := make(chan os.Signal, 1)
			signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

			// Esperar señal de terminación
			<-sigChan
			logger.Info("Deteniendo Worker...")

			w.Stop()
			logger.Success("Worker detenido exitosamente")
		},
	}

	cmd.Flags().StringVarP(&taskQueue, "task-queue", "q", "profile-orchestration", "Task queue de Temporal")

	return cmd
}