# Monitor

Follow the root AGENTS.md authorization rules. This is a skeleton: only the
CLI/logging/telemetry scaffolding exists so far, mirrored from `installer/impact`.

- `internal/cli/`: actual command tree is the only source of help metadata.
- `internal/core/logger.go`, `telemetry.go`: independent log; Nucleus is the
  only telemetry writer.
- `internal/status/command.go`: placeholder `status` command proving the
  wiring end to end. Not Monitor's real domain.
- `README.md`: build instructions and current scope.

No observation, correlation, evaluator-selection, signal or state-persistence
logic is implemented yet. Do not add Monitor's actual runtime-observation
domain, Impact's evaluation contract, Nucleus supervisor integration, or any
other subsystem here without explicit instruction — this skeleton exists to
be expanded deliberately, one authorized change at a time.
