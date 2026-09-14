# Impact

Follow the root AGENTS.md authorization rules. This file points to the implementation contracts:

- `internal/contracts/contract.go`: extensible EvaluationRequest/Assessment and evaluator interface.
- `internal/evaluation/evaluate.go`: instance-owned engine; never add caller state, IO or loops.
- `internal/evaluation/`: coexistence, preservation and compliance evaluators and their tests.
- `../nucleus/gravity/portable.go`: Gravity's public criterion boundary. Never import its internal packages directly.
- `internal/assessment/command.go`: Cobra factory and init registration by domain.
- `internal/cli/`: actual command tree is the only source of help metadata.
- `internal/core/logger.go`, `telemetry.go`: independent log; Nucleus is the only telemetry writer.
- `README.md`: questions, limits, validation and build instructions.

Do not implement Monitor, Winston, authority, scheduling or execution here.
