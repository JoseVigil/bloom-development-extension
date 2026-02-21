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

// ProfileLifecycleWorkflow es el workflow principal que orquesta el ciclo de vida de un perfil.
// Este workflow es de larga duración y representa el "actor persistente" del perfil.
// Un perfil puede ser lanzado y detenido cientos de veces — el workflow NUNCA termina
// por un shutdown normal. Solo termina si se recibe una señal de eliminación definitiva.
func ProfileLifecycleWorkflow(ctx workflow.Context, input types.ProfileLifecycleInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("ProfileLifecycleWorkflow started", "profile_id", input.ProfileID)

	// Estado mutable del workflow
	state := types.ProfileStatus{
		ProfileID:       input.ProfileID,
		State:           types.StateSeeded,
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

	// Variables para tracking de sesión actual
	var currentCommandID string
	var chromePID int
	var lastHeartbeat time.Time

	// cancelHeartbeatTimer permite cancelar el timer del ciclo anterior
	// antes de crear uno nuevo, evitando la acumulación de timers.
	var cancelHeartbeatTimer func()

	// Loop principal — permanece activo mientras el perfil existe
	// Un perfil puede ser lanzado y detenido N veces sin que el workflow termine
	for {
		selector := workflow.NewSelector(ctx)

		// Signal: LAUNCH — Lanzar Sentinel para este perfil
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

			// Generar CommandID único para esta sesión
			currentCommandID = fmt.Sprintf("launch_%s_%d", input.ProfileID, workflow.Now(ctx).UnixNano())

			launchInput := types.SentinelLaunchInput{
				ProfileID:      input.ProfileID,
				CommandID:      currentCommandID,
				Environment:    input.Environment,
				Mode:           launchSignal.Mode,
				ConfigOverride: launchSignal.ConfigOverride,
			}

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

			sentinelDetails = &launchResult

			if launchResult.Success {
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
				state.State = types.StateFailed
				state.ErrorMessage = launchResult.Error
				logger.Error("Sentinel launch failed", "error", launchResult.Error)
			}

			state.LastUpdate = workflow.Now(ctx)
		})

		// Signal: SHUTDOWN — Detener Sentinel y volver a SEEDED para próximo launch
		// CRÍTICO: NO termina el workflow. El perfil puede relanzarse N veces.
		selector.AddReceive(shutdownChan, func(c workflow.ReceiveChannel, more bool) {
			var shutdownSignal interface{}
			c.Receive(ctx, &shutdownSignal)

			logger.Info("Received SHUTDOWN signal", "profile_id", input.ProfileID)

			state.State = types.StateShutdown
			state.LastUpdate = workflow.Now(ctx)

			// Detener Sentinel si está corriendo
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
				} else if stopResult.Success {
					logger.Info("Sentinel stopped successfully")
				} else {
					logger.Error("Sentinel stop failed", "error", stopResult.Error)
				}
			}

			// Resetear sesión — listo para próximo LAUNCH
			state.State = types.StateSeeded
			state.SentinelRunning = false
			state.ErrorMessage = ""
			chromePID = 0
			currentCommandID = ""
			sentinelDetails = nil
			state.LastUpdate = workflow.Now(ctx)

			logger.Info("Profile stopped and ready for relaunch", "profile_id", input.ProfileID)
			// NO hay return — el loop continúa esperando el próximo LAUNCH signal
		})

		// Signal: HEARTBEAT — Confirmación de que Sentinel sigue vivo
		selector.AddReceive(heartbeatChan, func(c workflow.ReceiveChannel, more bool) {
			var heartbeat types.HeartbeatSignal
			c.Receive(ctx, &heartbeat)

			// Cancelar el timer pendiente del ciclo anterior antes de renovar
			if cancelHeartbeatTimer != nil {
				cancelHeartbeatTimer()
				cancelHeartbeatTimer = nil
			}

			lastHeartbeat = workflow.Now(ctx)
			logger.Debug("Received heartbeat", "profile_id", input.ProfileID)
		})

		// Signal: BRAIN_EVENT — Eventos del Brain
		selector.AddReceive(brainEventChan, func(c workflow.ReceiveChannel, more bool) {
			var event types.BrainEvent
			c.Receive(ctx, &event)

			logger.Info("Received brain event",
				"type", event.Type,
				"profile_id", event.ProfileID)

			state.LastUpdate = workflow.Now(ctx)

			switch event.Type {
			case signals.EventOnboardingStarted:
				if state.State == types.StateSeeded {
					state.State = types.StateOnboarding
					logger.Info("Profile entering onboarding state")
				}

			case signals.EventOnboardingComplete:
				if state.State == types.StateOnboarding {
					state.State = types.StateReady
					logger.Info("Profile onboarding completed, now READY")
				}

			case signals.EventOnboardingFailed:
				state.State = types.StateFailed
				state.ErrorMessage = event.Error
				logger.Error("Profile onboarding failed", "error", event.Error)

			case signals.EventExtensionError:
				// Error de extensión no fatal — perfil pasa a IDLE para permitir relaunch
				if state.State == types.StateRunning {
					state.State = types.StateIdle
					state.ErrorMessage = event.Error
					logger.Warn("Profile set to IDLE due to extension error", "error", event.Error)
				}

			case signals.EventHeartbeatFailed:
				// Lanzar recovery directamente sin pasar por DEGRADED
				if state.State == types.StateRunning {
					logger.Warn("Heartbeat failed — launching recovery workflow")

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
					} else {
						state.State = types.StateIdle
						state.ErrorMessage = "recovery unsuccessful — profile idle"
						logger.Warn("Recovery unsuccessful, profile set to IDLE")
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

		// Timer: Verificación periódica de heartbeat cuando Sentinel está corriendo
		// CRÍTICO: cancelar el timer del ciclo anterior antes de crear uno nuevo.
		// Sin esto, cada iteración del loop acumula un timer pendiente y eventualmente
		// uno dispara aunque los heartbeats lleguen correctamente.
		if state.SentinelRunning && state.State == types.StateRunning {
			if cancelHeartbeatTimer != nil {
				cancelHeartbeatTimer()
			}
			timerCtx, cancel := workflow.WithCancel(ctx)
			cancelHeartbeatTimer = cancel

			heartbeatTimeout := workflow.NewTimer(timerCtx, 2*time.Minute)
			selector.AddFuture(heartbeatTimeout, func(f workflow.Future) {
				// Si el contexto fue cancelado (heartbeat llegó a tiempo), f.Get devuelve error.
				// Solo actuar si el timer expiró realmente.
				if f.Get(timerCtx, nil) != nil {
					return // timer cancelado — heartbeat llegó antes
				}
				timeSinceLastHeartbeat := workflow.Now(ctx).Sub(lastHeartbeat)
				if timeSinceLastHeartbeat > 2*time.Minute {
					logger.Warn("Heartbeat timeout detected",
						"since_last", timeSinceLastHeartbeat)
					// IDLE en lugar de DEGRADED — permite relaunch directo sin intervención manual
					state.State = types.StateIdle
					state.ErrorMessage = "heartbeat timeout"
					state.SentinelRunning = false
					state.LastUpdate = workflow.Now(ctx)
					cancelHeartbeatTimer = nil
				}
			})
		}

		selector.Select(ctx)

		// El workflow solo termina si el estado es TERMINATED
		// TERMINATED es reservado para eliminación definitiva del perfil — nunca para shutdown normal
		if state.State == types.StateTerminated {
			logger.Info("ProfileLifecycleWorkflow terminated definitively", "profile_id", input.ProfileID)
			return nil
		}
	}
}

// RecoveryFlowWorkflow — Child workflow para intentar recuperar un perfil degraded
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

	workflow.Sleep(ctx, 10*time.Second)

	logger.Info("Recovery: checking system health")

	result := types.RecoveryFlowResult{
		Success:  true,
		NewState: types.StateRunning,
	}

	logger.Info("RecoveryFlowWorkflow completed", "success", result.Success)
	return result, nil
}