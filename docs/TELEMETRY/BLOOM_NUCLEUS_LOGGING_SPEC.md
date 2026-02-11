# BloomNucleus Logging System Specification

## Core Rules

### Directory Structure
```
C:\Users\josev\AppData\Local\BloomNucleus\logs\
├── telemetry.json (ONLY file allowed at root)
└── [application_folders]/
    └── [optional_subfolders]/
        └── *.log files
```

**CRITICAL**: 
- Root `logs/` directory contains ONLY `telemetry.json` and folders
- NO `.log` files directly in `logs/` root
- All log files MUST be in application subfolders
- Subfolders are allowed and encouraged for organization

### Log File Naming Convention

**FORMAT**: `executable_module_timestamp.log`

**RULES**:
- All lowercase, no exceptions
- Extension MUST be `.log`
- Use underscore `_` as separator
- NO accumulation in single giant file
- Create separate files periodically using timestamps

**VALID EXAMPLES**:
```
brain_core_20260209.log
brain_server_manager_20260209.log
electron_install.log
nucleus.build.log
temporal_server_20260209.log
```

**INVALID EXAMPLES**:
```
Brain_Core.log          # uppercase
brain-core.log          # wrong separator
brain_core.txt          # wrong extension
braincore20260209.log   # missing separators
```

---

## Telemetry Registration Architecture

### Centralized Write Model

**ARCHITECTURE CHANGE**: Previously, multiple processes could write to `telemetry.json` directly. This caused:
- File lock collisions
- JSON corruption
- Race conditions
- Inconsistent metadata

**NEW MODEL**: Single writer pattern enforced through Nucleus CLI.

### Critical Rules

**❌ FORBIDDEN**:
- Applications MUST NOT open `telemetry.json` directly
- Applications MUST NOT lock `telemetry.json`
- Applications MUST NOT modify `telemetry.json` manually
- Applications MUST NOT write `last_update` field

**✅ REQUIRED**:
- All telemetry registration through `nucleus telemetry register` command
- Nucleus is the ONLY writer to `telemetry.json`
- Applications create and write their own `.log` files
- Nucleus generates `last_update` automatically in UTC

### Responsibility Separation

| Component | Responsibility |
|-----------|---------------|
| **Application** | Create log directory structure |
| **Application** | Create and write `.log` file |
| **Application** | Call `nucleus telemetry register` CLI |
| **Nucleus CLI** | Lock and update `telemetry.json` |
| **Nucleus CLI** | Generate `last_update` timestamp |
| **Nucleus CLI** | Ensure atomic write operations |

**The responsibility of creating and writing the log file belongs exclusively to the application.**

---

## Telemetry Registration Command

### Command Syntax

```bash
nucleus telemetry register \
  --stream <stream_id> \
  --label <display_label> \
  --path <absolute_log_path> \
  --priority <1|2|3>
```

### Parameters

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--stream` | string | Yes | Unique stream identifier (see naming contract) |
| `--label` | string | Yes | Display label with emoji |
| `--path` | string | Yes | Absolute path to log file |
| `--priority` | integer | Yes | Priority level (1, 2, or 3) |

**NOTE**: `last_update` is NOT a parameter. It is generated automatically by the command in UTC format.

### Behavior

- **Idempotent**: Running the same command multiple times is safe
- **Overwrite by stream_id**: If `stream_id` already exists, entry is updated
- **Atomic operation**: File locking handled internally by Nucleus
- **Automatic timestamp**: `last_update` generated at registration time

### Complete Example

```bash
nucleus telemetry register \
  --stream electron_install \
  --label "🔥 ELECTRON INSTALL" \
  --path "C:/Users/josev/AppData/Local/BloomNucleus/logs/install/electron_install.log" \
  --priority 2
```

This command:
1. Locks `telemetry.json`
2. Reads current content
3. Adds/updates entry for `electron_install`
4. Generates `last_update` timestamp
5. Writes updated JSON atomically
6. Releases lock

### Multi-Module Registration

Applications with multiple log files call the command once per log file:

```bash
# Brain application with 3 modules
nucleus telemetry register \
  --stream brain_core \
  --label "🧠 BRAIN CORE" \
  --path "C:/Users/josev/AppData/Local/BloomNucleus/logs/brain/core/brain_core_20260209.log" \
  --priority 2

nucleus telemetry register \
  --stream brain_server \
  --label "⚡ BRAIN SERVER" \
  --path "C:/Users/josev/AppData/Local/BloomNucleus/logs/brain/server/brain_server_20260209.log" \
  --priority 2

nucleus telemetry register \
  --stream brain_profile \
  --label "👤 BRAIN PROFILE" \
  --path "C:/Users/josev/AppData/Local/BloomNucleus/logs/brain/profile/brain_profile_20260209.log" \
  --priority 3
```

---

## Stream ID Naming Contract

### Mandatory Format

**RULES**:
- **lowercase only**: No uppercase letters
- **snake_case**: Use underscore `_` as separator
- **stable**: A `stream_id` should never be renamed
- **unique**: No collisions across the system

### Recommended Structure

```
<application>_<context>
```

**Examples**:
```
brain_core
brain_server
brain_profile
electron_install
nucleus_build
temporal_server
```

### Purpose

- Prevent semantic collisions
- Enable predictable lookups
- Maintain long-term stability
- Simplify debugging and monitoring

**NOTE**: This is a **documentation contract**. There is no automatic enforcement or validation. Developers are responsible for compliance.

---

## Telemetry System

### File Location
```
C:\Users\josev\AppData\Local\BloomNucleus\logs\telemetry.json
```

### Purpose
Central registry tracking all active log files. **SINGLE WRITER**: Only Nucleus modifies this file.

### JSON Structure

```json
{
  "active_streams": {
    "stream_identifier": {
      "label": "🔥 VISUAL LABEL",
      "path": "C:/Users/josev/AppData/Local/BloomNucleus/logs/app/module/file.log",
      "priority": 2,
      "last_update": "2026-02-09T12:34:24.577Z"
    }
  }
}
```

### Field Specifications

| Field | Type | Description | Generated By |
|-------|------|-------------|--------------|
| `stream_identifier` | string | Unique stream key | Developer (via CLI) |
| `label` | string | Display label with emoji | Developer (via CLI) |
| `path` | string | Full log file path | Developer (via CLI) |
| `priority` | integer | Importance level | Developer (via CLI) |
| `last_update` | string | ISO 8601 UTC timestamp | **Nucleus (automatic)** |

### Priority Levels

- **1 (Critical)**: System-critical components, fatal errors, security issues
- **2 (Important)**: Main operations, significant events, warnings
- **3 (Informational)**: Debug logs, build information, informational messages

### Complete Example

```json
{
  "active_streams": {
    "electron_install": {
      "label": "🔥 ELECTRON INSTALL",
      "path": "C:/Users/josev/AppData/Local/BloomNucleus/logs/install/electron_install.log",
      "priority": 2,
      "last_update": "2026-02-09T12:34:24.577Z"
    },
    "brain_server_event_bus": {
      "label": "📡 EVENT BUS",
      "path": "C:/Users/josev/AppData/Local/BloomNucleus/logs/brain/server/brain_server_event_bus_20260209.log",
      "priority": 2,
      "last_update": "2026-02-09T08:57:43.108119Z"
    },
    "brain_core": {
      "label": "🧠 BRAIN CORE",
      "path": "C:/Users/josev/AppData/Local/BloomNucleus/logs/brain/core/brain_core_20260209.log",
      "priority": 2,
      "last_update": "2026-02-09T08:57:43.028464Z"
    },
    "nucleus_build": {
      "label": "📦 NUCLEUS BUILD",
      "path": "C:/Users/josev/AppData/Local/BloomNucleus/logs/build/nucleus.build.log",
      "priority": 3,
      "last_update": "2026-02-09T09:11:32.818026Z"
    }
  }
}
```

---

## Implementation Protocol

### Creating a New Log Stream

```
APPLICATION SIDE:
1. Determine directory structure within logs/
2. Create folders if they don't exist
3. Generate filename: executable_module_timestamp.log
4. Create log file at target location
5. Write log content freely to the file

REGISTRATION SIDE:
6. Call `nucleus telemetry register` with correct parameters
7. Nucleus handles telemetry.json update atomically
```

### Multi-Module Applications

**RULE**: Applications creating multiple log files MUST register each one separately.

**Example**: `brain` application with modules:
```
brain/core/brain_core_20260209.log        → register as "brain_core"
brain/server/brain_server_20260209.log    → register as "brain_server"
brain/profile/brain_profile_20260209.log  → register as "brain_profile"
```

Each log file = one registration call. NO exceptions.

---

## Log Content Format

**STATUS**: Not yet standardized

**CURRENT**: Each application defines its own format

**RECOMMENDED** (until template is standardized):
- Include timestamp for each event
- Include severity level (INFO, WARNING, ERROR, CRITICAL)
- Include descriptive message
- Include context (module, function, line number)

**FUTURE**: Standardized template will be enforced across all applications.

---

## File System Operations

### Path Format
- Internal code: Use OS-native separators (`\` for Windows, `/` for Unix)
- telemetry.json paths: Use forward slash `/` for cross-platform compatibility
- CLI `--path` parameter: Use OS-native separators or forward slashes (CLI normalizes)

### Folder Creation
```python
# Pseudocode
import os
log_dir = "C:/Users/josev/AppData/Local/BloomNucleus/logs/brain/server"
os.makedirs(log_dir, exist_ok=True)
```

### Log File Writing
```python
# Pseudocode - Application responsibility
log_path = "C:/Users/josev/AppData/Local/BloomNucleus/logs/brain/core/brain_core_20260209.log"

with open(log_path, 'a') as log_file:
    log_file.write(f"[{timestamp}] INFO: Application started\n")
    log_file.write(f"[{timestamp}] DEBUG: Configuration loaded\n")
```

**Applications write to their log files freely. Nucleus does NOT write log content.**

---

## Validation Checklist

When implementing logging for any application:

- [ ] Log files in correct directory structure
- [ ] Filenames all lowercase
- [ ] Filenames follow `executable_module_timestamp.log` format
- [ ] All files have `.log` extension
- [ ] Log file created and written by application
- [ ] `nucleus telemetry register` called for each log file
- [ ] `stream_id` follows naming contract (lowercase, snake_case)
- [ ] All required CLI parameters provided
- [ ] **NOT** writing to `telemetry.json` directly
- [ ] **NOT** providing `last_update` manually
- [ ] Priority level appropriate for log type
- [ ] Paths use forward slashes in final telemetry.json
- [ ] Log rotation implemented (no giant single files)

---

## Common Errors to Avoid

1. **Uppercase in filenames**: Always lowercase
2. **Missing registration call**: Every log file needs `nucleus telemetry register`
3. **Single registration for multi-module app**: Each module needs separate registration
4. **Direct telemetry.json modification**: Use CLI only
5. **Providing last_update manually**: Nucleus generates it automatically
6. **Log files in root**: Must be in subfolders
7. **Giant accumulated files**: Implement rotation with timestamps
8. **Wrong stream_id format**: Use lowercase and snake_case

---

## Integration Pattern

```
APPLICATION STARTUP:
├── Check/create log directory structure
├── Determine log filename with timestamp
├── Initialize log file
├── Execute `nucleus telemetry register` command
│   ├── Nucleus locks telemetry.json
│   ├── Nucleus adds/updates entry in active_streams
│   ├── Nucleus generates last_update timestamp
│   └── Nucleus unlocks telemetry.json
└── Begin logging to file

DURING EXECUTION:
└── Write log entries to file (no telemetry.json interaction)

APPLICATION SHUTDOWN:
├── Flush logs
└── (Optional) Re-register to update last_update if needed
```

---

## Reference Implementation

Based on provided examples, here's the observed structure:

```
logs/
├── telemetry.json
├── install/
│   └── electron_install.log
├── brain/
│   ├── service/
│   │   └── brain_service.log
│   ├── core/
│   │   └── brain_core_20260209.log
│   ├── profile/
│   │   └── brain_profile_20260209.log
│   └── server/
│       ├── brain_server_20260209.log
│       ├── brain_server_manager_20260209.log
│       └── brain_server_event_bus_20260209.log
├── build/
│   └── nucleus.build.log
└── temporal/
    └── nucleus_temporal_server_2026-02-09.log
```

Each `.log` file has a corresponding entry in `telemetry.json` registered via CLI.

---

## Notes for Implementation

- Treat this as a strict specification
- All rules are mandatory unless explicitly marked as recommendations
- **Never modify telemetry.json directly from application code**
- Use `nucleus telemetry register` for all registrations
- Log rotation strategy is application-specific
- Content format will be standardized later - use structured logging now
- Priority assignment should be consistent within an application ecosystem
- Timestamp format in telemetry.json: ISO 8601 UTC (e.g., `2026-02-09T12:34:24.577Z`)
- Path normalization: Nucleus CLI handles conversion to forward slashes

---

## Migration Guide

### Old Pattern (DEPRECATED)

```python
# ❌ DO NOT USE
import fcntl
import json

def update_telemetry(stream_id, label, path, priority):
    with open(telemetry_path, 'r+') as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        data = json.load(f)
        data['active_streams'][stream_id] = {
            'label': label,
            'path': path,
            'priority': priority,
            'last_update': datetime.utcnow().isoformat() + 'Z'  # ❌ Manual timestamp
        }
        f.seek(0)
        f.truncate()
        json.dump(data, f, indent=2)
        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
```

### New Pattern (REQUIRED)

```python
# ✅ CORRECT
import subprocess

def register_log_stream(stream_id, label, path, priority):
    """Register a log stream via Nucleus CLI"""
    subprocess.run([
        'nucleus', 'telemetry', 'register',
        '--stream', stream_id,
        '--label', label,
        '--path', path,
        '--priority', str(priority)
    ], check=True)
```

---

## Questions to Clarify

If implementing this system, consider asking:

1. What is the log rotation strategy? (daily, size-based, count-based)
2. What log retention policy should be used?
3. Should old telemetry.json entries be cleaned up when logs are rotated/deleted?
4. Is there a maximum file size for individual log files?
5. Should telemetry.json be backed up or versioned?
6. What happens if telemetry.json is corrupted or missing?
7. Should there be a telemetry.json schema version field?
8. What emoji/icons are preferred for different log types?
9. Should log levels within files match telemetry.json priority?
10. Is there a centralized log viewer that consumes telemetry.json?
11. How does `nucleus telemetry register` handle errors (missing paths, invalid priority)?
12. Should applications verify CLI execution success before continuing?