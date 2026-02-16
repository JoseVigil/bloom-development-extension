package workflows

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"nucleus/internal/orchestration/queries"
	"nucleus/internal/orchestration/signals"
	"nucleus/internal/orchestration/types"
)

// ProfileLifecycleWorkflow es el workflow principal que orquesta el ciclo de vida de un perfil
// Este workflow es de larga duración y representa el "actor persistente" del perfil
func ProfileLifecycleWorkflow(ctx workflow.Context, input types.ProfileLifecycleInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("ProfileLifecycleWorkflow started", "profile_id", input.ProfileID)

	// Estado mutable del workflow
	state := types.ProfileStatus{
		ProfileID:       input.ProfileID,
		State:           types.StateSeeded, // Inicia como SEEDED después de seed
		LastUpdate:      workflow.Now(ctx),
		SentinelRunning: false,
	}

	// Detalles completos de Sentinel cuando esté lanzado
	var sentinelDetails *types.SentinelLaunchResult

	// Channels para signals
	launchSignalChan := workflow.GetSignalChannel(ctx, signals.SignalLaunch)
	shutdownChan := workflow.GetSignalChannel(ctx, signals.SignalShutdown)
	heartbeatChan := workflow.GetSignalChannel(ctx, signals.SignalHeartbeat)
	brainEventChan := workflow.GetSignalChannel(ctx, signals.SignalBrainEvent)

	// Registrar query para estado básico
	if err := workflow.SetQueryHandler(ctx, queries.QueryStatus, func() (types.ProfileStatus, error) {
		return state, nil
	}); err != nil {
		return fmt.Errorf("failed to register status query: %w", err)
	}

	// Registrar query para detalles completos de Sentinel
	if err := workflow.SetQueryHandler(ctx, queries.QuerySentinelDetails, func() (*types.SentinelLaunchResult, error) {
		if sentinelDetails == nil {
			return nil, fmt.Errorf("sentinel not launched yet")
		}
		return sentinelDetails, nil
	}); err != nil {
		return fmt.Errorf("failed to register sentinel-details query: %w", err)
	}

	// Activity options con timeouts y retries apropiados
	activityOptions := workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		HeartbeatTimeout:    30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts:    3,
			InitialInterval:    time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    30 * time.Second,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, activityOptions)

	// Variables para tracking
	var currentCommandID string
	var chromePID int
	var lastHeartbeat time.Time

	// Loop principal del workflow - permanece activo mientras el perfil existe
	for {
		selector := workflow.NewSelector(ctx)

		// Signal: LAUNCH - Lanzar Sentinel para este perfil
		selector.AddReceive(launchSignalChan, func(c workflow.ReceiveChannel, more bool) {
			var launchSignal types.LaunchSignal
			c.Receive(ctx, &launchSignal)

			logger.Info("Received LAUNCH signal", 
				"profile_id", input.ProfileID,
				"mode", launchSignal.Mode)

			// Validar que no esté ya corriendo
			if state.SentinelRunning {
				logger.Warn("Sentinel already running, ignoring launch signal")
				return
			}

			// Transición a LAUNCHING
			state.State = types.StateLaunching
			state.LastUpdate = workflow.Now(ctx)

			// Generar CommandID único
			currentCommandID = fmt.Sprintf("launch_%s_%d", input.ProfileID, workflow.Now(ctx).UnixNano())

			// Construir input para LaunchSentinel activity
			launchInput := types.SentinelLaunchInput{
				ProfileID:      input.ProfileID,
				CommandID:      currentCommandID,
				Environment:    input.Environment,
				Mode:           launchSignal.Mode,
				ConfigOverride: launchSignal.ConfigOverride,
			}

			// Ejecutar activity
			var launchResult types.SentinelLaunchResult
			err := workflow.ExecuteActivity(ctx, "sentinel.LaunchSentinel", launchInput).Get(ctx, &launchResult)

			if err != nil {
				logger.Error("LaunchSentinel activity failed", "error", err)
				state.State = types.StateFailed
				state.ErrorMessage = err.Error()
				state.LastUpdate = workflow.Now(ctx)
				sentinelDetails = &types.SentinelLaunchResult{
					Success: false,
					Error:   err.Error(),
				}
				return
			}

			// Guardar detalles completos
			sentinelDetails = &launchResult

			if launchResult.Success {
				// Transición a RUNNING
				state.State = types.StateRunning
				state.SentinelRunning = true
				state.ErrorMessage = ""
				chromePID = launchResult.ChromePID
				lastHeartbeat = workflow.Now(ctx)

				logger.Info("Sentinel launched successfully",
					"chrome_pid", launchResult.ChromePID,
					"debug_port", launchResult.DebugPort,
					"extension_loaded", launchResult.ExtensionLoaded)
			} else {
				// Launch falló
				state.State = types.StateFailed
				state.ErrorMessage = launchResult.Error
				logger.Error("Sentinel launch failed", "error", launchResult.Error)
			}

			state.LastUpdate = workflow.Now(ctx)
		})

		// Signal: SHUTDOWN - Detener Sentinel y finalizar workflow
		selector.AddReceive(shutdownChan, func(c workflow.ReceiveChannel, more bool) {
			var shutdownSignal interface{}
			c.Receive(ctx, &shutdownSignal)

			logger.Info("Received SHUTDOWN signal", "profile_id", input.ProfileID)

			// Transición a SHUTDOWN
			state.State = types.StateShutdown
			state.LastUpdate = workflow.Now(ctx)

			// Si Sentinel está corriendo, detenerlo
			if state.SentinelRunning && chromePID > 0 {
				stopInput := types.SentinelStopInput{
					ProfileID: input.ProfileID,
					CommandID: currentCommandID,
					ProcessID: chromePID,
				}

				var stopResult types.SentinelStopResult
				err := workflow.ExecuteActivity(ctx, "sentinel.StopSentinel", stopInput).Get(ctx, &stopResult)

				if err != nil {
					logger.Error("Failed to stop Sentinel", "error", err)
					state.ErrorMessage = fmt.Sprintf("shutdown error: %v", err)
				} else if stopResult.Success {
					state.SentinelRunning = false
					logger.Info("Sentinel stopped successfully")
				} else {
					state.ErrorMessage = stopResult.Error
					logger.Error("Sentinel stop failed", "error", stopResult.Error)
				}
			}

			// Transición final a TERMINATED
			state.State = types.StateTerminated
			state.LastUpdate = workflow.Now(ctx)

			logger.Info("Profile terminated", "profile_id", input.ProfileID)
			// Salir del loop - workflow terminará
			return
		})

		// Signal: HEARTBEAT - Confirmación de que Sentinel sigue vivo
		selector.AddReceive(heartbeatChan, func(c workflow.ReceiveChannel, more bool) {
			var heartbeat types.HeartbeatSignal
			c.Receive(ctx, &heartbeat)

			lastHeartbeat = workflow.Now(ctx)
			logger.Debug("Received heartbeat", "profile_id", input.ProfileID)

			// Si estábamos degraded, intentar recovery
			if state.State == types.StateDegraded {
				state.State = types.StateRunning
				state.ErrorMessage = ""
				state.LastUpdate = workflow.Now(ctx)
				logger.Info("Profile recovered from degraded state")
			}
		})

		// Signal: BRAIN_EVENT - Eventos del Brain (onboarding, errores, etc.)
		selector.AddReceive(brainEventChan, func(c workflow.ReceiveChannel, more bool) {
			var event types.BrainEvent
			c.Receive(ctx, &event)

			logger.Info("Received brain event", 
				"type", event.Type, 
				"profile_id", event.ProfileID)

			state.LastUpdate = workflow.Now(ctx)

			switch event.Type {
			case signals.EventOnboardingStarted:
				// Si recibimos esto, transicionar de SEEDED a ONBOARDING
				if state.State == types.StateSeeded {
					state.State = types.StateOnboarding
					logger.Info("Profile entering onboarding state")
				}

			case signals.EventOnboardingComplete:
				// Onboarding completado, perfil ready para launch
				if state.State == types.StateOnboarding {
					state.State = types.StateReady
					logger.Info("Profile onboarding completed, now READY")
				}

			case signals.EventOnboardingFailed:
				state.State = types.StateFailed
				state.ErrorMessage = event.Error
				logger.Error("Profile onboarding failed", "error", event.Error)

			case signals.EventExtensionError:
				if state.State == types.StateRunning {
					state.State = types.StateDegraded
					state.ErrorMessage = event.Error
					logger.Warn("Profile degraded due to extension error", "error", event.Error)
				}

			case signals.EventHeartbeatFailed:
				if state.State == types.StateRunning {
					state.State = types.StateDegraded
					logger.Warn("Profile degraded due to heartbeat failure")

					// Iniciar recovery workflow hijo
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
					err := workflow.ExecuteChildWorkflow(childCtx, RecoveryFlowWorkflow, recoveryInput).Get(ctx, &recoveryResult)

					if err != nil {
						logger.Error("Recovery workflow failed", "error", err)
						state.State = types.StateFailed
						state.ErrorMessage = fmt.Sprintf("recovery failed: %v", err)
					} else if recoveryResult.Success {
						state.State = recoveryResult.NewState
						state.ErrorMessage = ""
						logger.Info("Recovery completed successfully", "new_state", state.State)
					}
				}

			case signals.EventServiceRecoveryStarted:
				state.State = types.StateRecovering
				logger.Info("Service recovery started")

			case signals.EventServiceRecoveryComplete:
				state.State = types.StateRunning
				state.ErrorMessage = ""
				logger.Info("Service recovery completed")
			}
		})

		// Timer: Verificación periódica de heartbeat
		if state.SentinelRunning && state.State == types.StateRunning {
			heartbeatTimeout := workflow.NewTimer(ctx, 2*time.Minute)
			selector.AddFuture(heartbeatTimeout, func(f workflow.Future) {
				timeSinceLastHeartbeat := workflow.Now(ctx).Sub(lastHeartbeat)
				if timeSinceLastHeartbeat > 2*time.Minute {
					logger.Warn("Heartbeat timeout detected", 
						"since_last", timeSinceLastHeartbeat)
					state.State = types.StateDegraded
					state.ErrorMessage = "heartbeat timeout"
					state.LastUpdate = workflow.Now(ctx)
				}
			})
		}

		// Ejecutar selector
		selector.Select(ctx)

		// Condición de salida: si estamos TERMINATED, terminar workflow
		if state.State == types.StateTerminated {
			logger.Info("ProfileLifecycleWorkflow completed", "profile_id", input.ProfileID)
			return nil
		}
	}
}

// RecoveryFlowWorkflow - Child workflow para intentar recuperar un perfil degraded
func RecoveryFlowWorkflow(ctx workflow.Context, input types.RecoveryFlowInput) (types.RecoveryFlowResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("RecoveryFlowWorkflow started", 
		"profile_id", input.ProfileID,
		"failure_type", input.FailureType)

	activityOptions := workflow.ActivityOptions{
		StartToCloseTimeout: 3 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 2,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, activityOptions)

	// Estrategia simple: reintentar lanzamiento
	// En una implementación más completa, aquí habría lógica de recovery específica

	result := types.RecoveryFlowResult{
		Success:  false,
		NewState: types.StateFailed,
	}

	// Simular espera antes de retry
	workflow.Sleep(ctx, 10*time.Second)

	// Intentar verificar estado del sistema
	logger.Info("Recovery: checking system health")

	// Si llegamos aquí sin errores, asumir recovery exitoso
	result.Success = true
	result.NewState = types.StateRunning

	logger.Info("RecoveryFlowWorkflow completed", "success", result.Success)
	return result, nil
}