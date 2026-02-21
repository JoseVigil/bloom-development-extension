package cli

// HelpConfig define la configuración visual del sistema de ayuda
type HelpConfig struct {
	AppName       string
	AppSubtitle   string
	Width         int
	CategoryOrder []string
	CategoryDescs map[string]string
}

// DefaultNucleusConfig retorna la configuración por defecto para Nucleus
func DefaultNucleusConfig() HelpConfig {
	return HelpConfig{
		AppName:     "NUCLEUS",
		AppSubtitle: "Governance Magistrate",
		Width:       120,
		CategoryOrder: []string{
			"SYSTEM",
			"DIAGNOSTICS",
			"GOVERNANCE",
			"TEAM",
			"VAULT",
			"SYNC",
			"ANALYTICS",
			"TELEMETRY",
			"TEMPORAL_SERVER",
			"ORCHESTRATION",
		},
		CategoryDescs: map[string]string{
			"SYSTEM":          "System information and diagnostics",
			"DIAGNOSTICS":     "Health checks, log inspection and system diagnostics",
			"GOVERNANCE":      "Organization initialization and authority",
			"TEAM":            "Team and collaboration management",
			"VAULT":           "Secure key and credential management",
			"SYNC":            "State synchronization with central server",
			"ANALYTICS":       "System monitoring and telemetry",
			"TELEMETRY":       "Centralized log stream registration",
			"TEMPORAL_SERVER": "Temporal server management and diagnostics",
			"ORCHESTRATION":   "Workflow orchestration and automation",
		},
	}
}