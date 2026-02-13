package cli

// HelpConfig define la configuración visual del sistema de ayuda
type HelpConfig struct {
	AppName       string
	AppSubtitle   string
	Width         int
	CategoryOrder []string
	CategoryDescs map[string]string
}

// DefaultMetamorphConfig retorna la configuración por defecto para Metamorph
func DefaultMetamorphConfig() HelpConfig {
	return HelpConfig{
		AppName:     "METAMORPH",
		AppSubtitle: "System State Reconciler",
		Width:       120,
		CategoryOrder: []string{
			"SYSTEM",
			"RECONCILIATION",
			"INSPECTION",
			"ROLLBACK",
			"MAINTENANCE",
		},
		CategoryDescs: map[string]string{
			"SYSTEM":          "System information and diagnostics",
			"RECONCILIATION":  "State reconciliation and updates",
			"INSPECTION":      "Binary and state inspection",
			"ROLLBACK":        "Rollback and recovery operations",
			"MAINTENANCE":     "Cleanup and maintenance tasks",
		},
	}
}
