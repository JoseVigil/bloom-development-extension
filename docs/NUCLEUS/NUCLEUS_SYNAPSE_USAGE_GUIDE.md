# SYNAPSE USAGE GUIDE

## Overview

Synapse es el comando de orquestación de Nucleus que gestiona workflows usando Temporal. Ejecuta operaciones complejas (como lanzar Sentinel) con retry automático, tracking de estado y respuestas estructuradas.

**Arquitectura:**
```
Command → Temporal Workflow → Activity → Sentinel → JSON Response
```

---

## Prerequisites

### 1. Start Temporal Server (once)
```bash
nucleus temporal start
```

### 2. Start Worker (keep running)
```bash
nucleus worker start
```

---

## Command Structure

```bash
nucleus [--json] synapse <subcommand> [args] [flags]
```

### Available Subcommands

#### `launch` - Start browser profile
```bash
nucleus synapse launch <profile_id> [flags]
```

**Flags:**
- `--mode <string>` - Launch mode: `landing`, `discovery`, `headless` (default: `landing`)
- `--email <string>` - Email address
- `--service <string>` - Service identifier (google, facebook, etc.)
- `--account <string>` - Account identifier
- `--alias <string>` - Profile alias
- `--extension <string>` - Extension path
- `--role <string>` - User role
- `--step <string>` - Execution step
- `--heartbeat` - Enable heartbeat tracking
- `--register` - Register new profile
- `--config <path>` - JSON config file or `-` for stdin
- `--save` - Save configuration

---

## Response Format

### Success Response (--json)
```json
{
  "success": true,
  "profile_id": "profile_001",
  "launch_id": "launch_profile_001_1707145200123456789",
  "chrome_pid": 12345,
  "debug_port": 9222,
  "extension_loaded": true,
  "effective_config": {
    "mode": "landing",
    "headless": false,
    "user_data_dir": "C:\\profiles\\profile_001"
  },
  "state": "READY",
  "timestamp": 1707145200
}
```

### Error Response (--json)
```json
{
  "success": false,
  "profile_id": "profile_001",
  "launch_id": "launch_profile_001_1707145200123456789",
  "state": "FAILED",
  "error": "Chrome binary not found",
  "timestamp": 1707145200
}
```

---

## Usage by Technology

### Go

```go
package main

import (
    "encoding/json"
    "os/exec"
)

type LaunchResult struct {
    Success         bool                   `json:"success"`
    ProfileID       string                 `json:"profile_id"`
    LaunchID        string                 `json:"launch_id,omitempty"`
    ChromePID       int                    `json:"chrome_pid,omitempty"`
    DebugPort       int                    `json:"debug_port,omitempty"`
    ExtensionLoaded bool                   `json:"extension_loaded,omitempty"`
    EffectiveConfig map[string]interface{} `json:"effective_config,omitempty"`
    State           string                 `json:"state,omitempty"`
    Error           string                 `json:"error,omitempty"`
    Timestamp       int64                  `json:"timestamp"`
}

func LaunchProfile(profileID, mode, email string) (*LaunchResult, error) {
    cmd := exec.Command("nucleus", "--json", "synapse", "launch", profileID,
        "--mode", mode,
        "--email", email)
    
    output, err := cmd.CombinedOutput()
    if err != nil {
        return nil, err
    }
    
    var result LaunchResult
    if err := json.Unmarshal(output, &result); err != nil {
        return nil, err
    }
    
    return &result, nil
}

// Usage
result, err := LaunchProfile("profile_001", "landing", "test@mail.com")
if err != nil {
    log.Fatal(err)
}
fmt.Printf("Chrome PID: %d, Debug Port: %d\n", result.ChromePID, result.DebugPort)
```

---

### Electron/Node.js

```javascript
const { spawn } = require('child_process');

class SynapseLauncher {
  launch(profileId, options = {}) {
    return new Promise((resolve, reject) => {
      const args = ['--json', 'synapse', 'launch', profileId];
      
      if (options.mode) args.push('--mode', options.mode);
      if (options.email) args.push('--email', options.email);
      if (options.service) args.push('--service', options.service);
      
      const nucleus = spawn('nucleus', args);
      let stdout = '';
      
      nucleus.stdout.on('data', (data) => stdout += data);
      nucleus.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout));
          } catch (err) {
            reject(new Error(`Invalid JSON: ${stdout}`));
          }
        } else {
          reject(new Error(`Exit code ${code}`));
        }
      });
    });
  }
}

// Usage
const launcher = new SynapseLauncher();
launcher.launch('profile_001', { mode: 'landing', email: 'test@mail.com' })
  .then(result => {
    console.log('Chrome PID:', result.chrome_pid);
    console.log('Debug port:', result.debug_port);
  })
  .catch(err => console.error(err));
```

---

### Bash

```bash
#!/bin/bash

launch_profile() {
    local profile_id=$1
    local mode=${2:-landing}
    local email=$3
    
    result=$(nucleus --json synapse launch "$profile_id" \
        --mode "$mode" \
        --email "$email" 2>&1)
    
    if [ $? -eq 0 ]; then
        echo "$result" | jq .
        chrome_pid=$(echo "$result" | jq -r '.chrome_pid')
        echo "Chrome PID: $chrome_pid"
    else
        echo "Error: $result" >&2
        return 1
    fi
}

# Usage
launch_profile "profile_001" "landing" "test@mail.com"
```

---

### PowerShell

```powershell
function Launch-Profile {
    param(
        [string]$ProfileId,
        [string]$Mode = "landing",
        [string]$Email
    )
    
    $result = nucleus --json synapse launch $ProfileId `
        --mode $Mode `
        --email $Email | ConvertFrom-Json
    
    if ($result.success) {
        Write-Host "Chrome PID: $($result.chrome_pid)"
        Write-Host "Debug Port: $($result.debug_port)"
        return $result
    } else {
        Write-Error $result.error
    }
}

# Usage
Launch-Profile -ProfileId "profile_001" -Mode "landing" -Email "test@mail.com"
```

---

### Git Bash (Windows)

```bash
#!/bin/bash

# Same as Bash but with Windows paths
nucleus.exe --json synapse launch profile_001 \
    --mode landing \
    --email test@mail.com \
    | jq .chrome_pid
```

---

## Examples

### Basic launch
```bash
nucleus --json synapse launch profile_001
```

### With mode and email
```bash
nucleus --json synapse launch profile_001 --mode discovery --email test@mail.com
```

### With config file
```bash
nucleus --json synapse launch --config launch.json
```

**launch.json:**
```json
{
  "profile_id": "profile_001",
  "mode": "landing",
  "email": "test@mail.com",
  "service": "google"
}
```

### From stdin
```bash
echo '{"profile_id":"profile_001","mode":"landing"}' | nucleus --json synapse launch --config -
```

---

## Workflow States

| State | Description |
|-------|-------------|
| `IDLE` | Initial state, waiting for signal |
| `ONBOARDING` | Initialization in progress |
| `READY` | Sentinel running successfully |
| `DEGRADED` | Non-critical errors (extension failed, heartbeat lost) |
| `RECOVERING` | Attempting recovery from error |
| `FAILED` | Critical error, requires intervention |

---

## Error Handling

### Check exit code
```bash
nucleus --json synapse launch profile_001
if [ $? -ne 0 ]; then
    echo "Launch failed"
fi
```

### Parse error from JSON
```javascript
const result = await launcher.launch('profile_001');
if (!result.success) {
    console.error('Error:', result.error);
    console.error('State:', result.state);
}
```

### Common errors
- `"failed to create temporal client: connection refused"` → Start Temporal: `nucleus temporal start`
- `"workflow execution failed: timeout"` → Start worker: `nucleus worker start`
- `"profile_id is required"` → Provide profile_id as first argument
- `"sentinel binary not found"` → Configure Sentinel path in worker

---

## Creating New Synapse Commands

### 1. Define command in `commands.go`
```go
func newMyCommand(c *core.Core) *cobra.Command {
    cmd := &cobra.Command{
        Use:   "mycommand [args]",
        Short: "Description",
        Run: func(cmd *cobra.Command, args []string) {
            // Execute Temporal workflow
            result, err := executeMyWorkflow(c, args)
            
            // Return JSON if --json flag
            if c.IsJSON {
                output, _ := json.Marshal(result)
                fmt.Println(string(output))
            }
        },
    }
    return cmd
}
```

### 2. Add to synapse parent command
```go
func NewSynapseCommand(c *core.Core) *cobra.Command {
    cmd := &cobra.Command{
        Use:   "synapse",
        Short: "Temporal workflow orchestration",
    }
    
    cmd.AddCommand(newLaunchCommand(c))
    cmd.AddCommand(newMyCommand(c))  // ← Add here
    
    return cmd
}
```

### 3. Create Temporal workflow
```go
// In internal/orchestration/temporal/workflows.go
func MyWorkflow(ctx workflow.Context, input MyInput) (*MyResult, error) {
    // Define workflow logic with activities
    return &MyResult{Success: true}, nil
}
```

### 4. Execute from command
```go
func executeMyWorkflow(c *core.Core, args []string) (*MyResult, error) {
    ctx := context.Background()
    tc, _ := temporalclient.NewClient(ctx)
    defer tc.Close()
    
    return tc.ExecuteMyWorkflow(ctx, args)
}
```

### 5. Test
```bash
nucleus --json synapse mycommand arg1 arg2
```

---

## Performance Metrics

- **Typical launch time**: 5-10 seconds
- **Workflow timeout**: 30 minutes
- **Automatic retries**: 3 attempts with exponential backoff
- **Status polling**: Every 1 second for max 60 seconds

---

## Debugging

### View logs
```
Windows: %LOCALAPPDATA%\BloomNucleus\logs\orchestration\
Linux: ~/.local/share/BloomNucleus/logs/orchestration/
```

### View telemetry
```bash
tail -f ~/.local/share/BloomNucleus/logs/orchestration/telemetry.json | jq .
```

### Check Temporal
```bash
curl http://localhost:7233
```

---

**Version:** 1.0.0  
**Date:** 2026-02-06
