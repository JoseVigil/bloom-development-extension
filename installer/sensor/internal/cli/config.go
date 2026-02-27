// internal/cli/config.go

package cli

// HelpConfig define la configuración visual del sistema de ayuda.
// Estructura homóloga a Nucleus para mantener paridad en el ecosistema Bloom.
type HelpConfig struct {
	AppName       string
	AppSubtitle   string
	Width         int
	CategoryOrder []string
	CategoryDescs map[string]string
}

// DefaultSensorConfig retorna la configuración por defecto para Sensor.
func DefaultSensorConfig() HelpConfig {
	return HelpConfig{
		AppName:     "SENSOR",
		AppSubtitle: "Human Presence Runtime",
		Width:       120,
		CategoryOrder: []string{
			"SYSTEM",
			"RUNTIME",
			"LIFECYCLE",
			"TELEMETRY",
		},
		CategoryDescs: map[string]string{
			"SYSTEM":    "Version, identity and Metamorph contract",
			"RUNTIME":   "Start and inspect the human presence detection loop",
			"LIFECYCLE": "Manage automatic startup registration (HKCU)",
			"TELEMETRY": "Export and inspect collected presence snapshots",
		},
	}
}
