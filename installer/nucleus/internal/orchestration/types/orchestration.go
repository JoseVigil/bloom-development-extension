package types

import "time"

// ProfileState representa el estado del perfil en el workflow
type ProfileState string

const (
	StateIdle      ProfileState = "IDLE"
	StateOnboarding ProfileState = "ONBOARDING"
	StateReady     ProfileState = "READY"
	StateDegraded  ProfileState = "DEGRADED"
	StateFailed    ProfileState = "FAILED"
	StateRecovering ProfileState = "RECOVERING"
)

// BrainEvent es el esquema de eventos del Brain
type BrainEvent struct {
	Type      string                 `json:"type"`
	ProfileID string                 `json:"profile_id"`
	Timestamp int64                  `json:"timestamp"`
	Data      map[string]interface{} `json:"data,omitempty"`
	Error     string                 `json:"error,omitempty"`
}

// ProfileLifecycleInput son los parámetros del workflow principal
type ProfileLifecycleInput struct {
	ProfileID   string `json:"profile_id"`
	Environment string `json:"environment"`
}

// ProfileStatus es el estado retornado por queries
type ProfileStatus struct {
	ProfileID     string       `json:"profile_id"`
	State         ProfileState `json:"state"`
	LastUpdate    time.Time    `json:"last_update"`
	ErrorMessage  string       `json:"error_message,omitempty"`
	SentinelRunning bool       `json:"sentinel_running"`
}

// SentinelLaunchInput son los parámetros para lanzar Sentinel
type SentinelLaunchInput struct {
	ProfileID   string `json:"profile_id"`
	CommandID   string `json:"command_id"`
	Environment string `json:"environment"`
}

// SentinelLaunchResult es el resultado de lanzar Sentinel
type SentinelLaunchResult struct {
	Success   bool   `json:"success"`
	ProcessID int    `json:"process_id,omitempty"`
	Error     string `json:"error,omitempty"`
}

// SentinelStopInput son los parámetros para detener Sentinel
type SentinelStopInput struct {
	ProfileID string `json:"profile_id"`
	CommandID string `json:"command_id"`
	ProcessID int    `json:"process_id"`
}

// SentinelStopResult es el resultado de detener Sentinel
type SentinelStopResult struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// SystemCondition representa una condición del sistema a esperar
type SystemCondition struct {
	Type    string        `json:"type"`
	Timeout time.Duration `json:"timeout"`
}

// RecoveryFlowInput son los parámetros del workflow de recovery
type RecoveryFlowInput struct {
	ProfileID    string `json:"profile_id"`
	FailureType  string `json:"failure_type"`
	ErrorMessage string `json:"error_message"`
}

// RecoveryFlowResult es el resultado del workflow de recovery
type RecoveryFlowResult struct {
	Success      bool   `json:"success"`
	NewState     ProfileState `json:"new_state"`
	ErrorMessage string `json:"error_message,omitempty"`
}