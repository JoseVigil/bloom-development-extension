package queries

const (
	// QueryStatus es el nombre de la query para obtener estado básico del perfil
	QueryStatus = "status"

	// QuerySentinelDetails es el nombre de la query para obtener detalles completos de Sentinel
	QuerySentinelDetails = "sentinel-details"

	// QueryProgress es el nombre de la query para obtener progreso de operaciones
	QueryProgress = "progress"

	// QueryOnboardingState expone OnboardingState (CurrentStep, CompletedSteps, Artifacts)
	// Paso 1 github_auth
	QueryOnboardingState = "onboarding-state"
)