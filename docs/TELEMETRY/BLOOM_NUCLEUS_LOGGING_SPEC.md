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

## Telemetry System

### File Location
```
C:\Users\josev\AppData\Local\BloomNucleus\logs\telemetry.json
```

### Purpose
Central registry tracking all active log files. **MULTI-ACCESS**: Multiple applications write to this file simultaneously.

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

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `stream_identifier` | string | Unique stream key | Use underscore separators (e.g., `brain_server_event_bus`) |
| `label` | string | Display label with emoji | Format: `"🔥 DESCRIPTION"` |
| `path` | string | Full log file path | Use forward slashes `/` for cross-platform compatibility |
| `priority` | integer | Importance level | 1 (critical), 2 (important), 3 (informational) |
| `last_update` | string | ISO 8601 timestamp | Must update on every log write |

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
      "last_update": "2026-02-09T08:57:43.108119"
    },
    "brain_core": {
      "label": "🧠 BRAIN CORE",
      "path": "C:/Users/josev/AppData/Local/BloomNucleus/logs/brain/core/brain_core_20260209.log",
      "priority": 2,
      "last_update": "2026-02-09T08:57:43.028464"
    },
    "nucleus_build": {
      "label": "📦 NUCLEUS BUILD",
      "path": "C:/Users/josev/AppData/Local/BloomNucleus/logs/build/nucleus.build.log",
      "priority": 3,
      "last_update": "2026-02-09T09:11:32.818026"
    }
  }
}
```

## Implementation Protocol

### Creating a New Log File

```
1. Determine directory structure within logs/
2. Create folders if they don't exist
3. Generate filename: executable_module_timestamp.log
4. Create log file at target location
5. Update telemetry.json atomically
```

### Updating telemetry.json

**CRITICAL**: File locking required for multi-access safety.

```
PROCEDURE:
1. Acquire exclusive lock on telemetry.json
2. Read current JSON content
3. Parse JSON
4. Add/update entry in active_streams
5. Update last_update to current ISO 8601 timestamp
6. Write updated JSON back to file
7. Release lock

TIMEOUT: Implement retry logic with exponential backoff
ERROR HANDLING: Log failures to stderr/error log, do not crash
```

### Multi-Module Applications

**RULE**: Applications creating multiple log files MUST create multiple telemetry.json entries.

**Example**: `brain` application with modules:
```
brain/core/brain_core_20260209.log        → entry: "brain_core"
brain/server/brain_server_20260209.log    → entry: "brain_server"
brain/profile/brain_profile_20260209.log  → entry: "brain_profile"
```

Each log file = one telemetry.json entry. NO exceptions.

## Log Content Format

**STATUS**: Not yet standardized

**CURRENT**: Each application defines its own format

**RECOMMENDED** (until template is standardized):
- Include timestamp for each event
- Include severity level (INFO, WARNING, ERROR, CRITICAL)
- Include descriptive message
- Include context (module, function, line number)

**FUTURE**: Standardized template will be enforced across all applications.

## File System Operations

### Path Format
- Internal code: Use OS-native separators (`\` for Windows, `/` for Unix)
- telemetry.json paths: Use forward slash `/` for cross-platform compatibility

### Folder Creation
```python
# Pseudocode
import os
log_dir = "C:/Users/josev/AppData/Local/BloomNucleus/logs/brain/server"
os.makedirs(log_dir, exist_ok=True)
```

### File Locking Examples

**Python**:
```python
import fcntl
import json

def update_telemetry(stream_id, label, path, priority):
    telemetry_path = "C:/Users/josev/AppData/Local/BloomNucleus/logs/telemetry.json"
    
    with open(telemetry_path, 'r+') as f:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)
        try:
            data = json.load(f)
            data['active_streams'][stream_id] = {
                'label': label,
                'path': path.replace('\\', '/'),
                'priority': priority,
                'last_update': datetime.utcnow().isoformat() + 'Z'
            }
            f.seek(0)
            f.truncate()
            json.dump(data, f, indent=2)
        finally:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
```

**Node.js**:
```javascript
const fs = require('fs');
const lockfile = require('proper-lockfile');

async function updateTelemetry(streamId, label, path, priority) {
  const telemetryPath = 'C:/Users/josev/AppData/Local/BloomNucleus/logs/telemetry.json';
  
  const release = await lockfile.lock(telemetryPath);
  try {
    const data = JSON.parse(fs.readFileSync(telemetryPath, 'utf8'));
    data.active_streams[streamId] = {
      label: label,
      path: path.replace(/\\/g, '/'),
      priority: priority,
      last_update: new Date().toISOString()
    };
    fs.writeFileSync(telemetryPath, JSON.stringify(data, null, 2));
  } finally {
    await release();
  }
}
```

## Validation Checklist

When implementing logging for any application:

- [ ] Log files in correct directory structure
- [ ] Filenames all lowercase
- [ ] Filenames follow `executable_module_timestamp.log` format
- [ ] All files have `.log` extension
- [ ] File locking implemented for telemetry.json
- [ ] Each log file has corresponding telemetry.json entry
- [ ] All required fields present (label, path, priority, last_update)
- [ ] last_update updates on every log write
- [ ] Priority level appropriate for log type
- [ ] Timestamps in ISO 8601 format
- [ ] Log rotation implemented (no giant single files)
- [ ] Paths in telemetry.json use forward slashes

## Common Errors to Avoid

1. **Uppercase in filenames**: Always lowercase
2. **Missing telemetry.json entry**: Every log file needs an entry
3. **Single entry for multi-module app**: Each module needs separate entry
4. **Wrong path separator**: Use `/` in telemetry.json
5. **No file locking**: Race conditions will corrupt telemetry.json
6. **Forgetting last_update**: Must update timestamp on every write
7. **Log files in root**: Must be in subfolders
8. **Giant accumulated files**: Implement rotation with timestamps

## Integration Pattern

```
APPLICATION STARTUP:
├── Check/create log directory structure
├── Determine log filename with timestamp
├── Initialize log file
├── Lock telemetry.json
├── Add/update entry in active_streams
├── Unlock telemetry.json
└── Begin logging

DURING EXECUTION:
├── Write log entries to file
└── Update last_update in telemetry.json (periodically or on flush)

APPLICATION SHUTDOWN:
├── Flush logs
└── Final telemetry.json update (optional)
```

## Reference Implementation

Based on provided examples, here's the observed structure:

```
logs/
├── telemetry.json
├── install/
│   └── electron_install.log
├── electron_launch.log (NOTE: This breaks the rule - should be in subfolder)
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

## Notes for AI Implementation

- Treat this as a strict specification
- All rules are mandatory unless explicitly marked as recommendations
- Multi-access to telemetry.json requires atomic operations
- Log rotation strategy is application-specific
- Content format will be standardized later - use structured logging now
- Priority assignment should be consistent within an application ecosystem
- Timestamp format: ISO 8601 UTC (e.g., `2026-02-09T12:34:24.577Z`)
- Path normalization: Always use forward slashes in telemetry.json

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
