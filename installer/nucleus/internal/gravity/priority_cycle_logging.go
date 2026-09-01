package gravity

import (
	"encoding/json"

	"nucleus/internal/core"
)

// This file wires PriorityCycleFinding output to Nucleus's existing logging
// infrastructure (internal/core.Logger + TelemetryManager), per
// docs/TELEMETRY/BLOOM_NUCLEUS_LOGGING_SPEC.md ("Logging spec"). Ratified
// scope for this addition: logging only — no CLI command, Workflow, activity
// or endpoint invokes DetectPriorityCycles or this logger yet. See
// docs/NUCLEUS/Guía Maestra de Implementación Comandos NUCLEUS.md for what a
// future command wiring this up would still need (init()/RegisterCommand,
// Annotations, --json support, etc.) — none of that exists here.
//
// Stream decision (control-ratified). A single domain-wide "nucleus_gravity"
// stream, not one scoped narrowly to PRIORITY_CYCLE — the same pattern
// already used for nucleus_governance/nucleus_analytics/etc. (see
// core.InitLogger). Future collision subtypes from Spec-Colisiones
// §3.3/§3.4, once implemented, log to this same stream rather than opening a
// new one: the Logging spec's naming rules state a stream_id is never
// renamed once published, so this is deliberately scoped to the domain
// (Gravity), not to this one detector.
//
// Category decision (control-ratified). A new "GRAVITY" category was added
// to getNucleusIcon/getNucleusStreamDescription in internal/core/logger.go
// (icon 🪐, a short domain description) — the only edit to an existing file
// in this addition. Everything else here is new code. Priority stays at
// core.InitLogger's default (2 / "Important"), matching the Logging spec's
// table: a confirmed collision is a significant event, not a system failure.
//
// Lifecycle. Callers open the logger themselves — typically
// core.InitLogger(paths, "GRAVITY", jsonMode) — and own its lifecycle
// (Close()). This package only knows how to format and write already
// -confirmed findings to an already-open logger; it does not open, rotate,
// or close anything itself, consistent with internal/gravity staying free
// of command/workflow wiring for now.

// LogPriorityCycleFindings writes one log line per confirmed PRIORITY_CYCLE
// finding to logger, at Warning level. Spec-Colisiones §4.2 treats
// CONFIRMED_COLLISION as a fact needing governance attention, not a Nucleus
// failure — the Logging spec's "Important / eventos significativos" tier
// (priority 2) is the closest match, so Warning (not Error) is used.
//
// Each line carries a short human-readable prefix followed by the finding
// encoded as JSON, so the stream stays both grep-able ("PRIORITY_CYCLE
// confirmed:") and machine-parseable. A finding that fails to encode — not
// reachable in practice, since PriorityCycleFinding is built entirely from
// strings and a JSON-safe timestamp — is logged as an Error instead of being
// silently dropped, and does not stop the remaining findings from being
// logged.
//
// logger must already be initialized (e.g. via core.InitLogger); passing nil
// panics on the first write, the same as any other misuse of an
// uninitialized *core.Logger elsewhere in this codebase — this function adds
// no guard beyond what Go already gives you.
func LogPriorityCycleFindings(logger *core.Logger, findings []PriorityCycleFinding) {
	for _, finding := range findings {
		encoded, err := json.Marshal(finding)
		if err != nil {
			logger.Error("PRIORITY_CYCLE: failed to encode confirmed finding for logging: %v", err)
			continue
		}
		logger.Warning("PRIORITY_CYCLE confirmed: %s", encoded)
	}
}
