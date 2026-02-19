# Implementation Prompt: Metamorph Binary Inspection System

## Context

You are implementing the **Binary Inspection System** for Metamorph, a declarative state reconciler for the BTIPS (Bloom Technical Intent Package) ecosystem. Metamorph currently has a stub implementation of `inspect` command that returns "Not yet implemented".

## Current State

**File:** `installer/metamorph/internal/inspection/inspect.go`

```go
// Current stub implementation
func createInspectCommand(c *core.Core) *cobra.Command {
    return &cobra.Command{
        Use:   "inspect",
        Short: "Inspect all binaries and show detailed info",
        Run: func(cmd *cobra.Command, args []string) {
            if c.Config.OutputJSON {
                data := map[string]interface{}{
                    "binaries": []string{},
                    "message":  "Inspection not yet implemented",
                }
                c.OutputJSON(data)
            } else {
                fmt.Println("⚠️  Inspect command not yet implemented")
            }
        },
    }
}
```

## Requirements

### 1. Binary Categories

Metamorph must inspect TWO categories of binaries:

#### **A. Managed Binaries** (updatable by Metamorph)
Located in: `C:\Users\{user}\AppData\Local\BloomNucleus\bin\`

- `brain/brain.exe` - Python execution engine
- `nucleus/nucleus.exe` - Governance CLI
- `sentinel/sentinel.exe` - Orchestration daemon
- `native/bloom-host.exe` - C++ Synapse bridge
- `conductor/bloom-conductor.exe` - Electron UI
- `cortex/bloom-cortex.blx` - Chrome extension package
- `metamorph/metamorph.exe` - Self (state reconciler)

#### **B. External Binaries** (auditable, not updatable by Metamorph)
Located in: `C:\Users\{user}\AppData\Local\BloomNucleus\bin\`

- `temporal/temporal.exe` - Temporal workflow server
- `ollama/ollama.exe` - Local LLM runtime
- `chrome-win/chrome.exe` - Chromium browser
- `node/node.exe` - Node.js runtime

### 2. Information to Extract

For each binary, extract:

#### **Common Fields:**
- `name` - Display name (e.g., "Brain", "Temporal")
- `path` - Absolute path to binary
- `version` - Version string
- `build_number` - Build number (if available)
- `hash` - SHA-256 hash of binary file
- `size_bytes` - File size in bytes
- `last_modified` - File modification timestamp (ISO 8601)
- `status` - Health status: "healthy", "missing", "corrupted", "unknown"

#### **Managed Binaries Only:**
- `updatable_by_metamorph` - Always `true`
- `capabilities` - Array of capability strings (from --info command)

#### **External Binaries Only:**
- `updatable_by_metamorph` - Always `false`
- `source` - Origin (e.g., "temporal.io", "ollama.ai", "chromium.org", "nodejs.org")
- `update_method` - How to update: "nucleus_download", "external_installer", "manual"
- `latest_version` - Latest available version (optional, if detectable)
- `update_available` - Boolean indicating if update exists

### 3. Binary Interrogation Protocol

#### **For Managed Binaries (BTIPS components):**

Call `{binary} --info --json` to get metadata:

```bash
brain.exe --info --json
```

Expected response:
```json
{
  "name": "Brain",
  "version": "3.2.0",
  "build_number": 42,
  "hash": "sha256_abc123...",
  "capabilities": ["intent_execution", "synapse_server"]
}
```

If `--info` command fails or returns unexpected format:
- Fall back to version detection via `--version`
- Mark `status` as "unknown" if version cannot be detected
- Mark `status` as "missing" if binary file doesn't exist

#### **For External Binaries:**

Call `{binary} --version` to get version:

**Temporal:**
```bash
temporal.exe --version
# Output: temporal version 1.22.0
```

**Ollama:**
```bash
ollama.exe --version
# Output: ollama version is 0.1.25
```

**Chromium:**
```bash
chrome.exe --version
# Output: Google Chrome 146.0.7635.0
```

**Node.js:**
```bash
node.exe --version
# Output: v20.11.0
```

Parse version from output using regex or string manipulation.

### 4. Command-Line Interface

#### **Basic Inspection (managed binaries only):**
```bash
metamorph inspect
```

Output:
```
System Binary Inspection
────────────────────────────────────────────────────────────
Brain         v3.2.0 (build 42)   15.0 MB   ✓ Healthy
Sentinel      v1.8.0 (build 28)    8.0 MB   ✓ Healthy
Nucleus       v2.1.0 (build 35)   12.0 MB   ✓ Healthy
Host          v2.1.0 (build 12)    2.0 MB   ✓ Healthy
Cortex        v1.2.4 (build 42)    2.3 MB   ✓ Healthy
Conductor     v1.5.0 (build 22)  100.0 MB   ✓ Healthy
Metamorph     v1.0.0 (build 2)     8.5 MB   ✓ Healthy
────────────────────────────────────────────────────────────
Total: 7 components, 148.3 MB
```

#### **Extended Inspection (include external binaries):**
```bash
metamorph inspect --all
```

Output:
```
System Binary Inspection
────────────────────────────────────────────────────────────
MANAGED BINARIES (Updatable by Metamorph)
────────────────────────────────────────────────────────────
Brain         v3.2.0 (build 42)   15.0 MB   ✓ Healthy
Sentinel      v1.8.0 (build 28)    8.0 MB   ✓ Healthy
Nucleus       v2.1.0 (build 35)   12.0 MB   ✓ Healthy
Host          v2.1.0 (build 12)    2.0 MB   ✓ Healthy
Cortex        v1.2.4 (build 42)    2.3 MB   ✓ Healthy
Conductor     v1.5.0 (build 22)  100.0 MB   ✓ Healthy
Metamorph     v1.0.0 (build 2)     8.5 MB   ✓ Healthy

EXTERNAL BINARIES (Auditable Only)
────────────────────────────────────────────────────────────
Temporal      v1.22.0             25.0 MB   ✓ Healthy   (Update: 1.23.0 available)
Ollama        v0.1.25            450.0 MB   ✓ Healthy   (Update: 0.1.26 available)
Chromium      v146.0.7635.0      180.0 MB   ✓ Healthy   (Up to date)
Node          v20.11.0            28.0 MB   ✓ Healthy   (Update: 20.11.1 available)
────────────────────────────────────────────────────────────
Total: 11 components, 831.3 MB
Managed: 7 binaries (148.3 MB)
External: 4 binaries (683.0 MB)
Updates available: 3 external binaries
```

#### **JSON Output:**
```bash
metamorph --json inspect --all
```

Output:
```json
{
  "managed_binaries": [
    {
      "name": "Brain",
      "path": "C:\\Users\\user\\AppData\\Local\\BloomNucleus\\bin\\brain\\brain.exe",
      "version": "3.2.0",
      "build_number": 42,
      "hash": "sha256_abc123...",
      "size_bytes": 15728640,
      "last_modified": "2024-02-08T10:30:00Z",
      "status": "healthy",
      "updatable_by_metamorph": true,
      "capabilities": ["intent_execution", "synapse_server"]
    },
    {
      "name": "Sentinel",
      "path": "C:\\Users\\user\\AppData\\Local\\BloomNucleus\\bin\\sentinel\\sentinel.exe",
      "version": "1.8.0",
      "build_number": 28,
      "hash": "sha256_def456...",
      "size_bytes": 8388608,
      "last_modified": "2024-02-01T14:20:00Z",
      "status": "healthy",
      "updatable_by_metamorph": true,
      "capabilities": ["orchestration", "event_bus"]
    }
  ],
  "external_binaries": [
    {
      "name": "Temporal",
      "path": "C:\\Users\\user\\AppData\\Local\\BloomNucleus\\bin\\temporal\\temporal.exe",
      "version": "1.22.0",
      "hash": "sha256_ghi789...",
      "size_bytes": 26214400,
      "last_modified": "2024-01-15T09:00:00Z",
      "status": "healthy",
      "updatable_by_metamorph": false,
      "source": "temporal.io",
      "update_method": "nucleus_download",
      "latest_version": "1.23.0",
      "update_available": true
    },
    {
      "name": "Ollama",
      "path": "C:\\Users\\user\\AppData\\Local\\BloomNucleus\\bin\\ollama\\ollama.exe",
      "version": "0.1.25",
      "hash": "sha256_jkl012...",
      "size_bytes": 471859200,
      "last_modified": "2024-02-01T10:00:00Z",
      "status": "healthy",
      "updatable_by_metamorph": false,
      "source": "ollama.ai",
      "update_method": "external_installer",
      "latest_version": "0.1.26",
      "update_available": true
    }
  ],
  "summary": {
    "total_binaries": 11,
    "managed_count": 7,
    "external_count": 4,
    "total_size_bytes": 871694336,
    "managed_size_bytes": 155713536,
    "external_size_bytes": 715980800,
    "healthy_count": 11,
    "missing_count": 0,
    "corrupted_count": 0,
    "updates_available": 3
  },
  "timestamp": "2024-02-15T11:29:00Z"
}
```

### 5. Implementation Guidelines

#### **A. Code Structure**

Create the following files:

**1. `internal/inspection/types.go`**
Define data structures:
```go
type ManagedBinary struct {
    Name                 string   `json:"name"`
    Path                 string   `json:"path"`
    Version              string   `json:"version"`
    BuildNumber          int      `json:"build_number,omitempty"`
    Hash                 string   `json:"hash"`
    SizeBytes            int64    `json:"size_bytes"`
    LastModified         string   `json:"last_modified"`
    Status               string   `json:"status"`
    UpdatableByMetamorph bool     `json:"updatable_by_metamorph"`
    Capabilities         []string `json:"capabilities,omitempty"`
}

type ExternalBinary struct {
    Name                 string `json:"name"`
    Path                 string `json:"path"`
    Version              string `json:"version"`
    Hash                 string `json:"hash"`
    SizeBytes            int64  `json:"size_bytes"`
    LastModified         string `json:"last_modified"`
    Status               string `json:"status"`
    UpdatableByMetamorph bool   `json:"updatable_by_metamorph"`
    Source               string `json:"source"`
    UpdateMethod         string `json:"update_method"`
    LatestVersion        string `json:"latest_version,omitempty"`
    UpdateAvailable      bool   `json:"update_available"`
}

type InspectionResult struct {
    ManagedBinaries  []ManagedBinary  `json:"managed_binaries"`
    ExternalBinaries []ExternalBinary `json:"external_binaries,omitempty"`
    Summary          InspectionSummary `json:"summary"`
    Timestamp        string           `json:"timestamp"`
}

type InspectionSummary struct {
    TotalBinaries      int   `json:"total_binaries"`
    ManagedCount       int   `json:"managed_count"`
    ExternalCount      int   `json:"external_count"`
    TotalSizeBytes     int64 `json:"total_size_bytes"`
    ManagedSizeBytes   int64 `json:"managed_size_bytes"`
    ExternalSizeBytes  int64 `json:"external_size_bytes"`
    HealthyCount       int   `json:"healthy_count"`
    MissingCount       int   `json:"missing_count"`
    CorruptedCount     int   `json:"corrupted_count"`
    UpdatesAvailable   int   `json:"updates_available"`
}
```

**2. `internal/inspection/managed.go`**
Implement managed binary inspection:
```go
func InspectManagedBinary(name, path string) (*ManagedBinary, error) {
    // 1. Check if file exists
    // 2. Get file info (size, modified time)
    // 3. Calculate SHA-256 hash
    // 4. Execute: {binary} --info --json
    // 5. Parse response
    // 6. Fallback to --version if --info fails
    // 7. Return ManagedBinary struct
}

func InspectAllManagedBinaries(basePath string) ([]ManagedBinary, error) {
    binaries := []string{
        "brain/brain.exe",
        "nucleus/nucleus.exe",
        "sentinel/sentinel.exe",
        "native/bloom-host.exe",
        "conductor/bloom-conductor.exe",
        "cortex/bloom-cortex.blx",
        "metamorph/metamorph.exe",
    }
    
    results := []ManagedBinary{}
    for _, bin := range binaries {
        result, err := InspectManagedBinary(...)
        if err != nil {
            // Log error but continue
        }
        results = append(results, result)
    }
    return results, nil
}
```

**3. `internal/inspection/external.go`**
Implement external binary inspection:
```go
func InspectExternalBinary(name, path, source, updateMethod string) (*ExternalBinary, error) {
    // 1. Check if file exists
    // 2. Get file info (size, modified time)
    // 3. Calculate SHA-256 hash
    // 4. Execute: {binary} --version
    // 5. Parse version from output
    // 6. Optionally check for latest version (future enhancement)
    // 7. Return ExternalBinary struct
}

func InspectAllExternalBinaries(basePath string) ([]ExternalBinary, error) {
    externals := []struct{
        name, path, source, method string
    }{
        {"Temporal", "temporal/temporal.exe", "temporal.io", "nucleus_download"},
        {"Ollama", "ollama/ollama.exe", "ollama.ai", "external_installer"},
        {"Chromium", "chrome-win/chrome.exe", "chromium.org", "nucleus_download"},
        {"Node", "node/node.exe", "nodejs.org", "nucleus_download"},
    }
    
    results := []ExternalBinary{}
    for _, ext := range externals {
        result, err := InspectExternalBinary(...)
        if err != nil {
            // Log error but continue
        }
        results = append(results, result)
    }
    return results, nil
}
```

**4. `internal/inspection/utils.go`**
Helper functions:
```go
func CalculateSHA256(filePath string) (string, error) {
    // Read file and compute SHA-256
}

func ExecuteCommandAndParse(binary, arg string) (string, error) {
    // Execute command and capture output
}

func ParseVersionFromOutput(output string) string {
    // Extract version using regex
}

func FormatSize(bytes int64) string {
    // Convert bytes to human-readable (MB, GB)
}
```

**5. Update `internal/inspection/inspect.go`**
Replace stub with full implementation:
```go
func createInspectCommand(c *core.Core) *cobra.Command {
    cmd := &cobra.Command{
        Use:   "inspect",
        Short: "Inspect all binaries and show detailed info",
        Run: func(cmd *cobra.Command, args []string) {
            includeExternal, _ := cmd.Flags().GetBool("all")
            
            // Inspect managed binaries
            managed, err := InspectAllManagedBinaries(basePath)
            
            // Inspect external binaries (if --all flag)
            var external []ExternalBinary
            if includeExternal {
                external, err = InspectAllExternalBinaries(basePath)
            }
            
            // Build result
            result := InspectionResult{
                ManagedBinaries: managed,
                ExternalBinaries: external,
                Summary: calculateSummary(managed, external),
                Timestamp: time.Now().Format(time.RFC3339),
            }
            
            // Output
            if c.Config.OutputJSON {
                c.OutputJSON(result)
            } else {
                printInspectionTable(result)
            }
        },
    }
    
    cmd.Flags().BoolP("all", "a", false, "Include external binaries")
    return cmd
}
```

#### **B. Error Handling**

- If binary file is missing → `status: "missing"`
- If `--info` command fails → Try `--version`, mark as `status: "unknown"` if both fail
- If hash calculation fails → `hash: "error_calculating_hash"`
- If external version detection fails → `version: "unknown"`, `status: "unknown"`
- Never fail the entire inspection if one binary fails - log error and continue

#### **C. Path Resolution**

Base path should be resolved from:
1. Environment variable: `BLOOM_NUCLEUS_HOME` (if set)
2. Default: `C:\Users\{user}\AppData\Local\BloomNucleus\bin\` (Windows)
3. Default: `/Users/{user}/Library/Application Support/BloomNucleus/bin/` (macOS)
4. Default: `/home/{user}/.local/share/BloomNucleus/bin/` (Linux)

#### **D. Performance**

- Inspect binaries in parallel using goroutines (max 4 concurrent)
- Cache inspection results for 60 seconds to avoid repeated expensive operations
- SHA-256 calculation can be slow for large files (Chromium ~180MB) - show progress or run async

#### **E. Testing**

Create test cases for:
- Binary exists and responds to `--info`
- Binary exists but `--info` fails
- Binary is missing
- Hash calculation
- Version parsing from different output formats
- JSON output validation

### 6. Future Enhancements (Do NOT implement now, but design for extensibility)

- Fetch latest versions from remote APIs (temporal.io, ollama.ai)
- Compare local vs. remote versions automatically
- Download updates to staging/ (responsibility of Nucleus, not Metamorph)
- Integrity verification against known-good hashes database

### 7. Constraints

- **DO NOT** connect to internet - all inspection is local only
- **DO NOT** modify any binaries - inspection is read-only
- **DO NOT** execute binaries without timeout - add 5-second timeout to prevent hangs
- **DO NOT** implement update functionality - only inspection/audit

### 8. Expected Output After Implementation

After implementing, these commands should work:

```bash
# Basic inspection (managed only)
metamorph inspect

# Extended inspection (include external)
metamorph inspect --all

# JSON output
metamorph --json inspect
metamorph --json inspect --all

# Help
metamorph inspect --help
```

## Acceptance Criteria

- [ ] `metamorph inspect` returns table of 7 managed binaries
- [ ] `metamorph inspect --all` returns table of 7 managed + 4 external binaries
- [ ] `metamorph --json inspect` returns valid JSON matching schema
- [ ] Missing binaries are detected and marked as `status: "missing"`
- [ ] SHA-256 hashes are correctly calculated
- [ ] Version detection works for all managed binaries (via `--info`)
- [ ] Version detection works for all external binaries (via `--version`)
- [ ] Summary statistics are accurate
- [ ] Human-readable output is well-formatted and aligned
- [ ] Command completes in under 3 seconds for typical installation

## Implementation Order

1. **Phase 1:** Data structures (`types.go`)
2. **Phase 2:** Utils (SHA-256, command execution, parsing)
3. **Phase 3:** Managed binary inspection (`managed.go`)
4. **Phase 4:** External binary inspection (`external.go`)
5. **Phase 5:** Update command implementation (`inspect.go`)
6. **Phase 6:** Output formatting (table and JSON)
7. **Phase 7:** Testing and validation

## Notes

- This feature is critical for `metamorph generate-manifest` (which depends on inspection data)
- External binary inspection enables Nucleus to detect when updates are needed
- The `--all` flag is intentionally optional to keep default behavior fast (managed binaries only)
- Latest version detection for external binaries is future work - for now, leave as empty string

---

**Start with Phase 1 and proceed sequentially. Good luck!**
