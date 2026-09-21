# Monitor

Skeleton only. The root Go package contains only the CLI entry point,
`main.go`. Build the executable with `go build -o <output>/monitor.exe .`
(omit `.exe` on Unix). No special build tag is needed.

## Current scope

Monitor does not yet observe anything. This skeleton exists to prove the
same infrastructure pattern used across the ecosystem's Go applications
(Impact, Nucleus): a Cobra command tree with dual human/JSON help, an
independent append-only log, and telemetry registration against Nucleus.
The only command implemented is `status`, which reports that the binary,
logging and telemetry registration path work.

Real scope — runtime fact correlation, evaluator selection, signal
publication, recoverable event consumption and durable state — is proposed
in the design note this skeleton was built from, and is deliberately not
implemented here yet.

## CLI and observability

```
monitor status
monitor status --json
monitor --help
monitor --json-help
monitor status --json-help
```

Factories register in `init()` via `core.RegisterCommand`. Group commands
register only their parent. All executable commands require descriptions,
argument validation, examples, category and JSON response metadata. The
help renderer recursively reads the actual Cobra tree, including inherited
flags. Category identity is in `internal/cli/config.go`.

Logs use Nucleus's installation resolution (`BLOOM_APPDATA_DIR`, otherwise
platform defaults including `XDG_DATA_HOME`). Files are append-only at
`<LogsDir>/monitor/monitor_core_YYYYMMDD.log`, rotated on the first write
after a UTC day change. Format: `YYYY/MM/DD HH:MM:SS [LEVEL] message`.
`Warn` emits `WARNING` to match Nucleus. All levels
Debug/Info/Warn/Error/Success are supported. There is no rotation timer.
Only controlled metadata is logged, not input bodies or secrets. Console
logs use stderr for JSON and help generation.

At startup and rotation, Monitor invokes `nucleus --json telemetry
register` with stream `monitor_core`, label `MONITOR CORE`, absolute path,
priority 2, category `monitor`, source `monitor`, and a description. It
refreshes size metadata at close. Monitor never writes `telemetry.json`.
Registration/logging failures are reported; initialization fails rather
than silently running without required observability.

## Build and verification

Run `go test ./...` here. Tests cover CLI metadata/help, stdout JSON
behavior, and log rotation/registration.

This app is not yet wired into `build-all.py` or `metamorph rollout`; that
integration is a separate, explicit step.
