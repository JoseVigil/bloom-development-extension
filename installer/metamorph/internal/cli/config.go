// ── Patch for internal/cli/config.go ─────────────────────────────────────────
//
// Add "IONPUMP" to CategoryOrder and CategoryDescs in DefaultMetamorphConfig().
// The existing config.go already defines HelpConfig and DefaultMetamorphConfig;
// only the two marked lines need to be added.

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
			"GOVERNANCE",
			"IONPUMP", // ← ADD: ion site deployment and reconciliation
		},
		CategoryDescs: map[string]string{
			"SYSTEM":         "System information and version details",
			"INSPECTION":     "Binary and state inspection tools",
			"RECONCILIATION": "Manifest-driven state reconciliation",
			"ROLLBACK":       "Snapshot restoration and rollback",
			"MAINTENANCE":    "System cleanup and maintenance",
			"GOVERNANCE":     "Organization initialization and authority",
			"IONPUMP":        "Ion site deployment and reconciliation", // ← ADD
		},
	}
}
