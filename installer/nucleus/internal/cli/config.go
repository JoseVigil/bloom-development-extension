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
		AppName:       "NUCLEUS",
		AppSubtitle:   "Core CLI for Bloom Ecosystem",
		Width:         120,
		CategoryOrder: []string{"SYSTEM", "GOVERNANCE", "IDENTITY"},
		CategoryDescs: map[string]string{
			"SYSTEM":     "System information and diagnostics",
			"GOVERNANCE": "Role, vault, sync, and analytics management",
			"IDENTITY":   "Team and collaboration management",
		},
	}
}
