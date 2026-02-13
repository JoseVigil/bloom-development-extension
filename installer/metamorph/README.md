# Metamorph

**Declarative System State Reconciler for the Bloom Ecosystem**

## What is Metamorph?

Metamorph is a declarative state reconciler that manages Windows system binaries and services. Unlike traditional updaters that push changes on command, Metamorph continuously reconciles **actual state** vs **desired state** (declared in manifests), similar to Kubernetes controllers.

### Key Principles

- **Declarative**: State is defined in manifests, not imperative commands
- **Reconciliation**: Detects drift and converges to desired state
- **Atomic**: Updates succeed completely or rollback entirely
- **Secure**: Never connects to external networks, receives pre-validated manifests from Nucleus
- **Service-Aware**: Safely manages Windows services with proper lifecycle handling

## System Context

Metamorph operates within the Bloom distributed system:

- **🛡️ Nucleus**: Governance layer (only component with internet access)
- **🌐 Bartcave**: Backend that provides signed manifests
- **🔄 Metamorph**: State reconciler (this component)
- **🧠 Brain**: Python execution engine
- **⚙️ Host**: Windows service manager (C++)
- **🛡️ Sentinel**: Event bus
- **🎛️ Conductor**: Application launcher

### Security Model

1. Bartcave generates signed manifest
2. Nucleus validates signature and ACL
3. If authorized, Nucleus invokes Metamorph with validated manifest
4. Metamorph reconciles local state (never validates signatures itself)
5. Metamorph reports results back to Nucleus

**Metamorph has zero external connectivity** - it operates only on pre-validated manifests.

## Core Capabilities

### State Inspection

Metamorph queries all system binaries using standardized contracts:
- `--version`: Simple version string
- `--info`: JSON metadata (version, capabilities, dependencies, channel)

Constructs complete system state from these interrogations.

### Reconciliation

Compares actual state vs desired state (manifest):
- Version mismatches
- Channel drift (stable, beta, alpha, lts)
- Dependency conflicts
- Missing capabilities

### Safe Updates

1. Download artifacts to staging area
2. Validate SHA256 hashes
3. Stop dependent Windows services
4. Wait for STOPPED confirmation (with timeout)
5. Atomic binary swap
6. Restart services
7. Verify new state with `--info`
8. Rollback on any failure

### Rollback

If reconciliation fails at any step:
- Restore previous binaries from backup
- Restart services with old versions
- Report failure to Nucleus
- System never left in inconsistent state

## Overview

Metamorph manages Windows system binaries and configuration through declarative manifests, providing atomic updates, rollback capabilities, and state inspection. Part of the Bloom ecosystem.

## Architecture

### Core Components

- **Core System** (`internal/core/`): Central registry, logger, path management
- **CLI Layer** (`internal/cli/`): Command routing, help rendering, user interface
- **Commands**: Self-registering via `init()` functions
  - System: `version`, `info`
  - Inspection: `status`, `inspect`
  - Reconciliation: `reconcile`, `generate-manifest`
  - Rollback: `rollback`
  - Maintenance: `cleanup`

### Command Registration

Commands auto-register using `init()`:

```go
func init() {
    core.RegisterCommand("CATEGORY", createCommandFunc)
}

func createCommandFunc(c *core.Core) *cobra.Command {
    return &cobra.Command{
        Use: "command-name",
        Annotations: map[string]string{
            "category": "CATEGORY",
            "json_response": `{...}`,
        },
        Run: func(cmd *cobra.Command, args []string) {
            // Implementation
        },
    }
}
```

### Categories

- **SYSTEM**: Version and system information
- **INSPECTION**: Binary and state inspection
- **RECONCILIATION**: Manifest-driven state management
- **ROLLBACK**: Snapshot restoration
- **MAINTENANCE**: Cleanup operations

## Build System

### Build Script (`scripts/build.bat`)

Auto-increments build number, generates:
- `internal/core/build_info.go` (build metadata)
- `help/metamorph_help.txt` (full command documentation)
- `help/metamorph_help.json` (JSON metadata)
- `help/metamorph_info.json` (system info)

### Build Artifacts

Output: `native/bin/win64/metamorph/`
- `metamorph.exe`
- `metamorph-config.json`
- `help/*.txt`, `help/*.json`

### Versioning

- Static: `internal/core/version.go` (Version, AppName)
- Dynamic: `internal/core/build_info.go` (BuildNumber, BuildDate, BuildTime)
- Counter: `scripts/build_number.txt`

## Usage

```bash
# Display version
metamorph version

# System information
metamorph info

# Current state inspection
metamorph status

# Inspect all binaries
metamorph inspect

# Generate manifest from current state
metamorph generate-manifest

# Reconcile against manifest
metamorph reconcile --manifest system.json

# Rollback to previous snapshot
metamorph rollback

# Cleanup staging and old snapshots
metamorph cleanup

# JSON output
metamorph --json info

# Full help with categories
metamorph --help

# JSON help metadata
metamorph --json-help
```

## Manifest Format

Metamorph expects manifests validated by Nucleus:

```json
{
  "manifest_version": "1.1",
  "system_version": "2.5.0",
  "release_channel": "stable",
  "artifacts": [
    {
      "name": "brain",
      "binary": "brain.exe",
      "version": "2.5.0",
      "sha256": "abc123...",
      "channel": "stable",
      "capabilities": ["pipeline_v3"],
      "requires": {
        "host": ">=2.0.0"
      }
    }
  ],
  "bartcave": {
    "version": "1.3.0",
    "sha256": "def456..."
  }
}
```

### Binary Contract

All managed binaries must support:

**`--version`**: Simple parseable output
```
brain 2.4.0
```

**`--info`**: Structured JSON metadata
```json
{
  "name": "brain",
  "version": "2.4.0",
  "build_date": "2026-02-10",
  "commit": "a83kd92",
  "channel": "stable",
  "capabilities": ["pipeline_v2"],
  "requires": {
    "host": ">=1.9.0"
  }
}
```

## Usage

```bash
# Display version
metamorph version

# System information
metamorph info

# JSON output
metamorph --json info

# Full help with categories
metamorph --help

# JSON help metadata
metamorph --json-help
```

## Integration

### Telemetry

Registers build logs with Nucleus CLI:
```batch
nucleus telemetry register --stream metamorph_build --label "METAMORPH BUILD" --path <log_path>
```

### Paths

- Root: `%LOCALAPPDATA%\BloomNucleus`
- Logs: `%LOCALAPPDATA%\BloomNucleus\logs\metamorph`
- Binary: `native\bin\win64\metamorph`
- Staging: `%LOCALAPPDATA%\BloomNucleus\staging`

## Development

### Adding Commands

1. Create file in `internal/<category>/command.go`
2. Implement `init()` with `core.RegisterCommand()`
3. Add blind import to `main.go`: `_ "github.com/bloom/metamorph/internal/<category>"`
4. Build automatically registers command

### Requirements

- Go 1.21+
- Windows (amd64 or 386)
- Cobra CLI framework

### Build

```bash
cd scripts
build.bat
```

## Help System

Generates comprehensive documentation:
- Command categories with descriptions
- Usage examples per command
- Flag descriptions with defaults
- JSON response schemas
- Argument validation info

Both human-readable (TXT) and machine-readable (JSON) formats.