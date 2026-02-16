package signals

// ============================================
// SEÑALES DE CONTROL DE PERFIL
// ============================================

// Señales que controlan el ciclo de vida del perfil
const (
	SignalLaunch     = "launch"      // Lanzar Sentinel para el perfil
	SignalShutdown   = "shutdown"    // Detener Sentinel y finalizar workflow
	SignalHeartbeat  = "heartbeat"   // Confirmación de que Sentinel sigue vivo
)

// ============================================
// SEÑALES DE CONDICIONES DEL SISTEMA
// ============================================

// Señal para notificar condiciones del sistema
const (
	SignalSystemCondition = "system-condition"
)

// Tipos de condiciones del sistema
const (
	ConditionDependenciesReady = "DEPENDENCIES_READY"
	ConditionOllamaReady       = "OLLAMA_READY"
	ConditionVaultUnlocked     = "VAULT_UNLOCKED"
)