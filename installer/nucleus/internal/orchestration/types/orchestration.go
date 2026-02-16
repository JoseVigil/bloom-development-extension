package types

import "time"

// ProfileState representa el estado del perfil en el workflow
type ProfileState string

const (
	// Estados del ciclo de vida del perfil
	StateIdle       ProfileState = "IDLE"        // Estado inicial, perfil no existe
	StateSeeded     ProfileState = "SEEDED"      // Perfil creado, workflow iniciado
	StateOnboarding ProfileState = "ONBOARDING"  // En proceso de onboarding
	StateReady      ProfileState = "READY"       // Listo para launch
	StateLaunching  ProfileState = "LAUNCHING"   // Ejecutando LaunchSentinel activity
	StateRunning    ProfileState = "RUNNING"     // Sentinel corriendo normalmente
	StateDegraded   ProfileState = "DEGRADED"    // Corriendo pero con problemas
	StateRecovering ProfileState = "RECOVERING"  // Intentando recuperarse
	StateShutdown   ProfileState = "SHUTDOWN"    // En proceso de shutdown
	StateTerminated ProfileState = "TERMINATED"  // Workflow finalizado exitosamente
	StateFailed     ProfileState = "FAILED"      // Error irrecuperable
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
	ProfileID       string       `json:"profile_id"`
	State           ProfileState `json:"state"`
	LastUpdate      time.Time    `json:"last_update"`
	ErrorMessage    string       `json:"error_message,omitempty"`
	SentinelRunning bool         `json:"sentinel_running"`
}

// SentinelLaunchInput son los parámetros para lanzar Sentinel
type SentinelLaunchInput struct {
	ProfileID      string `json:"profile_id"`
	CommandID      string `json:"command_id"`
	Environment    string `json:"environment"`
	Mode           string `json:"mode,omitempty"`            // landing, discovery, headless
	ConfigOverride string `json:"config_override,omitempty"` // JSON string con overrides
}

// SentinelLaunchResult es el resultado de lanzar Sentinel
// CRITICAL: Este tipo DEBE coincidir con el COMMAND_RESULT de Sentinel
type SentinelLaunchResult struct {
	Success         bool                   `json:"success"`
	ProfileID       string                 `json:"profile_id,omitempty"`
	LaunchID        string                 `json:"launch_id,omitempty"`        // ID único de esta sesión
	ChromePID       int                    `json:"chrome_pid,omitempty"`       // PID del proceso Chrome
	DebugPort       int                    `json:"debug_port,omitempty"`       // Puerto DevTools
	ExtensionLoaded bool                   `json:"extension_loaded,omitempty"` // Estado de extensión
	EffectiveConfig map[string]interface{} `json:"effective_config,omitempty"` // Config aplicada
	Error           string                 `json:"error,omitempty"`            // Mensaje de error si success=false
}

// SentinelStopInput son los parámetros para detener Sentinel
type SentinelStopInput struct {
	ProfileID string `json:"profile_id"`
	CommandID string `json:"command_id"`
	ProcessID int    `json:"process_id"`
}

// SentinelStopResult es el resultado de detener Sentinel
type SentinelStopResult struct {
	Success   bool   `json:"success"`
	ProfileID string `json:"profile_id,omitempty"`
	Stopped   bool   `json:"stopped,omitempty"`
	Error     string `json:"error,omitempty"`
}

// OllamaStartInput son los parámetros para iniciar Ollama
type OllamaStartInput struct {
	Model string `json:"model,omitempty"`
}

// OllamaStartResult es el resultado de iniciar Ollama
type OllamaStartResult struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// SeedProfileInput son los parámetros para crear un perfil
type SeedProfileInput struct {
	Alias    string `json:"alias"`
	IsMaster bool   `json:"is_master"`
}

// SeedProfileResult es el resultado de crear un perfil
type SeedProfileResult struct {
	Success   bool   `json:"success"`
	ProfileID string `json:"profile_id"`
	Alias     string `json:"alias"`
	IsMaster  bool   `json:"is_master"`
	Error     string `json:"error,omitempty"`
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
	Success      bool         `json:"success"`
	NewState     ProfileState `json:"new_state"`
	ErrorMessage string       `json:"error_message,omitempty"`
}

// LaunchSignal - Señal para lanzar Sentinel
type LaunchSignal struct {
	Mode           string `json:"mode"`            // landing, discovery
	ConfigOverride string `json:"config_override"` // JSON opcional
}

// HeartbeatSignal - Señal de heartbeat desde Sentinel
type HeartbeatSignal struct {
	Timestamp int64 `json:"timestamp"`
}