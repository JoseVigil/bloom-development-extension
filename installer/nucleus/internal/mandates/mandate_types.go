package mandates

// HookContext es el contrato JSON que recibe cada hook via stdin.
// Debe mantenerse estable — es la API pública hacia los scripts Python.
type HookContext struct {
	LaunchID   string `json:"launch_id"`
	ProfileID  string `json:"profile_id"`
	LogBaseDir string `json:"log_base_dir"`
	NucleusBin string `json:"nucleus_bin"`
}

// HookResult es el contrato JSON que devuelve cada hook via stdout.
type HookResult struct {
	Hook    string `json:"hook"`
	Success bool   `json:"success"`
	Stdout  string `json:"stdout,omitempty"`
	Stderr  string `json:"stderr,omitempty"`
	Error   string `json:"error,omitempty"`
}

// HooksRunResult es la respuesta JSON del comando `nucleus hooks run`.
type HooksRunResult struct {
	Success bool         `json:"success"`
	Event   string       `json:"event"`
	Hooks   []HookResult `json:"hooks"`
	Total   int          `json:"total"`
	Failed  int          `json:"failed"`
}