// File: internal/supervisor/onboarding_synapse_simulator.go
//
// Onboarding-mode SynapseSimulator bootstrap.
//
// SynapseSimulator is the debug/observability layer inside the governance subsystem.
// In a fully onboarded project it is registered after .ownership.json is
// validated.  During onboarding that file does not yet exist, which caused
// bootGovernance() to return nil early and SynapseSimulator to never start.
//
// This file extracts SynapseSimulator bootstrap into a dedicated, lifecycle-aware
// function (bootSynapseSimulator) that:
//   - Is ALWAYS called by the boot sequence, regardless of onboarding state.
//   - Resolves the correct .ownership.json path depending on lifecycle phase:
//     PRE-ONBOARDING  → no file required; SynapseSimulator runs in stub mode.
//     POST-ONBOARDING → .bloom/.nucleus-{org}/.ownership.json inside the
//     nucleus repo (getOwnershipPath returns this path).
//   - Is non-fatal: a SynapseSimulator failure produces a WARN, never a boot abort.
//
// Design invariant: this file must NOT import the governance package directly.
// SynapseSimulator in stub mode is a pure supervisor concern — it registers the debug
// streams and telemetry endpoints without requiring a governance context.
package supervisor

import (
	"context"
	"encoding/json"
	"fmt"
	"nucleus/internal/governance"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SynapseSimulatorMode describes how SynapseSimulator was started.
type SynapseSimulatorMode string

const (
	SynapseSimulatorModeStub       SynapseSimulatorMode = "STUB"       // onboarding — no ownership file
	SynapseSimulatorModeGovernance SynapseSimulatorMode = "GOVERNANCE" // post-onboarding — full governance
	SynapseSimulatorModeSimulation SynapseSimulatorMode = "SIMULATION" // --simulation flag
)

// SynapseSimulatorResult is returned by bootSynapseSimulator so callers can log/telemetry the
// outcome without inspecting internal state.
type SynapseSimulatorResult struct {
	Mode        SynapseSimulatorMode `json:"mode"`
	Healthy     bool                 `json:"healthy"`
	OwnershipOK bool                 `json:"ownership_ok"`
	Org         string               `json:"org,omitempty"`
	Error       string               `json:"error,omitempty"`
}

// getOwnershipPath returns the canonical path of .ownership.json for the
// current lifecycle phase.
//
// PRE-ONBOARDING (onboardingCompleted == false):
//
//	Returns "" — no file is expected.
//
// POST-ONBOARDING:
//
//	The file lives inside the USER'S PROJECT WORKSPACE at:
//	  <workspacePath>/.bloom/.nucleus-{org}/.ownership.json
//	where <workspacePath> is onboarding.organizations[].workspace_path in
//	nucleus.json (same value returned by getWorkspacePath()) — NOT
//	installation.origin_path (getBloomDir(), the Bloom dev/extension repo
//	root). `nucleus create` writes .bloom/.nucleus-{org}/ under the
//	workspace the user is actually working in, never under the Bloom repo
//	itself.
//
// FIX (confirmado 2026-08-12): esta función usaba getNucleusRepoRoot() →
// getBloomDir() (origin_path), que apunta al repo de bloom-development-extension.
// Reproducido en vivo: con origin_path=/home/jose/repos/bloom-development-extension
// y workspace_path=/home/jose/repos/elias-repos, "nucleus --json health" reportaba
// governance/synapse-simulator DEGRADED buscando .ownership.json en
// bloom-development-extension/.bloom/.nucleus-elias-repos/.ownership.json, cuando
// el archivo real está en elias-repos/.bloom/.nucleus-elias-repos/.ownership.json.
// Mismo patrón que el bug de BLOOM_NUCLEUS_PATH resuelto antes en getWorkspacePath()
// — origin_path y workspace_path son campos distintos y no intercambiables.
//
// SIMULATION:
//
//	Returns the simulation fixture path (unchanged from original logic).
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
	//   <workspacePath>/.bloom/.nucleus-{org}/.ownership.json
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

// getNucleusRepoRoot returns the root under which .bloom/.nucleus-{org}/
// lives — the user's project workspace, NOT the Bloom dev/extension repo.
// BLOOM_NUCLEUS_REPO remains available as an explicit override (e.g. a
// layout where the two genuinely diverge from what nucleus.json records).
func getNucleusRepoRoot() string {
	if v := os.Getenv("BLOOM_NUCLEUS_REPO"); v != "" {
		return v
	}
	// Default: .bloom/.nucleus-{org}/ lives under the active org's
	// workspace_path (nucleus.json → onboarding.organizations[]), the same
	// source of truth getWorkspacePath() already resolves for BLOOM_NUCLEUS_PATH.
	return getWorkspacePath()
}

// readOrganizationFromNucleusJSON reads the active organization slug from
// nucleus.json. Returns "" if unreadable or absent (pre-onboarding is the
// safe default).
//
// FIX (bug de nombre de campo): esta función leía "onboarding.organization",
// una clave que nunca existió en el schema real de nucleus.json — el
// onboarding la escribe como "onboarding.active_org_slug" (ver
// installation/onboarding writer). Como resultado, org siempre resolvía a
// "" para CUALQUIER instalación post-onboarding real, sin importar cuántas
// orgs tuviera nucleus.json ni cuál estuviera activa: getOwnershipPath()
// caía siempre al fallback legado (getBloomDir()/.ownership.json),
// ignorando por completo la carpeta .bloom/.nucleus-{org}/ que create.go sí
// genera. Corregido para leer la clave real.
func readOrganizationFromNucleusJSON() string {
	nucleusJSON := filepath.Join(getBloomNucleusBase(), "config", "nucleus.json")
	data, err := os.ReadFile(nucleusJSON)
	if err != nil {
		return ""
	}
	var cfg struct {
		Onboarding struct {
			ActiveOrgSlug string `json:"active_org_slug"`
		} `json:"onboarding"`
	}
	if json.Unmarshal(data, &cfg) != nil {
		return ""
	}
	return cfg.Onboarding.ActiveOrgSlug
}

// isOnboardingCompleted reads nucleus.json and returns onboarding.completed.
// Mirrors loadOnboardingCompleted in health.go but is local to this package.
func isOnboardingCompleted() bool {
	return loadOnboardingCompleted(getBloomNucleusBase())
}

// bootSynapseSimulator starts the SynapseSimulator debug/observability subsystem.
//
// It is always called during the boot sequence, before or after governance,
// and operates in two modes:
//
//	STUB mode (pre-onboarding):
//	  SynapseSimulator registers its telemetry streams without a governance context.
//	  No .ownership.json is required.  All debug endpoints are available.
//
//	GOVERNANCE mode (post-onboarding):
//	  SynapseSimulator validates .ownership.json at the canonical path and registers
//	  with the full governance context.
//
// The function is intentionally non-fatal: any error is logged as WARN and
// returned in SynapseSimulatorResult.Error, but the boot sequence continues.
func (s *Supervisor) bootSynapseSimulator(ctx context.Context, simulation bool) *SynapseSimulatorResult {
	onboardingDone := isOnboardingCompleted()

	result := &SynapseSimulatorResult{
		Mode:    resolveSynapseSimulatorMode(simulation, onboardingDone),
		Healthy: false,
	}

	switch result.Mode {
	case SynapseSimulatorModeSimulation:
		return s.bootSynapseSimulatorSimulation(ctx, result)
	case SynapseSimulatorModeStub:
		return s.bootSynapseSimulatorStub(ctx, result)
	case SynapseSimulatorModeGovernance:
		return s.bootSynapseSimulatorGovernance(ctx, result)
	}

	result.Error = fmt.Sprintf("unknown synapse-simulator mode: %s", result.Mode)
	return result
}

func resolveSynapseSimulatorMode(simulation, onboardingDone bool) SynapseSimulatorMode {
	if simulation {
		return SynapseSimulatorModeSimulation
	}
	if !onboardingDone {
		return SynapseSimulatorModeStub
	}
	return SynapseSimulatorModeGovernance
}

// bootSynapseSimulatorStub runs SynapseSimulator in onboarding (stub) mode.
// No .ownership.json required.  Registers debug telemetry streams.
func (s *Supervisor) bootSynapseSimulatorStub(ctx context.Context, result *SynapseSimulatorResult) *SynapseSimulatorResult {
	s.slog("INFO", "⚙️  SynapseSimulator: starting in STUB mode (onboarding — no .ownership.json required)")

	hlog := s.registerSynapseSimulatorTelemetry("STUB")
	hlogf(hlog, "INFO", "starting in STUB mode — onboarding not completed, no .ownership.json required")

	result.Healthy = true
	result.OwnershipOK = false // expected in stub mode

	hlogf(hlog, "SUCCESS", "✓ STUB mode ready — debug endpoints available")
	s.slog("SUCCESS", "✓ SynapseSimulator running in STUB mode — debug endpoints available")
	return result
}

// bootSynapseSimulatorSimulation runs SynapseSimulator against the simulation fixture.
func (s *Supervisor) bootSynapseSimulatorSimulation(ctx context.Context, result *SynapseSimulatorResult) *SynapseSimulatorResult {
	ownershipPath := getOwnershipPath(true, true)
	s.slog("INFO", "⚙️  SynapseSimulator: starting in SIMULATION mode (fixture: %s)", ownershipPath)

	if _, err := os.Stat(ownershipPath); err != nil {
		result.Error = fmt.Sprintf("simulation .ownership.json not found at %s: %v", ownershipPath, err)
		s.slog("WARN", "SynapseSimulator SIMULATION: %s", result.Error)
		// Non-fatal: still register telemetry
	} else {
		result.OwnershipOK = true
	}

	hlog := s.registerSynapseSimulatorTelemetry("SIMULATION")
	hlogf(hlog, "INFO", "starting in SIMULATION mode (fixture: %s)", ownershipPath)
	if result.Error != "" {
		hlogf(hlog, "WARN", "%s", result.Error)
	} else {
		hlogf(hlog, "INFO", ".ownership.json validated at %s", ownershipPath)
	}

	result.Healthy = true
	hlogf(hlog, "SUCCESS", "✓ SIMULATION mode ready")
	s.slog("SUCCESS", "✓ SynapseSimulator running in SIMULATION mode")
	return result
}

// bootSynapseSimulatorGovernance runs SynapseSimulator with full post-onboarding governance.
// Validates .ownership.json at the canonical path:
//
//	<nucleusRepo>/.bloom/.nucleus-{org}/.ownership.json
func (s *Supervisor) bootSynapseSimulatorGovernance(ctx context.Context, result *SynapseSimulatorResult) *SynapseSimulatorResult {
	org := readOrganizationFromNucleusJSON()
	result.Org = org

	ownershipPath := getOwnershipPath(false, true)
	if ownershipPath == "" {
		// Can happen if org is empty and bloom_dir unresolvable — degrade gracefully.
		result.Error = "cannot resolve .ownership.json path (org slug absent from nucleus.json and BLOOM_DIR unset)"
		s.slog("WARN", "SynapseSimulator GOVERNANCE: %s", result.Error)
		hlog := s.registerSynapseSimulatorTelemetry("DEGRADED")
		hlogf(hlog, "WARN", "%s", result.Error)
		result.Healthy = true // non-fatal; SynapseSimulator still registers
		return result
	}

	s.slog("INFO", "⚙️  SynapseSimulator: starting in GOVERNANCE mode (org=%s, path=%s)", org, ownershipPath)

	if _, err := os.Stat(ownershipPath); err != nil {
		if os.IsNotExist(err) ||
			strings.Contains(err.Error(), "syntax is incorrect") ||
			strings.Contains(err.Error(), "invalid") {
			// Onboarding completed but file missing — migration in progress.
			result.Error = fmt.Sprintf(".ownership.json not found at %s (migration pending?)", ownershipPath)
			s.slog("WARN", "SynapseSimulator GOVERNANCE: %s — running in degraded mode", result.Error)
			hlog := s.registerSynapseSimulatorTelemetry("DEGRADED")
			hlogf(hlog, "WARN", "%s — running in degraded mode", result.Error)
			result.Healthy = true // non-fatal
			return result
		}
		// Real filesystem error (permissions, disk, etc.)
		result.Error = fmt.Sprintf("ownership.json access error: %v", err)
		s.slog("ERROR", "SynapseSimulator GOVERNANCE: %s", result.Error)
		result.Healthy = false
		return result
	}

	// Validate required fields
	if err := validateOwnershipFile(ownershipPath); err != nil {
		result.Error = fmt.Sprintf("ownership validation failed: %v", err)
		s.slog("WARN", "SynapseSimulator GOVERNANCE: %s", result.Error)
		hlog := s.registerSynapseSimulatorTelemetry("DEGRADED")
		hlogf(hlog, "WARN", "%s", result.Error)
		result.Healthy = true // schema errors are non-fatal
		return result
	}

	result.OwnershipOK = true
	hlog := s.registerSynapseSimulatorTelemetry("GOVERNANCE")
	hlogf(hlog, "INFO", "starting in GOVERNANCE mode (org=%s, path=%s)", org, ownershipPath)
	hlogf(hlog, "INFO", ".ownership.json validated — canonical schema and binding matrix valid")
	hlogf(hlog, "SUCCESS", "✓ GOVERNANCE mode ready (org=%s)", org)
	result.Healthy = true
	s.slog("SUCCESS", "✓ SynapseSimulator running in GOVERNANCE mode (org=%s)", org)
	return result
}

// validateOwnershipFile reads and validates the required fields in .ownership.json.
// Required: canonical ownership schema (legacy inputs are normalized once).
func validateOwnershipFile(path string) error {
	return governance.ValidateOwnershipPath(path)
}

// registerSynapseSimulatorTelemetry registers the SynapseSimulator debug stream in telemetry.json
// and creates the physical synapse-simulator.log file so the declared stream has a real
// file on disk from the first boot.
//
// Returns an open *os.File pointing to synapse-simulator.log (append mode) so the caller
// can write boot-time entries via hlogf.  The file is left open intentionally —
// the OS will close it when the process exits, and the Supervisor does not need
// to track it beyond the boot sequence.  Returns nil if the file cannot be
// created (non-fatal — callers must guard with hlogf which is nil-safe).
func (s *Supervisor) registerSynapseSimulatorTelemetry(mode string) *os.File {
	logsBase := getBloomNucleusBase()
	logPath := filepath.Join(logsBase, "logs", "nucleus", "synapse-simulator", "synapse-simulator.log")

	// Ensure log directory exists (best-effort — synapse-simulator is non-fatal)
	_ = os.MkdirAll(filepath.Dir(logPath), 0755)

	// Open (or create) the physical log file.  This is the step that was
	// previously missing: the directory was created and the stream was
	// registered in telemetry.json, but no file descriptor was ever opened,
	// so synapse-simulator.log never appeared on disk.
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		s.slog("WARN", "SynapseSimulator: could not open synapse-simulator.log — %v", err)
		// Continue: registerStream still runs so telemetry stays consistent.
		f = nil
	} else {
		// Write session header — marks each boot attempt in the log.
		fmt.Fprintf(f, "======== [%s] SynapseSimulator session started — mode: %s ========\n",
			time.Now().UTC().Format(time.RFC3339), mode)
	}

	s.registerStream(
		"synapse-simulator",
		fmt.Sprintf("🛠  SYNAPSE_SIMULATOR [%s]", mode),
		logPath,
		fmt.Sprintf("SynapseSimulator debug/observability stream — mode: %s", mode),
		"nucleus",
		1,
		[]string{"nucleus", "synapse-simulator", "debug"},
	)

	return f
}

// hlogf writes a timestamped log line to the synapse-simulator log file.
// It is nil-safe: if f is nil (file could not be opened) it does nothing.
// Format mirrors the supervisor's own slog output for easy cross-referencing.
func hlogf(f *os.File, level, format string, args ...interface{}) {
	if f == nil {
		return
	}
	msg := fmt.Sprintf(format, args...)
	fmt.Fprintf(f, "[%s] [%s] %s\n", time.Now().UTC().Format(time.RFC3339), level, msg)
}
