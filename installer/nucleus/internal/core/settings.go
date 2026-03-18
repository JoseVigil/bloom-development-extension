// File: internal/core/settings.go
// Reads and exposes %LOCALAPPDATA%\BloomNucleus\config\settings.json.
//
// Design principles:
//   - All fields have safe hardcoded defaults — missing or malformed settings.json
//     never causes a startup failure.
//   - Settings is immutable after Load() — no hot-reload by design.
//   - Consumers access settings via core.Paths, not as a global singleton.
package core

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// ============================================================================
// SETTINGS SCHEMA
// ============================================================================

// Settings holds all values read from config/settings.json.
// Every field defaults to a safe value — zero values are never used directly.
type Settings struct {
	Health   HealthSettings   `json:"health"`
	Memory   MemorySettings   `json:"memory"`
	Watchdog WatchdogSettings `json:"watchdog"`
	Timeouts TimeoutSettings  `json:"timeouts"`
	Logging  LoggingSettings  `json:"logging"`
}

// HealthSettings controls nucleus health behavior and the 60s schedule.
type HealthSettings struct {
	// AutoFix makes every health check run with --fix automatically.
	// Recommended on machines with limited RAM (≤8GB) where Temporal
	// crashes are frequent and manual intervention is impractical.
	AutoFix bool `json:"auto_fix"`

	// IntervalSeconds is the schedule period for the automatic health check.
	// Minimum enforced: 30s. Default: 60s.
	IntervalSeconds int `json:"interval_seconds"`
}

// MemorySettings defines the RAM thresholds used by health checks.
// These values must be consistent across Go (health_resources_*.go) and
// Python (00_health_check.py) — settings.json is the single source of truth.
type MemorySettings struct {
	// DegradedMB: free RAM below this triggers state DEGRADED.
	// Default: 2000 MB. Lower to 1500 on 8GB machines.
	DegradedMB int `json:"degraded_mb"`

	// PressureMB: free RAM below this triggers state PRESSURE — crash imminent.
	// Default: 1000 MB.
	PressureMB int `json:"pressure_mb"`
}

// WatchdogSettings controls the worker restart policy in watchWorker().
type WatchdogSettings struct {
	// BackoffInitialSeconds is the wait before the first restart attempt.
	// Default: 5s.
	BackoffInitialSeconds int `json:"backoff_initial_seconds"`

	// BackoffMaxSeconds is the ceiling for exponential backoff.
	// Default: 60s. Increase to 180 if the worker crashes repeatedly.
	BackoffMaxSeconds int `json:"backoff_max_seconds"`

	// StableThresholdSeconds: if the worker stayed up longer than this
	// before dying, the backoff resets to BackoffInitialSeconds.
	// Default: 30s.
	StableThresholdSeconds int `json:"stable_threshold_seconds"`
}

// TimeoutSettings controls boot and health operation timeouts.
type TimeoutSettings struct {
	// TemporalBootSeconds: how long to wait for Temporal to be ready on boot.
	// Default: 60s.
	TemporalBootSeconds int `json:"temporal_boot_seconds"`

	// BrainBootSeconds: how long to wait for Brain TCP server on boot.
	// Default: 15s.
	BrainBootSeconds int `json:"brain_boot_seconds"`

	// HealthCheckSeconds: timeout for nucleus health (no --fix).
	// Default: 15s.
	HealthCheckSeconds int `json:"health_check_seconds"`

	// HealthFixSeconds: timeout for nucleus health --fix.
	// Must be > temporal ensure worst-case (~30s). Default: 45s.
	HealthFixSeconds int `json:"health_fix_seconds"`
}

// LoggingSettings controls log file rotation behavior.
type LoggingSettings struct {
	// Rotation: "daily" = one file per day (default).
	//           "single" = append forever (legacy behavior, pre BUG-10 fix).
	Rotation string `json:"rotation"`
}

// ============================================================================
// DEFAULTS
// ============================================================================

// defaultSettings returns safe values used when settings.json is absent,
// partially written, or contains zero values for a field.
func defaultSettings() Settings {
	return Settings{
		Health: HealthSettings{
			AutoFix:         false,
			IntervalSeconds: 60,
		},
		Memory: MemorySettings{
			DegradedMB: 2000,
			PressureMB: 1000,
		},
		Watchdog: WatchdogSettings{
			BackoffInitialSeconds:  5,
			BackoffMaxSeconds:      60,
			StableThresholdSeconds: 30,
		},
		Timeouts: TimeoutSettings{
			TemporalBootSeconds: 60,
			BrainBootSeconds:    15,
			HealthCheckSeconds:  15,
			HealthFixSeconds:    45,
		},
		Logging: LoggingSettings{
			Rotation: "daily",
		},
	}
}

// ============================================================================
// LOADER
// ============================================================================

// LoadSettings reads config/settings.json from appDataDir and merges it over
// the safe defaults. Missing fields keep their default values.
// A missing or unreadable settings.json is not an error — defaults are returned.
func LoadSettings(appDataDir string) Settings {
	s := defaultSettings()

	path := filepath.Join(appDataDir, "config", "settings.json")
	data, err := os.ReadFile(path)
	if err != nil {
		// File absent or unreadable — defaults are correct, not an error.
		return s
	}

	// Unmarshal into the defaults struct so only present fields are overwritten.
	// Zero values in JSON (e.g. interval_seconds: 0) are ignored via applyGuards.
	if err := json.Unmarshal(data, &s); err != nil {
		// Malformed JSON — return defaults, never crash.
		return defaultSettings()
	}

	applyGuards(&s)
	return s
}

// applyGuards enforces minimum safe values after unmarshalling.
// Prevents accidental zero values from JSON from breaking the system.
func applyGuards(s *Settings) {
	if s.Health.IntervalSeconds < 30 {
		s.Health.IntervalSeconds = 30
	}
	if s.Memory.DegradedMB <= 0 {
		s.Memory.DegradedMB = 2000
	}
	if s.Memory.PressureMB <= 0 {
		s.Memory.PressureMB = 1000
	}
	if s.Memory.PressureMB >= s.Memory.DegradedMB {
		// Incoherent thresholds — reset both to defaults.
		s.Memory.DegradedMB = 2000
		s.Memory.PressureMB = 1000
	}
	if s.Watchdog.BackoffInitialSeconds <= 0 {
		s.Watchdog.BackoffInitialSeconds = 5
	}
	if s.Watchdog.BackoffMaxSeconds < s.Watchdog.BackoffInitialSeconds {
		s.Watchdog.BackoffMaxSeconds = 60
	}
	if s.Watchdog.StableThresholdSeconds <= 0 {
		s.Watchdog.StableThresholdSeconds = 30
	}
	if s.Timeouts.TemporalBootSeconds <= 0 {
		s.Timeouts.TemporalBootSeconds = 60
	}
	if s.Timeouts.BrainBootSeconds <= 0 {
		s.Timeouts.BrainBootSeconds = 15
	}
	if s.Timeouts.HealthCheckSeconds <= 0 {
		s.Timeouts.HealthCheckSeconds = 15
	}
	if s.Timeouts.HealthFixSeconds <= 0 {
		s.Timeouts.HealthFixSeconds = 45
	}
	if s.Logging.Rotation != "daily" && s.Logging.Rotation != "single" {
		s.Logging.Rotation = "daily"
	}
}