package workflows

import (
	"fmt"
	"time"
	"context"
	"os"

	"go.temporal.io/sdk/workflow"
	"go.temporal.io/sdk/client"

	"nucleus/internal/orchestration/activities"
	"nucleus/internal/orchestration/queries"
	"nucleus/internal/orchestration/signals"
	"nucleus/internal/orchestration/types"
	temporalclient "nucleus/internal/orchestration/temporal"
	"nucleus/internal/core"
	"github.com/spf13/cobra"
)

// ProfileLifecycleWorkflow es el workflow principal que orquesta el ciclo de vida de un perfil
func ProfileLifecycleWorkflow(ctx workflow.Context, input types.ProfileLifecycleInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("ProfileLifecycleWorkflow started", "profile_id", input.ProfileID)

	// Estado mutable del workflow
	state := types.ProfileStatus{
		ProfileID:       input.ProfileID,
		State:           types.StateIdle,
		LastUpdate:      workflow.Now(ctx),
		SentinelRunning: false,
	}

	// Channels para signals
	brainEventChan := workflow.GetSignalChannel(ctx, signals.SignalBrainEvent)
	shutdownChan := workflow.GetSignalChannel(ctx, signals.SignalShutdown)

	// Registrar queries
	if err := workflow.SetQueryHandler(ctx, queries.QueryStatus, func() (types.ProfileStatus, error) {
		return state, nil
	}); err != nil {
		return fmt.Errorf("failed to register status query: %w", err)
	}

	// Activity options
	activityOptions := workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		HeartbeatTimeout:    30 * time.Second,
		RetryPolicy: &workflow.RetryPolicy{
			MaximumAttempts: 3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, activityOptions)

	// Variables para tracking
	var sentinelProcessID int
	var currentCommandID string

	// Loop principal del workflow
	for {
		selector := workflow.NewSelector(ctx)

		// Listener para eventos del Brain
		selector.AddReceive(brainEventChan, func(c workflow.ReceiveChannel, more bool) {
			var event types.BrainEvent
			c.Receive(ctx, &event)
			
			logger.Info("Received brain event", "type", event.Type, "profile_id", event.ProfileID)
			state.LastUpdate = workflow.Now(ctx)

			// Procesar evento según tipo
			switch event.Type {
			case signals.EventOnboardingStarted:
				state.State = types.StateOnboarding
				logger.Info("Profile entering onboarding state")

			case signals.EventOnboardingComplete:
				state.State = types.StateReady
				logger.Info("Profile onboarding completed, transitioning to READY")
				
				// Lanzar Sentinel
				currentCommandID = fmt.Sprintf("cmd_%d", workflow.Now(ctx).UnixNano())
				launchInput := types.SentinelLaunchInput{
					ProfileID:   input.ProfileID,
					CommandID:   currentCommandID,
					Environment: input.Environment,
				}
				
				var launchResult types.SentinelLaunchResult
				if err := workflow.ExecuteActivity(ctx, activities.SentinelActivities.LaunchSentinel, launchInput).Get(ctx, &launchResult); err != nil {
					logger.Error("Failed to launch Sentinel", "error", err)
					state.State = types.StateFailed
					state.ErrorMessage = err.Error()
				} else if launchResult.Success {
					state.SentinelRunning = true
					sentinelProcessID = launchResult.ProcessID
					logger.Info("Sentinel launched successfully", "process_id", sentinelProcessID)
				} else {
					state.State = types.StateFailed
					state.ErrorMessage = launchResult.Error
				}

			case signals.EventOnboardingFailed:
				state.State = types.StateFailed
				state.ErrorMessage = event.Error
				logger.Error("Profile onboarding failed", "error", event.Error)

			case signals.EventExtensionError:
				if state.State == types.StateReady {
					state.State = types.StateDegraded
					logger.Warn("Profile degraded due to extension error", "error", event.Error)
				}

			case signals.EventHeartbeatFailed:
				if state.State == types.StateReady {
					state.State = types.StateDegraded
					logger.Warn("Profile degraded due to heartbeat failure")
					
					// Iniciar workflow de recovery
					recoveryInput := types.RecoveryFlowInput{
						ProfileID:    input.ProfileID,
						FailureType:  "HEARTBEAT_FAILED",
						ErrorMessage: event.Error,
					}
					
					childWorkflowOptions := workflow.ChildWorkflowOptions{
						WorkflowID: fmt.Sprintf("recovery_%s_%d", input.ProfileID, workflow.Now(ctx).UnixNano()),
					}
					childCtx := workflow.WithChildOptions(ctx, childWorkflowOptions)
					
					var recoveryResult types.RecoveryFlowResult
					if err := workflow.ExecuteChildWorkflow(childCtx, RecoveryFlowWorkflow, recoveryInput).Get(ctx, &recoveryResult); err != nil {
						logger.Error("Recovery workflow failed", "error", err)
					} else if recoveryResult.Success {
						state.State = recoveryResult.NewState
						logger.Info("Recovery completed successfully", "new_state", state.State)
					}
				}

			case signals.EventServiceRecoveryStarted:
				state.State = types.StateRecovering
				logger.Info("Service recovery started")

			case signals.EventServiceRecoveryComplete:
				state.State = types.StateReady
				state.ErrorMessage = ""
				logger.Info("Service recovery completed")
			}
		})

		// Listener para shutdown
		selector.AddReceive(shutdownChan, func(c workflow.ReceiveChannel, more bool) {
			var shutdownSignal interface{}
			c.Receive(ctx, &shutdownSignal)
			
			logger.Info("Received shutdown signal")
			
			// Detener Sentinel si está corriendo
			if state.SentinelRunning {
				stopInput := types.SentinelStopInput{
					ProfileID: input.ProfileID,
					CommandID: currentCommandID,
					ProcessID: sentinelProcessID,
				}
				
				var stopResult types.SentinelStopResult
				if err := workflow.ExecuteActivity(ctx, activities.SentinelActivities.StopSentinel, stopInput).Get(ctx, &stopResult); err != nil {
					logger.Error("Failed to stop Sentinel", "error", err)
				} else {
					state.SentinelRunning = false
					logger.Info("Sentinel stopped successfully")
				}
			}
			
			// Terminar workflow
			return
		})

		selector.Select(ctx)

		// Si recibimos shutdown, salir del loop
		if !workflow.IsReplaying(ctx) && state.State == types.StateIdle && !state.SentinelRunning {
			break
		}
	}

	logger.Info("ProfileLifecycleWorkflow completed", "profile_id", input.ProfileID)
	return nil
}

// ────────────────────────────────────────────────────────
// CLI COMMANDS
// ────────────────────────────────────────────────────────

func init() {
	core.RegisterCommand("ORCHESTRATION", workflowStartCmd)
	core.RegisterCommand("ORCHESTRATION", workflowSignalCmd)
	core.RegisterCommand("ORCHESTRATION", workflowStatusCmd)
}

func workflowStartCmd(c *core.Core) *cobra.Command {
	var environment string

	cmd := &cobra.Command{
		Use:   "workflow start <profile-id>",
		Short: "Inicia el workflow de ciclo de vida de un perfil",
		Long:  "Ejecuta ProfileLifecycleWorkflow para orquestar el perfil especificado",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			logger, err := core.InitLogger(&c.Paths, "ORCHESTRATION")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			profileID := args[0]
			logger.Info("Iniciando workflow para perfil: %s", profileID)

			// Crear cliente Temporal
			ctx := context.Background()
			temporalClient, err := temporalclient.NewClient(ctx)
			if err != nil {
				logger.Error("Fallo al conectar con Temporal: %v", err)
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

			// Ejecutar workflow
			we, err := temporalClient.ExecuteWorkflow(ctx, workflowOptions, ProfileLifecycleWorkflow, input)
			if err != nil {
				logger.Error("Fallo al iniciar workflow: %v", err)
				os.Exit(1)
			}

			logger.Success("Workflow iniciado exitosamente")
			logger.Info("Workflow ID: %s", we.GetID())
			logger.Info("Run ID: %s", we.GetRunID())
		},
	}

	cmd.Flags().StringVarP(&environment, "environment", "e", "production", "Entorno de ejecución")

	return cmd
}

func workflowSignalCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "workflow signal <profile-id> <event-type>",
		Short: "Envía una señal de evento al workflow de un perfil",
		Long:  "Envía un BrainEvent al workflow ProfileLifecycleWorkflow",
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

			logger.Info("Enviando señal '%s' al perfil: %s", eventType, profileID)

			// Crear cliente Temporal
			ctx := context.Background()
			temporalClient, err := temporalclient.NewClient(ctx)
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
			temporalClient, err := temporalclient.NewClient(ctx)
			if err != nil {
				logger.Error("Fallo al conectar con Temporal: %v", err)
				os.Exit(1)
			}
			defer temporalClient.Close()

			// Query del workflow
			workflowID := fmt.Sprintf("profile-lifecycle-%s", profileID)
			value, err := temporalClient.QueryWorkflow(ctx, workflowID, "", queries.QueryStatus)
			if err != nil {
				logger.Error("Fallo al consultar workflow: %v", err)
				os.Exit(1)
			}

			// Decodificar resultado
			var status types.ProfileStatus
			if err := value.Get(&status); err != nil {
				logger.Error("Fallo al decodificar estado: %v", err)
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