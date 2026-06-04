// File: internal/supervisor/onboarding_harness.go
//
// Onboarding-mode Harness bootstrap.
//
// Harness is the debug/observability layer inside the governance subsystem.
// In a fully onboarded project it is registered after .ownership.json is
// validated.  During onboarding that file does not yet exist, which caused
// bootGovernance() to return nil early and Harness to never start.
//
// This file extracts Harness bootstrap into a dedicated, lifecycle-aware
// function (bootHarness) that:
//   - Is ALWAYS called by the boot sequence, regardless of onboarding state.
//   - Resolves the correct .ownership.json path depending on lifecycle phase:
//       PRE-ONBOARDING  → no file required; Harness runs in stub mode.
//       POST-ONBOARDING → .bloom/.nucleus-{org}/.ownership.json inside the
//                         nucleus repo (getOwnershipPath returns this path).
//   - Is non-fatal: a Harness failure produces a WARN, never a boot abort.
//
// Design invariant: this file must NOT import the governance package directly.
// Harness in stub mode is a pure supervisor concern — it registers the debug
// streams and telemetry endpoints without requiring a governance context.
package supervisor

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// HarnessMode describes how Harness was started.
type HarnessMode string

const (
	HarnessModeStub       HarnessMode = "STUB"        // onboarding — no ownership file
	HarnessModeGovernance HarnessMode = "GOVERNANCE"  // post-onboarding — full governance
	HarnessModeSimulation HarnessMode = "SIMULATION"  // --simulation flag
)

// HarnessResult is returned by bootHarness so callers can log/telemetry the
// outcome without inspecting internal state.
type HarnessResult struct {
	Mode        HarnessMode `json:"mode"`
	Healthy     bool        `json:"healthy"`
	OwnershipOK bool        `json:"ownership_ok"`
	Org         string      `json:"org,omitempty"`
	Error       string      `json:"error,omitempty"`
}

// getOwnershipPath returns the canonical path of .ownership.json for the
// current lifecycle phase.
//
// PRE-ONBOARDING (onboardingCompleted == false):
//   Returns "" — no file is expected.
//
// POST-ONBOARDING:
//   The file lives inside the nucleus repository at:
//     <nucleusRepoRoot>/.bloom/.nucleus-{org}/.ownership.json
//   where <nucleusRepoRoot> is the value of installation.origin_path in
//   nucleus.json (same value returned by getBloomDir() for the dev extension
//   repo) plus the relative path to the nucleus sub-repo.
//
//   In practice, origin_path already points to bloom-development-extension
//   (the monorepo root).  The nucleus repo is the root itself (or a
//   sub-directory — adapt nucleusSubPath below if your layout differs).
//
// SIMULATION:
//   Returns the simulation fixture path (unchanged from original logic).
func getOwnershipPath(simulation bool, onboardingCompleted bool) string {
	if simulation {
		return filepath.Join("installer", "nucleus", "scripts",
			"simulation_env", ".bloom", ".ownership.json")
	}
	if !onboardingCompleted {
		return "" // stub mode — no file required
	}

	// POST-ONBOARDING: resolve from nucleus.json → organization field.
	// .ownership.json lives at:
	//   <nucleusRepoRoot>/.bloom/.nucleus-{org}/.ownership.json
	org := readOrganizationFromNucleusJSON()
	if org == "" {
		// Fallback: try the legacy path (getBloomDir()/.ownership.json).
		// This keeps backward compatibility while the migration to the new
		// path is rolled out.
		bloomDir := getBloomDir()
		if bloomDir != "" {
			return filepath.Join(bloomDir, ".ownership.json")
		}
		return ""
	}

	nucleusRepoRoot := getNucleusRepoRoot()
	if nucleusRepoRoot == "" {
		return ""
	}
	return filepath.Join(nucleusRepoRoot, ".bloom",
		".nucleus-"+org, ".ownership.json")
}

// getNucleusRepoRoot returns the root of the nucleus repository.
// For the current layout (nucleus lives inside bloom-development-extension)
// this is the same as getBloomDir().  Override this function or add an
// env var (BLOOM_NUCLEUS_REPO) if the repos diverge.
func getNucleusRepoRoot() string {
	if v := os.Getenv("BLOOM_NUCLEUS_REPO"); v != "" {
		return v
	}
	// Default: nucleus repo root == monorepo root (origin_path in nucleus.json)
	return getBloomDir()
}

// readOrganizationFromNucleusJSON reads the organization slug from nucleus.json.
// Returns "" if unreadable or absent (pre-onboarding is the safe default).
func readOrganizationFromNucleusJSON() string {
	nucleusJSON := filepath.Join(getBloomNucleusBase(), "config", "nucleus.json")
	data, err := os.ReadFile(nucleusJSON)
	if err != nil {
		return ""
	}
	var cfg struct {
		Onboarding struct {
			Organization string `json:"organization"` // populated after GitHub auth
		} `json:"onboarding"`
	}
	if json.Unmarshal(data, &cfg) != nil {
		return ""
	}
	return cfg.Onboarding.Organization
}

// isOnboardingCompleted reads nucleus.json and returns onboarding.completed.
// Mirrors loadOnboardingCompleted in health.go but is local to this package.
func isOnboardingCompleted() bool {
	return loadOnboardingCompleted(getBloomNucleusBase())
}

// bootHarness starts the Harness debug/observability subsystem.
//
// It is always called during the boot sequence, before or after governance,
// and operates in two modes:
//
//   STUB mode (pre-onboarding):
//     Harness registers its telemetry streams without a governance context.
//     No .ownership.json is required.  All debug endpoints are available.
//
//   GOVERNANCE mode (post-onboarding):
//     Harness validates .ownership.json at the canonical path and registers
//     with the full governance context.
//
// The function is intentionally non-fatal: any error is logged as WARN and
// returned in HarnessResult.Error, but the boot sequence continues.
func (s *Supervisor) bootHarness(ctx context.Context, simulation bool) *HarnessResult {
	onboardingDone := isOnboardingCompleted()

	result := &HarnessResult{
		Mode:    resolveHarnessMode(simulation, onboardingDone),
		Healthy: false,
	}

	switch result.Mode {
	case HarnessModeSimulation:
		return s.bootHarnessSimulation(ctx, result)
	case HarnessModeStub:
		return s.bootHarnessStub(ctx, result)
	case HarnessModeGovernance:
		return s.bootHarnessGovernance(ctx, result)
	}

	result.Error = fmt.Sprintf("unknown harness mode: %s", result.Mode)
	return result
}

func resolveHarnessMode(simulation, onboardingDone bool) HarnessMode {
	if simulation {
		return HarnessModeSimulation
	}
	if !onboardingDone {
		return HarnessModeStub
	}
	return HarnessModeGovernance
}

// bootHarnessStub runs Harness in onboarding (stub) mode.
// No .ownership.json required.  Registers debug telemetry streams.
func (s *Supervisor) bootHarnessStub(ctx context.Context, result *HarnessResult) *HarnessResult {
	s.slog("INFO", "⚙️  Harness: starting in STUB mode (onboarding — no .ownership.json required)")

	// Register the harness telemetry stream so it appears in nucleus health
	// and the Harness debug panel is usable during onboarding.
	s.registerHarnessTelemetry("STUB")

	result.Healthy = true
	result.OwnershipOK = false // expected in stub mode
	s.slog("SUCCESS", "✓ Harness running in STUB mode — debug endpoints available")
	return result
}

// bootHarnessSimulation runs Harness against the simulation fixture.
func (s *Supervisor) bootHarnessSimulation(ctx context.Context, result *HarnessResult) *HarnessResult {
	ownershipPath := getOwnershipPath(true, true)
	s.slog("INFO", "⚙️  Harness: starting in SIMULATION mode (fixture: %s)", ownershipPath)

	if _, err := os.Stat(ownershipPath); err != nil {
		result.Error = fmt.Sprintf("simulation .ownership.json not found at %s: %v", ownershipPath, err)
		s.slog("WARN", "Harness SIMULATION: %s", result.Error)
		// Non-fatal: still register telemetry
	} else {
		result.OwnershipOK = true
	}

	s.registerHarnessTelemetry("SIMULATION")
	result.Healthy = true
	s.slog("SUCCESS", "✓ Harness running in SIMULATION mode")
	return result
}

// bootHarnessGovernance runs Harness with full post-onboarding governance.
// Validates .ownership.json at the canonical path:
//   <nucleusRepo>/.bloom/.nucleus-{org}/.ownership.json
func (s *Supervisor) bootHarnessGovernance(ctx context.Context, result *HarnessResult) *HarnessResult {
	org := readOrganizationFromNucleusJSON()
	result.Org = org

	ownershipPath := getOwnershipPath(false, true)
	if ownershipPath == "" {
		// Can happen if org is empty and bloom_dir unresolvable — degrade gracefully.
		result.Error = "cannot resolve .ownership.json path (org slug absent from nucleus.json and BLOOM_DIR unset)"
		s.slog("WARN", "Harness GOVERNANCE: %s", result.Error)
		s.registerHarnessTelemetry("DEGRADED")
		result.Healthy = true // non-fatal; Harness still registers
		return result
	}

	s.slog("INFO", "⚙️  Harness: starting in GOVERNANCE mode (org=%s, path=%s)", org, ownershipPath)

	if _, err := os.Stat(ownershipPath); err != nil {
		if os.IsNotExist(err) ||
			strings.Contains(err.Error(), "syntax is incorrect") ||
			strings.Contains(err.Error(), "invalid") {
			// Onboarding completed but file missing — migration in progress.
			result.Error = fmt.Sprintf(".ownership.json not found at %s (migration pending?)", ownershipPath)
			s.slog("WARN", "Harness GOVERNANCE: %s — running in degraded mode", result.Error)
			s.registerHarnessTelemetry("DEGRADED")
			result.Healthy = true // non-fatal
			return result
		}
		// Real filesystem error (permissions, disk, etc.)
		result.Error = fmt.Sprintf("ownership.json access error: %v", err)
		s.slog("ERROR", "Harness GOVERNANCE: %s", result.Error)
		result.Healthy = false
		return result
	}

	// Validate required fields
	if err := validateOwnershipFile(ownershipPath); err != nil {
		result.Error = fmt.Sprintf("ownership validation failed: %v", err)
		s.slog("WARN", "Harness GOVERNANCE: %s", result.Error)
		s.registerHarnessTelemetry("DEGRADED")
		result.Healthy = true // schema errors are non-fatal
		return result
	}

	result.OwnershipOK = true
	s.registerHarnessTelemetry("GOVERNANCE")
	result.Healthy = true
	s.slog("SUCCESS", "✓ Harness running in GOVERNANCE mode (org=%s)", org)
	return result
}

// validateOwnershipFile reads and validates the required fields in .ownership.json.
// Required: "owner", "created_at"
func validateOwnershipFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read failed: %w", err)
	}
	var ownership map[string]interface{}
	if err := json.Unmarshal(data, &ownership); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	for _, field := range []string{"owner", "created_at"} {
		if _, exists := ownership[field]; !exists {
			return fmt.Errorf("missing required field: %s", field)
		}
	}
	return nil
}

// registerHarnessTelemetry registers the Harness debug stream in telemetry.json.
// The stream ID is "harness" and the label encodes the current mode so the
// Harness panel can display the right badge (STUB / SIMULATION / GOVERNANCE).
func (s *Supervisor) registerHarnessTelemetry(mode string) {
	logsBase := getBloomNucleusBase()
	logPath := filepath.Join(logsBase, "logs", "nucleus", "harness", "harness.log")
	// Ensure log directory exists (best-effort — harness is non-fatal)
	_ = os.MkdirAll(filepath.Dir(logPath), 0755)

	s.registerStream(
		"harness",
		fmt.Sprintf("🛠  HARNESS [%s]", mode),
		logPath,
		fmt.Sprintf("Harness debug/observability stream — mode: %s", mode),
		"nucleus",
		1,
		[]string{"nucleus", "harness", "debug"},
	)
}
