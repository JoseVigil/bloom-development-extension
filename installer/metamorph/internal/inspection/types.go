package inspection

import "time"

// ManagedBinary represents a BTIPS component managed by Metamorph
type ManagedBinary struct {
	Name                 string        `json:"name"`
	Path                 string        `json:"path"`
	Version              string        `json:"version"`
	BuildNumber          int           `json:"build_number,omitempty"`
	Hash                 string        `json:"hash"`
	SizeBytes            int64         `json:"size_bytes"`
	LastModified         string        `json:"last_modified"`
	Status               string        `json:"status"` // "healthy", "missing", "corrupted", "unknown"
	UpdatableByMetamorph bool          `json:"updatable_by_metamorph"`
	CortexMeta           *CortexMeta   `json:"cortex_meta,omitempty"`   // populated only for .blx
	LauncherInfo         *LauncherInfo `json:"launcher_info,omitempty"` // populated only for bloom-launcher
}

// LauncherInfo contains the extended runtime metadata reported by bloom-launcher's
// `info --json` command. Fields mirror the launcher's JSON output exactly.
type LauncherInfo struct {
	FullVersion string             `json:"full_version"`
	BuildDate   string             `json:"build_date"`
	Channel     string             `json:"channel"`
	Daemon      LauncherDaemon     `json:"daemon"`
	Startup     LauncherStartup    `json:"startup"`
	Runtime     LauncherRuntime    `json:"runtime"`
	Pipe        LauncherPipe       `json:"pipe"`
}

// LauncherDaemon reflects the daemon sub-object from launcher's info output.
type LauncherDaemon struct {
	Running bool `json:"running"`
}

// LauncherStartup reflects the startup sub-object from launcher's info output.
type LauncherStartup struct {
	Registered bool `json:"registered"`
}

// LauncherRuntime reflects the runtime sub-object from launcher's info output.
type LauncherRuntime struct {
	Arch string `json:"arch"`
	Exe  string `json:"exe"`
	Go   string `json:"go"`
	OS   string `json:"os"`
}

// LauncherPipe reflects the pipe sub-object from launcher's info output.
type LauncherPipe struct {
	Name string `json:"name"`
}

// ExternalBinary represents a third-party binary audited but not updated by Metamorph
type ExternalBinary struct {
	Name                 string `json:"name"`
	Path                 string `json:"path"`
	Version              string `json:"version"`
	Hash                 string `json:"hash"`
	SizeBytes            int64  `json:"size_bytes"`
	LastModified         string `json:"last_modified"`
	Status               string `json:"status"`
	UpdatableByMetamorph bool   `json:"updatable_by_metamorph"` // always false
	Source               string `json:"source"`
	UpdateMethod         string `json:"update_method"`
	LatestVersion        string `json:"latest_version,omitempty"`
	UpdateAvailable      bool   `json:"update_available"`
}

// InspectionResult is the complete result of an inspection
type InspectionResult struct {
	ManagedBinaries  []ManagedBinary   `json:"managed_binaries"`
	ExternalBinaries []ExternalBinary  `json:"external_binaries,omitempty"`
	Summary          InspectionSummary `json:"summary"`
	Timestamp        string            `json:"timestamp"`
}

// InspectionSummary provides aggregate statistics
type InspectionSummary struct {
	TotalBinaries     int   `json:"total_binaries"`
	ManagedCount      int   `json:"managed_count"`
	ExternalCount     int   `json:"external_count"`
	TotalSizeBytes    int64 `json:"total_size_bytes"`
	ManagedSizeBytes  int64 `json:"managed_size_bytes"`
	ExternalSizeBytes int64 `json:"external_size_bytes"`
	HealthyCount      int   `json:"healthy_count"`
	MissingCount      int   `json:"missing_count"`
	CorruptedCount    int   `json:"corrupted_count"`
	UpdatesAvailable  int   `json:"updates_available"`
}

// inspectionCache stores cached inspection results
type inspectionCache struct {
	result    *InspectionResult
	timestamp time.Time
}