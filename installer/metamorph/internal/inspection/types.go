package inspection

// ─────────────────────────────────────────────────────────────────────────────
// Binary inspection types
// ─────────────────────────────────────────────────────────────────────────────

// ManagedBinary represents a BTIPS component managed (updatable) by Metamorph.
type ManagedBinary struct {
	Name                 string         `json:"name"`
	Path                 string         `json:"path"`
	Version              string         `json:"version"`
	BuildNumber          int            `json:"build_number"`
	Hash                 string         `json:"hash"`
	SizeBytes            int64          `json:"size_bytes"`
	LastModified         string         `json:"last_modified"`
	Status               string         `json:"status"` // "healthy" | "missing" | "corrupted" | "unknown"
	UpdatableByMetamorph bool           `json:"updatable_by_metamorph"` // always true
	Capabilities         []string       `json:"capabilities,omitempty"`
	CortexMeta           *CortexMeta    `json:"cortex_meta,omitempty"`
	BootstrapMeta        *BootstrapMeta `json:"bootstrap_meta,omitempty"`
	VSIXMeta             *VSIXMeta      `json:"vsix_meta,omitempty"`
	SensorInfo           *SensorInfo    `json:"sensor_info,omitempty"`
}

// SensorInfo holds extended metadata returned by bloom-sensor --json info.
type SensorInfo struct {
	Channel      string            `json:"channel,omitempty"`
	Capabilities []string          `json:"capabilities,omitempty"`
	Requires     map[string]string `json:"requires,omitempty"`
}

// ExternalBinary represents a third-party binary auditable but not managed by Metamorph.
type ExternalBinary struct {
	Name                 string `json:"name"`
	Path                 string `json:"path"`
	Version              string `json:"version"`
	Hash                 string `json:"hash"`
	SizeBytes            int64  `json:"size_bytes"`
	LastModified         string `json:"last_modified"`
	Status               string `json:"status"` // "healthy" | "missing" | "unknown"
	UpdatableByMetamorph bool   `json:"updatable_by_metamorph"` // always false
	Source               string `json:"source"`
	UpdateMethod         string `json:"update_method"`
	LatestVersion        string `json:"latest_version,omitempty"`
	UpdateAvailable      bool   `json:"update_available"`
}

// InspectionSummary aggregates counts and totals across the full inspection run.
type InspectionSummary struct {
	TotalBinaries     int   `json:"total_binaries"`
	TotalSizeBytes    int64 `json:"total_size_bytes"`
	ManagedCount      int   `json:"managed_count"`
	ManagedSizeBytes  int64 `json:"managed_size_bytes"`
	ExternalCount     int   `json:"external_count"`
	ExternalSizeBytes int64 `json:"external_size_bytes"`
	HealthyCount      int   `json:"healthy_count"`
	UpdatesAvailable  int   `json:"updates_available"`
	MissingCount      int   `json:"missing_count"`
	CorruptedCount    int   `json:"corrupted_count"`
}

// InspectionResult is the top-level payload returned by the inspect command.
type InspectionResult struct {
	ManagedBinaries  []ManagedBinary  `json:"managed_binaries"`
	ExternalBinaries []ExternalBinary `json:"external_binaries,omitempty"`
	TotalSizeBytes   int64            `json:"total_size_bytes"`
	Summary          InspectionSummary `json:"summary"`
	Timestamp        string           `json:"timestamp"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Ion recipe inspection types  (schema v2.0 — ION SDK Developer Guide v1.0)
// ─────────────────────────────────────────────────────────────────────────────

// IonAction represents a single entry in domain.manifest.json "actions" map.
type IonAction struct {
	File   string `json:"file"`
	Public bool   `json:"public"`
}

// IonDomainManifest is the parsed representation of domain.manifest.json
// at the root of every .ion ZIP (schema_version "2.0").
type IonDomainManifest struct {
	SchemaVersion string               `json:"schema_version"` // "2.0"
	Domain        string               `json:"domain"`
	Version       string               `json:"version"`
	Description   string               `json:"description"`
	Author        IonAuthor            `json:"author"`
	Actions       map[string]IonAction `json:"actions"`
	Pages         map[string]string    `json:"pages"`
	Shared        map[string]string    `json:"shared"`
	EntryActions  []string             `json:"entry_actions"`
	Capabilities  []string             `json:"capabilities"`
	RequiresCortexVersion string       `json:"requires_cortex_version"`
}

// IonAuthor holds package authorship metadata.
type IonAuthor struct {
	Name    string `json:"name"`
	Contact string `json:"contact"`
}

// IonRecipeInfo is what Metamorph exposes after inspecting a single installed site.
type IonRecipeInfo struct {
	Site          string   `json:"site"`
	Version       string   `json:"version"`
	Description   string   `json:"description"`
	SchemaVersion string   `json:"schema_version"`
	EntryActions  []string `json:"entry_actions"`
	PublicActions []string `json:"public_actions"`
	PageCount     int      `json:"page_count"`
	SharedCount   int      `json:"shared_count"`
	Capabilities  []string `json:"capabilities"`
	RequiresCortexVersion string `json:"requires_cortex_version"`
	SizeBytes     int64    `json:"size_bytes"`
	Status        string   `json:"status"` // "healthy" | "missing_manifest" | "invalid_manifest" | "missing_entrypoint"
}

// IonRecipesResult is the payload returned by --ion-recipes inspection.
type IonRecipesResult struct {
	BasePath   string          `json:"base_path"`
	Recipes    []IonRecipeInfo `json:"recipes"`   // never null — empty slice if none installed
	TotalSites int             `json:"total_sites"`
	TotalFlows int             `json:"total_flows"`
	Timestamp  string          `json:"timestamp"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Ion reconciliation types
// ─────────────────────────────────────────────────────────────────────────────

// IonRecipeFile describes a single file inside the ZIP with its expected SHA-256.
// Paths are relative to the ZIP root (e.g. "actions/auth_pat.ion").
type IonRecipeFile struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

// IonRecipeUpdate is one entry in the reconciliation manifest received from Nucleus.
// It describes a single site that needs to be evaluated and potentially swapped.
type IonRecipeUpdate struct {
	Site        string          `json:"site"`         // "github.com"
	Version     string          `json:"version"`      // "1.1.0"
	DownloadURL string          `json:"download_url"` // Bartcave endpoint
	SHA256      string          `json:"sha256"`       // hash of the entire ZIP
	Files       []IonRecipeFile `json:"files"`        // per-file hashes for staging verification
}

// ReconcileResult reports the outcome of one site's reconciliation attempt.
type ReconcileResult struct {
	Site            string `json:"site"`
	PreviousVersion string `json:"previous_version"`
	NewVersion      string `json:"new_version"`
	Action          string `json:"action"`     // "skipped" | "swapped" | "rolled_back" | "failed"
	Phase           string `json:"phase"`      // phase where failure occurred, empty on success
	DurationMs      int64  `json:"duration_ms"`
	SwappedAt       string `json:"swapped_at,omitempty"`
	Error           string `json:"error,omitempty"`
}

// ReconcileAllResult is the top-level output of the reconcile-ion-recipes command.
type ReconcileAllResult struct {
	Results   []ReconcileResult    `json:"reconcile_results"`
	Summary   ReconcileSummary     `json:"summary"`
	Timestamp string               `json:"timestamp"`
}

// ReconcileSummary aggregates counts across all processed sites.
type ReconcileSummary struct {
	TotalSites  int `json:"total_sites"`
	Skipped     int `json:"skipped"`
	Swapped     int `json:"swapped"`
	RolledBack  int `json:"rolled_back"`
	Failed      int `json:"failed"`
}

// ─────────────────────────────────────────────────────────────────────────────
// versions.json types  (_meta/versions.json inside ionsites/)
// ─────────────────────────────────────────────────────────────────────────────

// VersionEntry tracks the installed state of a single site.
type VersionEntry struct {
	Version    string `json:"version"`
	InstalledAt string `json:"installed_at"`
	SHA256     string `json:"sha256"`
	SwapCount  int    `json:"swap_count"`
	Status     string `json:"status"` // "active" | "pending" | "failed"
}

// VersionsFile is the full contents of _meta/versions.json.
type VersionsFile struct {
	SchemaVersion string                  `json:"schema_version"` // "1.0"
	Sites         map[string]VersionEntry `json:"sites"`
	LastUpdated   string                  `json:"last_updated"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal swap state — used only within atomicSwap for crash recovery
// ─────────────────────────────────────────────────────────────────────────────

type swapState int

const (
	swapStateNone      swapState = iota // nothing done yet
	swapStateFirstDone                  // live → backup rename succeeded
	swapStateBothDone                   // staging → live rename succeeded
)

// ─────────────────────────────────────────────────────────────────────────────
// IonPump client interface
// ─────────────────────────────────────────────────────────────────────────────

// IonPumpClient abstracts the Brain/IonPump quiesce+reload protocol.
// The production implementation uses HTTP; the noop is used in tests.
type IonPumpClient interface {
	QuiesceSite(site string, timeoutMs int) (QuiesceResult, error)
	ReloadSite(site string, version string) (ReloadResult, error)
}

// QuiesceResult is the response from Brain when asked to quiesce a site.
type QuiesceResult struct {
	Status      string `json:"status"`       // "quiesced" | "timeout"
	ActiveFlows int    `json:"active_flows"`
}

// ReloadResult is the response from Brain after a swap, asking it to reload.
type ReloadResult struct {
	Status  string `json:"status"` // "reloaded" | "error"
	Version string `json:"version"`
	Error   string `json:"error,omitempty"`
}