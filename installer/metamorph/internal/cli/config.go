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
			"INSPECTION",
			"RECONCILIATION",
			"ROLLBACK",
			"MAINTENANCE",
		},
		CategoryDescs: map[string]string{
			"SYSTEM":          "System information and version details",
			"INSPECTION":      "Binary and state inspection tools",
			"RECONCILIATION":  "Manifest-driven state reconciliation",
			"ROLLBACK":        "Snapshot restoration and rollback",
			"MAINTENANCE":     "System cleanup and maintenance",
		},
	}
}
