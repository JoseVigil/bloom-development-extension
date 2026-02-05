package signals

const (
	// SignalSystemCondition es el nombre de la señal para condiciones del sistema
	SignalSystemCondition = "system-condition"
	
	// SignalShutdown es el nombre de la señal para apagado
	SignalShutdown = "shutdown"
)

// System condition types
const (
	ConditionResourcesAvailable = "RESOURCES_AVAILABLE"
	ConditionNetworkReady       = "NETWORK_READY"
	ConditionDependenciesReady  = "DEPENDENCIES_READY"
)