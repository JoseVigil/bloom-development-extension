package temporal

import (
	"context"
	"fmt"
	"os"
	"time"

	"go.temporal.io/sdk/client"
	
	"nucleus/internal/core"
	"nucleus/internal/orchestration/types"
	"nucleus/internal/orchestration/queries"
	"nucleus/internal/orchestration/signals"
	"github.com/spf13/cobra"
)

// Client envuelve el cliente de Temporal
type Client struct {
	client client.Client
}

// NewClient crea un nuevo cliente Temporal
func NewClient(ctx context.Context) (*Client, error) {
	// Conectar a localhost:7233 (puerto por defecto de Temporal)
	c, err := client.Dial(client.Options{
		HostPort:  "localhost:7233",
		Namespace: "default",
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create temporal client: %w", err)
	}

	return &Client{client: c}, nil
}

// GetClient retorna el cliente nativo de Temporal
func (c *Client) GetClient() client.Client {
	return c.client
}

// Close cierra el cliente
func (c *Client) Close() {
	if c.client != nil {
		c.client.Close()
	}
}

// ExecuteWorkflow inicia un workflow
func (c *Client) ExecuteWorkflow(ctx context.Context, options client.StartWorkflowOptions, workflow interface{}, args ...interface{}) (client.WorkflowRun, error) {
	return c.client.ExecuteWorkflow(ctx, options, workflow, args...)
}

// SignalWorkflow envía una señal a un workflow
func (c *Client) SignalWorkflow(ctx context.Context, workflowID string, runID string, signalName string, arg interface{}) error {
	return c.client.SignalWorkflow(ctx, workflowID, runID, signalName, arg)
}

// QueryWorkflow consulta el estado de un workflow
func (c *Client) QueryWorkflow(ctx context.Context, workflowID string, runID string, queryType string, result interface{}) error {
	resp, err := c.client.QueryWorkflow(ctx, workflowID, runID, queryType)
	if err != nil {
		return err
	}
	return resp.Get(result)
}

// CancelWorkflow cancela un workflow
func (c *Client) CancelWorkflow(ctx context.Context, workflowID string, runID string) error {
	return c.client.CancelWorkflow(ctx, workflowID, runID)
}

// ────────────────────────────────────────────────────────
// CLI COMMANDS
// ────────────────────────────────────────────────────────

func init() {
	core.RegisterCommand("ORCHESTRATION", workflowStartCmd)
	core.RegisterCommand("ORCHESTRATION", workflowSignalCmd)
	core.RegisterCommand("ORCHESTRATION", workflowStatusCmd)
	core.RegisterCommand("ORCHESTRATION", workflowCancelCmd)
	core.RegisterCommand("ORCHESTRATION", workflowRetryCmd)
	core.RegisterCommand("ORCHESTRATION", workflowHistoryCmd)
}

func workflowStartCmd(c *core.Core) *cobra.Command {
	var environment string

	cmd := &cobra.Command{
		Use:   "workflow start <profile-id>",
		Short: "Inicia (launch) el workflow de ciclo de vida de un perfil",
		Long:  "Ejecuta ProfileLifecycleWorkflow para orquestar el perfil especificado. Equivalente a 'launch'.",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			profileID := args[0]
			
			// Generar command_id único
			commandID := fmt.Sprintf("cmd_%d", time.Now().UnixNano())
			
			logger.Info("Iniciando workflow para perfil: %s", profileID)
			logger.Info("Command ID: %s", commandID)

			// Crear cliente Temporal
			ctx := context.Background()
			temporalClient, err := NewClient(ctx)
			if err != nil {
				logger.Error("Fallo al conectar con Temporal: %v", err)
				logger.Error("Asegúrate de que el servidor Temporal esté corriendo (nucleus temporal start)")
				os.Exit(1)
			}
			defer temporalClient.Close()

			// Configurar opciones del workflow
			workflowOptions := client.StartWorkflowOptions{
				ID:        fmt.Sprintf("profile-lifecycle-%s", profileID),
				TaskQueue: "profile-orchestration",
			}

			// Input del workflow
			input := types.ProfileLifecycleInput{
				ProfileID:   profileID,
				Environment: environment,
			}

			// Ejecutar workflow (importación dinámica para evitar ciclo)
			we, err := temporalClient.client.ExecuteWorkflow(ctx, workflowOptions, "ProfileLifecycleWorkflow", input)
			if err != nil {
				logger.Error("Fallo al iniciar workflow: %v", err)
				os.Exit(1)
			}

			logger.Success("Workflow iniciado exitosamente")
			logger.Info("Workflow ID: %s", we.GetID())
			logger.Info("Run ID: %s", we.GetRunID())
			logger.Info("Command ID: %s", commandID)
		},
	}

	cmd.Flags().StringVarP(&environment, "environment", "e", "production", "Entorno de ejecución")

	return cmd
}

func workflowSignalCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "workflow signal <profile-id> <event-type>",
		Short: "Envía una señal de evento al workflow de un perfil",
		Long:  "Envía un BrainEvent al workflow ProfileLifecycleWorkflow. Eventos válidos: ONBOARDING_COMPLETE, ONBOARDING_FAILED, EXTENSION_ERROR, HEARTBEAT_FAILED, SERVICE_RECOVERY_STARTED, SERVICE_RECOVERY_COMPLETE",
		Args:  cobra.ExactArgs(2),
		Run: func(cmd *cobra.Command, args []string) {
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			profileID := args[0]
			eventType := args[1]

			// Validar event-type conocidos
			validEvents := map[string]bool{
				signals.EventOnboardingStarted:        true,
				signals.EventOnboardingComplete:       true,
				signals.EventOnboardingFailed:         true,
				signals.EventExtensionError:           true,
				signals.EventHeartbeatFailed:          true,
				signals.EventServiceRecoveryStarted:   true,
				signals.EventServiceRecoveryComplete:  true,
			}

			if !validEvents[eventType] {
				logger.Error("Evento inválido: %s", eventType)
				logger.Error("Eventos válidos: ONBOARDING_STARTED, ONBOARDING_COMPLETE, ONBOARDING_FAILED, EXTENSION_ERROR, HEARTBEAT_FAILED, SERVICE_RECOVERY_STARTED, SERVICE_RECOVERY_COMPLETE")
				os.Exit(1)
			}

			logger.Info("Enviando señal '%s' al perfil: %s", eventType, profileID)

			// Crear cliente Temporal
			ctx := context.Background()
			temporalClient, err := NewClient(ctx)
			if err != nil {
				logger.Error("Fallo al conectar con Temporal: %v", err)
				os.Exit(1)
			}
			defer temporalClient.Close()

			// Construir evento
			event := types.BrainEvent{
				Type:      eventType,
				ProfileID: profileID,
				Timestamp: time.Now().Unix(),
				Data:      make(map[string]interface{}),
			}

			// Enviar señal
			workflowID := fmt.Sprintf("profile-lifecycle-%s", profileID)
			err = temporalClient.SignalWorkflow(ctx, workflowID, "", signals.SignalBrainEvent, event)
			if err != nil {
				logger.Error("Fallo al enviar señal: %v", err)
				os.Exit(1)
			}

			logger.Success("Señal enviada exitosamente al workflow")
		},
	}

	return cmd
}

func workflowStatusCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "workflow status <profile-id>",
		Short: "Consulta el estado del workflow de un perfil",
		Long:  "Ejecuta query para obtener ProfileStatus del workflow",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			profileID := args[0]
			logger.Info("Consultando estado del perfil: %s", profileID)

			// Crear cliente Temporal
			ctx := context.Background()
			temporalClient, err := NewClient(ctx)
			if err != nil {
				logger.Error("Fallo al conectar con Temporal: %v", err)
				os.Exit(1)
			}
			defer temporalClient.Close()

			// Query del workflow
			workflowID := fmt.Sprintf("profile-lifecycle-%s", profileID)
			var status types.ProfileStatus
			err = temporalClient.QueryWorkflow(ctx, workflowID, "", queries.QueryStatus, &status)
			if err != nil {
				logger.Error("Fallo al consultar workflow: %v", err)
				os.Exit(1)
			}

			// Mostrar estado
			logger.Info("─────────────────────────────────────")
			logger.Info("Profile ID: %s", status.ProfileID)
			logger.Info("Estado: %s", status.State)
			logger.Info("Última actualización: %s", status.LastUpdate.Format(time.RFC3339))
			logger.Info("Sentinel activo: %v", status.SentinelRunning)
			if status.ErrorMessage != "" {
				logger.Warning("Error: %s", status.ErrorMessage)
			}
			logger.Info("─────────────────────────────────────")
		},
	}

	return cmd
}

func workflowCancelCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "workflow cancel <profile-id>",
		Short: "Cancela (stop) el workflow de un perfil",
		Long:  "Detiene la ejecución del workflow ProfileLifecycleWorkflow. Envía señal de shutdown limpia.",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			profileID := args[0]
			logger.Info("Cancelando workflow para perfil: %s", profileID)

			// Crear cliente Temporal
			ctx := context.Background()
			temporalClient, err := NewClient(ctx)
			if err != nil {
				logger.Error("Fallo al conectar con Temporal: %v", err)
				os.Exit(1)
			}
			defer temporalClient.Close()

			// Primero intentar shutdown graceful con señal
			workflowID := fmt.Sprintf("profile-lifecycle-%s", profileID)
			logger.Info("Enviando señal de shutdown graceful...")
			
			err = temporalClient.SignalWorkflow(ctx, workflowID, "", signals.SignalShutdown, nil)
			if err != nil {
				logger.Warning("No se pudo enviar señal de shutdown: %v", err)
				logger.Info("Intentando cancelación forzada...")
				
				// Si falla la señal, cancelar directamente
				err = temporalClient.CancelWorkflow(ctx, workflowID, "")
				if err != nil {
					logger.Error("Fallo al cancelar workflow: %v", err)
					os.Exit(1)
				}
			}

			logger.Success("Workflow cancelado exitosamente")
		},
	}

	return cmd
}

func workflowRetryCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "workflow retry <profile-id>",
		Short: "Reintenta un workflow fallido desde el último estado",
		Long:  "Reinicia el workflow desde un estado de fallo. Usa Continue-As-New internamente.",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			profileID := args[0]
			logger.Info("Reintentando workflow para perfil: %s", profileID)

			// Crear cliente Temporal
			ctx := context.Background()
			temporalClient, err := NewClient(ctx)
			if err != nil {
				logger.Error("Fallo al conectar con Temporal: %v", err)
				os.Exit(1)
			}
			defer temporalClient.Close()

			// Verificar estado actual
			workflowID := fmt.Sprintf("profile-lifecycle-%s", profileID)
			var status types.ProfileStatus
			err = temporalClient.QueryWorkflow(ctx, workflowID, "", queries.QueryStatus, &status)
			if err != nil {
				logger.Error("Fallo al consultar workflow: %v", err)
				logger.Error("El workflow podría no existir o estar terminado")
				os.Exit(1)
			}

			// Validar que esté en estado fallido
			if status.State != types.StateFailed {
				logger.Warning("El workflow no está en estado FAILED (estado actual: %s)", status.State)
				logger.Warning("El retry solo tiene sentido para workflows fallidos")
				os.Exit(1)
			}

			logger.Info("Estado actual: FAILED - %s", status.ErrorMessage)
			logger.Info("Enviando señal de recovery...")

			// Enviar señal de recovery
			event := types.BrainEvent{
				Type:      signals.EventServiceRecoveryStarted,
				ProfileID: profileID,
				Timestamp: time.Now().Unix(),
				Data:      make(map[string]interface{}),
			}

			err = temporalClient.SignalWorkflow(ctx, workflowID, "", signals.SignalBrainEvent, event)
			if err != nil {
				logger.Error("Fallo al enviar señal de recovery: %v", err)
				os.Exit(1)
			}

			logger.Success("Señal de recovery enviada")
			logger.Info("Verificando estado después de 2 segundos...")
			
			time.Sleep(2 * time.Second)

			// Verificar nuevo estado
			var newStatus types.ProfileStatus
			err = temporalClient.QueryWorkflow(ctx, workflowID, "", queries.QueryStatus, &newStatus)
			if err == nil {
				logger.Info("Nuevo estado: %s", newStatus.State)
			}
		},
	}

	return cmd
}

func workflowHistoryCmd(c *core.Core) *cobra.Command {
	var limit int

	cmd := &cobra.Command{
		Use:   "workflow history <profile-id>",
		Short: "Muestra el historial de eventos del workflow",
		Long:  "Recupera y muestra los eventos históricos del workflow (poll_events). Útil para debug y rehidratación.",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			profileID := args[0]
			logger.Info("Consultando historial del perfil: %s", profileID)

			// Crear cliente Temporal
			ctx := context.Background()
			temporalClient, err := NewClient(ctx)
			if err != nil {
				logger.Error("Fallo al conectar con Temporal: %v", err)
				os.Exit(1)
			}
			defer temporalClient.Close()

			// Obtener historial
			workflowID := fmt.Sprintf("profile-lifecycle-%s", profileID)
			iter := temporalClient.client.GetWorkflowHistory(ctx, workflowID, "", false, 0)

			logger.Info("═════════════════════════════════════")
			logger.Info("HISTORIAL DE EVENTOS")
			logger.Info("═════════════════════════════════════")

			eventCount := 0
			for iter.HasNext() && (limit == 0 || eventCount < limit) {
				event, err := iter.Next()
				if err != nil {
					logger.Error("Error al leer evento: %v", err)
					break
				}

				eventCount++
				eventType := event.GetEventType().String()
				timestamp := time.Unix(0, event.GetEventTime().AsTime().UnixNano())

				logger.Info("[%d] %s - %s", event.GetEventId(), eventType, timestamp.Format(time.RFC3339))
			}

			logger.Info("═════════════════════════════════════")
			logger.Info("Total eventos: %d", eventCount)
			logger.Info("═════════════════════════════════════")
		},
	}

	cmd.Flags().IntVarP(&limit, "limit", "l", 50, "Número máximo de eventos a mostrar (0 = todos)")

	return cmd
}