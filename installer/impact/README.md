# Impact

Portable consequence evaluation for Cognituum. The root Go package contains only
the CLI entry point, `main.go`. Contracts live in `internal/contracts`; the engine,
evaluators and their tests live in `internal/evaluation`. Go restricts direct
imports of these internal packages to consumers within Impact's module tree.
The local and server adapters share the same internal evaluation engine.
Build the executable with `go build -o <output>/impact.exe .` (omit `.exe`
on Unix). The existing build scripts can also build the named `main.go` file;
no special build tag is needed.

## Boundaries

Impact evaluates supplied facts and criterion. It does not acquire facts, resolve
Gravity, establish authority, execute actions, maintain caller state, monitor,
or start a server loop. No Monitor or Winston implementation is included.
`adapters/server.Handler` can be mounted by a caller; tests use httptest.

`evaluation.New(evaluators...)` constructs an instance-owned registry.
`evaluation.Default()` creates a
fresh instance with the first three evaluators. Question type is an open string,
paired with a semantic version, not a closed enumeration. Future evaluators use
the same envelope, with evaluator-owned `question.parameters` and `payload`.
Evaluators must be deterministic and must not retain/mutate input. The CLI's
initialization-only factory registry is separate from the evaluation engine.

## Questions implemented in version 1

| Type | Exact question | Mechanical support |
|---|---|---|
| `coexistence` | Can the selected criteria hold jointly for this subject, scope and intent? | Real-valued threshold intersections and qualified priority cycles. |
| `preservation` | Does the candidate entail each baseline obligation? | Numeric entailment by testing candidate AND negated obligation. An inconsistent candidate never yields vacuous success. |
| `compliance` | Do the observations satisfy each selected obligation in this snapshot? | Threshold comparisons against exactly one matching observation. |

These are initial evaluators, not Impact's universe. Unknown type/version returns
an explicitly indeterminate assessment. Built-in v1 evaluators reject extension
payload/parameters rather than ignoring them. Their semantics are pinned to
`gravity-criterion/1` and `gravity-expr/0.1`; changes require a new evaluator version.

## Input contract

`EvaluationRequest` in `internal/contracts/contract.go` is the authoritative typed contract.

- `contract`: `impact/1`.
- `question`: open type, semantic version, optional extension parameters.
- `context`: one subject, scope, numeric domain (`real` in v1), Intent and
  immutable Gravity resolution reference. The caller supplies an already selected
  set with shared applicability. This engine cannot verify selection completeness
  or authority from a self-declared reference.
- `postures`: source-qualified immutable references, expressions and roles
  (`baseline` or `candidate`). Never merge bare IDs across organizations.
- `snapshot`: immutable reference, observations with units and RFC3339 timestamps,
  a completeness assertion and explicit missing material.
- `payload`: future evaluator-owned extension data.

The same metric string denotes the same measurement ONLY within the supplied
shared subject/scope. Distinct declared metrics are independent dimensions in
v1. The same metric with different units is indeterminate. No aliases,
conversions or unit equivalences are inferred. Context selection,
binding and normalization are caller responsibilities. Nil unit differs from a
specified unit. Observations are supplied, not measured or predicted by Impact.
Snapshot age is not guessed using the wall clock.

Malformed expressions, duplicate references, non-finite quantities and malformed
envelopes are errors, never empty successful findings. Missing observations,
qualitative constraints, evidence judgments, exceptions, escalation policy and
unqualified cross-posture priority relations are explicit indeterminacy. Numeric
comparisons use existing Gravity float64/exact-comparison semantics, not decimal
precision, tolerance, integer solving or arbitrary theorem proving.

## Assessment contract

Every assessment identifies the question and its human-readable meaning,
evaluator version, canonicalized typed-input SHA-256 digest, findings with source
references and mechanical basis/evidence, coverage, indeterminacy and conditions
for reevaluation. References identify full expressions/facts in the bound input;
the assessment does not duplicate private criterion text. Input posture/fact
ordering is normalized; external timestamps never enter the assessment.

Coverage is relative to the supplied context. A confirmed finding can coexist
with incomplete coverage. No result is execution permission. Changed criterion,
authority resolution, observations, context or evaluator semantics requires
reevaluation. The caller must coordinate freshness with execution.

## Gravity public boundary

`nucleus/gravity` owns `Criterion`, `Meaning`, `Bound`, `Analysis` and `Conflict`.
It represents interpretation and joint consistency of already-situated criterion,
not internal detector DTOs. No internal AST, persistence node, mass, lifecycle or
timestamp crosses the boundary. It validates all expressions before invoking the
existing internal parser/detectors, marks unsupported judgment explicitly and
removes detector wall-clock metadata. Existing implementations remain in place.
The local Go replace directive keeps this repository's Nucleus implementation as
the dependency; publishing independent modules is outside this change.

## CLI and observability

```
impact assess --input request.json
impact assess --input request.json --json
impact --help
impact --json-help
impact assess --json-help
```

Factories register in `init()` via `core.RegisterCommand`. Business logic stays
in `internal/evaluation`, with shared types in `internal/contracts`.
Group commands register only their parent. All executable
commands require descriptions, argument validation, examples, category and JSON
response metadata. The help renderer recursively reads the actual Cobra tree,
including inherited flags. Category identity is in `internal/cli/config.go`.

Logs use Nucleus's installation resolution (`BLOOM_APPDATA_DIR`, otherwise
platform defaults including XDG_DATA_HOME). Files are append-only at
`<LogsDir>/impact/impact_core_YYYYMMDD.log`, rotated on the first write after a
UTC day change. Format: `YYYY/MM/DD HH:MM:SS [LEVEL] message`. `Warn` emits
`WARNING` to match Nucleus. All levels Debug/Info/Warn/Error/Success are supported.
There is no rotation timer. Only controlled metadata is logged, not input bodies,
expressions or secrets. Console logs use stderr for JSON and help generation.

At startup and rotation, Impact invokes `nucleus --json telemetry register` with
stream `impact_core`, label `IMPACT CORE`, absolute path, priority 2, category
`impact`, source `impact`, and a description. It refreshes size metadata at close.
Nucleus preserves historical `paths` entries and closes previous active paths
when the new daily file is registered. The daily file remains active after a
short-lived CLI exits, because subsequent invocations append to the same file.
Impact never writes telemetry.json. Registration/logging failures are reported;
initialization fails rather than silently running without required observability.
No subprocess output enters the response JSON.

## Build and verification

`build-all.py --only impact` uses the existing platform component script. It
builds the named entry file and generates help from the binary. Both outputs are
copied to `installer/help/impact_help.{txt,json}`. Generation failures fail the
Impact build. Nucleus must be available for required log registration.
Impact uses the shared build counter mechanism: `build_number.txt` is incremented
once per build, the active platform offset is added, and the effective value is
injected through `BLOOM_BUILD_NUMBER`. Platform offsets live in
`scripts/build_number.{windows,linux,darwin}.txt`.

After a successful build, `build-all.py` delegates Impact deployment to
`metamorph rollout --only impact`. Metamorph copies the complete native component
directory to `<AppDataDir>/bin/impact`, preserving the executable and
`help/impact_help.{txt,json}`. This selector requires an existing compatible
Nucleus installation; it does not build Nucleus implicitly.

Run `go test ./...` here and `go test ./gravity ./internal/gravity` in
`installer/nucleus`.
Tests cover question distinctions, invalid input, explicit unknowns, extensions,
determinism, concurrent evaluations, three-way cycles, non-vacuous preservation,
shared-fixture adapter parity, CLI metadata/help and stdout. Logging tests inject
a clock. The telemetry integration test builds the real Nucleus executable and
uses BLOOM_APPDATA_DIR in a temporary directory, checks registration, rotation and
historical inventory without modifying the installed system inventory.
