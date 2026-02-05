package signals

const (
	// SignalBrainEvent es el nombre de la señal para eventos del Brain
	SignalBrainEvent = "brain-event"
)

// Event types
const (
	EventOnboardingStarted        = "ONBOARDING_STARTED"
	EventOnboardingComplete       = "ONBOARDING_COMPLETE"
	EventOnboardingFailed         = "ONBOARDING_FAILED"
	EventExtensionError           = "EXTENSION_ERROR"
	EventHeartbeatFailed          = "HEARTBEAT_FAILED"
	EventServiceRecoveryStarted   = "SERVICE_RECOVERY_STARTED"
	EventServiceRecoveryComplete  = "SERVICE_RECOVERY_COMPLETE"
)

// IsOnboardingEvent verifica si es un evento de onboarding
func IsOnboardingEvent(eventType string) bool {
	return eventType == EventOnboardingStarted ||
		eventType == EventOnboardingComplete ||
		eventType == EventOnboardingFailed
}

// IsRecoveryEvent verifica si es un evento de recovery
func IsRecoveryEvent(eventType string) bool {
	return eventType == EventServiceRecoveryStarted ||
		eventType == EventServiceRecoveryComplete
}

// IsErrorEvent verifica si es un evento de error
func IsErrorEvent(eventType string) bool {
	return eventType == EventExtensionError ||
		eventType == EventHeartbeatFailed
}