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

---

# IonPump Reconciliation System — Implementation Prompt
## The High-Frequency Update Path

---

## Why IonPump Is Different

Every other component Metamorph manages — Brain, Sentinel, Nucleus, Conductor — updates on a **release cadence**: days or weeks between versions. A bad update is rare, and the cost of a flawed rollout is bounded.

IonPump (Brain's `cortex/ionsites/` recipes) operates on a fundamentally different cycle. Ion recipes encode automation behaviors that respond to live product changes on third-party sites (GitHub, Jira, etc.). When GitHub changes a UI flow, a recipe update may need to ship **the same day**. This means:

- Metamorph may be invoked to reconcile `ionsites/` multiple times per day on an active installation.
- A corrupted or partially-written recipe directory causes **silent automation failures** — Brain loads the recipe, finds it structurally valid, but it misbehaves at runtime because a file is stale or truncated.
- A failed mid-swap leaves `ionsites/` in an indeterminate state that persists across reboots until the next reconciliation.
- Brain (IonPump) holds recipes **in memory after loading** — a swap while Brain is running produces a split state where the running behavior and the on-disk state diverge.

These properties demand a reconciliation model that is more defensive than what Metamorph uses for binary updates. The following sections specify that model.

---

## Architecture Invariants (Non-Negotiable)

These invariants must hold at every point in the reconciliation lifecycle. Any implementation that violates one is incorrect regardless of whether it produces correct output on the happy path.

| # | Invariant |
|---|-----------|
| I-1 | **Only Metamorph writes to `ionsites/`**. Brain (IonPump), Sentinel, Nucleus, and any other process read from it. No other process may create, modify, or delete files under `ionsites/`. |
| I-2 | **Metamorph never writes directly to a live site directory**. All mutations go through a staging area first (`ionsites/_staging/`). The live directory is only touched during the atomic swap step. |
| I-3 | **A swap is all-or-nothing per site**. After a swap, the site directory contains either 100% the new version or 100% the previous version. A partially-written state is never left visible to readers. |
| I-4 | **SHA-256 of every file is verified against the manifest before any swap is initiated**. A download that passes size checks but fails hash verification is discarded without touching the live directory. |
| I-5 | **Rollback restores the previous version from backup, never re-downloads**. Network availability must not be a precondition for rollback. |
| I-6 | **Metamorph signals Brain before and after every swap**. Brain must quiesce its use of the affected site before the swap begins. The signal protocol is defined below and must not be bypassed even in forced-update mode. |
| I-7 | **The `_meta/versions.json` file is updated atomically as part of the same swap**. It never reflects a version that is not actually present on disk. |

---

## Directory Layout

```
BloomNucleus/bin/cortex/ionsites/
├── github.com/
│   ├── ion.manifest.json        ← recipe manifest (source of truth for version + file list)
│   └── auth.ion                 ← recipe file declared in manifest
├── jira.atlassian.com/
│   ├── ion.manifest.json
│   └── (recipe files...)
├── _staging/                    ← Metamorph's working area — Brain never reads here
│   └── github.com/              ← staging directory for a pending update
│       ├── ion.manifest.json
│       └── auth.ion
├── _backup/                     ← previous version of a site, kept until next successful swap
│   └── github.com/              ← one subdirectory per site, replaced on each swap
│       ├── ion.manifest.json
│       └── auth.ion
└── _meta/
    └── versions.json            ← authoritative version registry, updated atomically with each swap
```

**Why `_staging/` and `_backup/` use the same site name as the live directories:** using identical directory names allows the atomic swap to be a rename-pair operation (rename live → `_backup/{site}`, rename `_staging/{site}` → live), which is atomic at the filesystem level on all supported platforms when source and destination are on the same volume.

---

## Reconciliation Flow

The full reconciliation for a single site proceeds through these phases in strict order. Any phase failure aborts reconciliation for that site and triggers the recovery path. Other sites in the same reconciliation run are not affected.

```
Phase 1: Inspect
  └─ Read current ion.manifest.json from live site directory
  └─ Compare version + manifest_sha256 against the incoming update manifest
  └─ If versions match AND manifest hash matches → skip (already up to date)

Phase 2: Download
  └─ Create _staging/{site}/ if not present
  └─ Download each file listed in the update manifest to _staging/{site}/
  └─ Write a .tmp suffix during download; rename to final name on completion
  └─ On any download failure → leave _staging/{site}/ as-is (resume on next run)

Phase 3: Verify
  └─ For each file in update manifest:
      └─ Verify SHA-256 matches manifest-declared hash
      └─ Verify file size matches manifest-declared size
  └─ Verify ion.manifest.json itself matches manifest-declared sha256_manifest
  └─ If ANY verification fails → delete _staging/{site}/ entirely, abort this site

Phase 4: Signal Brain (Pre-Swap)
  └─ POST to IonPump local API: { "action": "quiesce_site", "site": "github.com" }
  └─ Wait up to 5 seconds for acknowledgement
  └─ If Brain does not acknowledge → abort this site (do NOT swap while Brain is active)
  └─ Record quiesce start time for post-swap signal timeout

Phase 5: Atomic Swap
  └─ If _backup/{site}/ exists → delete it
  └─ rename(ionsites/{site}/, ionsites/_backup/{site}/)       ← live → backup
  └─ rename(ionsites/_staging/{site}/, ionsites/{site}/)      ← staging → live
  └─ If second rename fails → rename(ionsites/_backup/{site}/, ionsites/{site}/)  ← restore
  └─ Update _meta/versions.json atomically (write .tmp, rename)

Phase 6: Signal Brain (Post-Swap)
  └─ POST to IonPump local API: { "action": "reload_site", "site": "github.com", "version": "1.1.0" }
  └─ Wait up to 10 seconds for Brain to report successful reload
  └─ If Brain reports reload failure → trigger rollback (Phase 7)

Phase 7: Rollback (only if Phase 6 fails or Phase 5 partially fails)
  └─ rename(ionsites/{site}/, ionsites/_staging/{site}/)      ← current → staging (preserve for diagnosis)
  └─ rename(ionsites/_backup/{site}/, ionsites/{site}/)       ← backup → live
  └─ POST to IonPump local API: { "action": "reload_site", "site": "github.com", "version": "<previous>" }
  └─ Update _meta/versions.json to reflect rolled-back version
  └─ Emit structured error to stderr and to metamorph's operation log
```

---

## `_meta/versions.json` Schema

This file is the authoritative record of what version is live for each site. It is the first thing Nucleus reads when deciding whether a recipe update is needed, and the first thing Metamorph reads when determining whether a reconciliation is a no-op.

```json
{
  "schema_version": 1,
  "last_updated": "2026-04-01T12:00:00Z",
  "sites": {
    "github.com": {
      "version": "1.1.0",
      "manifest_sha256": "abc123...",
      "swapped_at": "2026-04-01T12:00:00Z",
      "swap_count": 4,
      "previous_version": "1.0.0",
      "status": "healthy"
    }
  }
}
```

`status` values: `"healthy"` (last swap completed and Brain confirmed reload), `"rollback"` (live version is a rollback — Nucleus should investigate), `"pending"` (swap in progress — Metamorph crashed mid-swap if this persists after restart).

**If Metamorph starts and finds any site with `"status": "pending"`**, it must treat this as a crash-recovery scenario: check whether `_staging/{site}/` and `_backup/{site}/` exist and determine which of the two rename operations completed. Recovery logic is below.

---

## Crash Recovery

If Metamorph is killed during Phase 5 (between the two renames), `ionsites/` is left in one of three states:

| Observed state | Interpretation | Recovery action |
|---|---|---|
| `_backup/{site}/` exists, live `{site}/` is the **old** version | First rename did not complete | Delete `_backup/{site}/`, abort this reconciliation |
| `_backup/{site}/` exists, live `{site}/` is the **new** version | Both renames completed, `versions.json` may be stale | Update `versions.json` to reflect new version, signal Brain to reload |
| `_backup/{site}/` missing, live `{site}/` is the **old** version | Neither rename completed | Nothing to recover, re-run reconciliation normally |
| `_backup/{site}/` missing, live `{site}/` is the **new** version | Already swapped, `_backup` was cleaned up | Nothing to recover |

Recovery state is determined by comparing `version` fields between `live/{site}/ion.manifest.json`, `_backup/{site}/ion.manifest.json`, and `_staging/{site}/ion.manifest.json`.

On startup, if `_meta/versions.json` shows any site with `"status": "pending"`, Metamorph runs crash-recovery for that site before accepting any new reconciliation requests.

---

## `ionrecipes.go` — Extensions for Reconciliation (Phase 2+)

The inspection functions from the GitHub Onboarding milestone (`InspectIonRecipe`, `InspectAllIonRecipes`) are stable and do not change. Reconciliation is added as a separate concern in new functions.

### New functions to implement

```go
// ReconcileIonRecipe reconciles a single site against the provided update manifest entry.
// It runs all phases (inspect → download → verify → signal → swap → post-signal).
// Returns a ReconcileResult describing the outcome.
func ReconcileIonRecipe(ionsitesPath string, update IonRecipeUpdate, ionpumpClient IonPumpClient) ReconcileResult

// ReconcileAllIonRecipes reconciles all sites listed in the update manifest.
// Sites not in the manifest are not touched (additive-only reconciliation unless --prune is set).
// Returns aggregate results and a boolean indicating whether any site failed.
func ReconcileAllIonRecipes(ionsitesPath string, manifest IonRecipeManifest, ionpumpClient IonPumpClient) ([]ReconcileResult, bool)

// downloadIonRecipeToStaging downloads all files for a recipe update into _staging/{site}/.
// Uses .tmp suffix during download and renames on completion.
// Resumes partial downloads if _staging/{site}/ already has matching .tmp files.
func downloadIonRecipeToStaging(stagingDir string, update IonRecipeUpdate) error

// verifyIonRecipeStaging verifies all files in _staging/{site}/ against the update manifest.
// Returns a non-nil error describing the first verification failure found.
func verifyIonRecipeStaging(stagingDir string, update IonRecipeUpdate) error

// atomicSwap performs the two-rename swap: live → _backup, staging → live.
// Returns swapState indicating which renames completed, for crash-recovery use.
func atomicSwap(ionsitesPath, site string) (swapState, error)

// rollbackSwap reverses a completed or partially-completed swap.
// Uses the backup directory exclusively — never re-downloads.
func rollbackSwap(ionsitesPath, site string) error

// recoverPendingSwap resolves a site left with status "pending" from a previous crash.
func recoverPendingSwap(ionsitesPath, site string, versions *VersionsFile) error

// updateVersionsJSON atomically updates _meta/versions.json after a swap.
func updateVersionsJSON(ionsitesPath string, site string, entry VersionEntry) error
```

### New types

```go
// IonRecipeUpdate is a single entry in the reconciliation manifest sent by Nucleus.
type IonRecipeUpdate struct {
    Site            string              `json:"site"`
    Version         string              `json:"version"`
    SHA256Manifest  string              `json:"sha256_manifest"`
    SHA256Archive   string              `json:"sha256_archive,omitempty"`
    DownloadURL     string              `json:"download_url"`
    Files           []IonRecipeFile     `json:"files"`
}

// IonRecipeFile is a single file entry within an IonRecipeUpdate.
type IonRecipeFile struct {
    Path   string `json:"path"`
    SHA256 string `json:"sha256"`
    Bytes  int64  `json:"bytes"`
}

// IonRecipeManifest is the full reconciliation payload from Nucleus.
type IonRecipeManifest struct {
    IonRecipes []IonRecipeUpdate `json:"ion_recipes"`
    IssuedAt   string            `json:"issued_at"`
    IssuedBy   string            `json:"issued_by"`
}

// ReconcileResult captures the outcome of reconciling a single site.
type ReconcileResult struct {
    Site            string        `json:"site"`
    PreviousVersion string        `json:"previous_version"`
    NewVersion      string        `json:"new_version"`
    Action          string        `json:"action"` // "skipped" | "swapped" | "rolled_back" | "failed"
    Phase           string        `json:"phase"`  // phase where failure occurred, if any
    Error           string        `json:"error,omitempty"`
    Duration        time.Duration `json:"duration_ms"`
    SwappedAt       string        `json:"swapped_at,omitempty"`
}

// VersionEntry is a single site's record in versions.json.
type VersionEntry struct {
    Version          string `json:"version"`
    ManifestSHA256   string `json:"manifest_sha256"`
    SwappedAt        string `json:"swapped_at"`
    SwapCount        int    `json:"swap_count"`
    PreviousVersion  string `json:"previous_version"`
    Status           string `json:"status"` // "healthy" | "rollback" | "pending"
}

// VersionsFile is the parsed _meta/versions.json.
type VersionsFile struct {
    SchemaVersion int                     `json:"schema_version"`
    LastUpdated   string                  `json:"last_updated"`
    Sites         map[string]VersionEntry `json:"sites"`
}

// swapState captures how far a two-rename swap progressed (for crash recovery).
type swapState int
const (
    swapStateNone        swapState = iota // neither rename completed
    swapStateBackupDone                   // live → _backup completed; staging → live did not
    swapStateBothDone                     // both renames completed
)
```

---

## IonPump Signal Protocol

Before any swap, Metamorph must coordinate with Brain's IonPump runtime. IonPump exposes a local HTTP API (loopback only) for this purpose.

### Quiesce request (pre-swap)

```
POST http://127.0.0.1:{ionpump_port}/ionsites/quiesce
Content-Type: application/json

{ "site": "github.com", "reason": "metamorph_swap", "timeout_ms": 5000 }
```

Expected response (200 OK):
```json
{ "status": "quiesced", "site": "github.com", "active_flows": 0 }
```

If IonPump has flows actively running for this site, it should wait up to `timeout_ms` for them to complete naturally, then respond. If flows do not complete within the timeout, it should respond with:
```json
{ "status": "timeout", "site": "github.com", "active_flows": 2 }
```

Metamorph treats a `"timeout"` response as an abort condition. It does **not** force the swap. This is intentional: forcing a swap while flows are active risks data corruption in the flow's in-memory state.

### Reload request (post-swap)

```
POST http://127.0.0.1:{ionpump_port}/ionsites/reload
Content-Type: application/json

{ "site": "github.com", "version": "1.1.0", "reason": "metamorph_swap" }
```

Expected response (200 OK):
```json
{ "status": "reloaded", "site": "github.com", "version": "1.1.0" }
```

If Brain fails to load the new recipe (parse error, missing entrypoint, etc.), it responds:
```json
{ "status": "error", "site": "github.com", "error": "entrypoint auth.ion not found" }
```

Metamorph treats any non-`"reloaded"` response as a reload failure and initiates rollback.

### IonPumpClient interface

The signal protocol is abstracted behind an interface to enable testing without a running Brain:

```go
type IonPumpClient interface {
    QuiesceSite(site string, timeoutMs int) (QuiesceResult, error)
    ReloadSite(site string, version string) (ReloadResult, error)
}

type QuiesceResult struct {
    Status      string `json:"status"`       // "quiesced" | "timeout"
    ActiveFlows int    `json:"active_flows"`
}

type ReloadResult struct {
    Status  string `json:"status"` // "reloaded" | "error"
    Version string `json:"version"`
    Error   string `json:"error,omitempty"`
}
```

The production implementation (`HttpIonPumpClient`) reads the IonPump port from Nucleus's shared config file. The test implementation (`NoopIonPumpClient`) always returns `"quiesced"` and `"reloaded"` without making network calls.

---

## CLI Integration

### New command: `metamorph reconcile-ion-recipes`

This command receives the reconciliation manifest from stdin (or `--manifest` file path) and executes the full reconciliation lifecycle.

```bash
# Nucleus pipes the manifest:
echo '{"ion_recipes": [...]}' | metamorph reconcile-ion-recipes

# Or from file:
metamorph reconcile-ion-recipes --manifest /path/to/manifest.json

# Dry run — inspect + verify but do not swap:
metamorph reconcile-ion-recipes --manifest manifest.json --dry-run

# Force swap even if Brain does not quiesce (emergency use only — unsafe):
metamorph reconcile-ion-recipes --manifest manifest.json --force-swap

# JSON output:
metamorph --json reconcile-ion-recipes --manifest manifest.json
```

JSON output schema:

```json
{
  "reconcile_results": [
    {
      "site": "github.com",
      "previous_version": "1.0.0",
      "new_version": "1.1.0",
      "action": "swapped",
      "phase": "",
      "duration_ms": 342,
      "swapped_at": "2026-04-02T09:15:00Z"
    }
  ],
  "summary": {
    "total_sites": 1,
    "skipped": 0,
    "swapped": 1,
    "rolled_back": 0,
    "failed": 0
  },
  "timestamp": "2026-04-02T09:15:00Z"
}
```

### Extended `metamorph inspect --ion-recipes`

The existing `--ion-recipes` flag (implemented in milestone GitHub Onboarding) is extended with:

```bash
# Show pending status (sites in _staging/ or with status "pending" in versions.json):
metamorph inspect --ion-recipes --show-pending

# Show backup versions:
metamorph inspect --ion-recipes --show-backups
```

---

## Error Handling Rules

These rules define the precise behavior at each failure point. They are exhaustive — any failure scenario not listed here should be treated as `action: "failed"`, phase set to where the failure occurred, with no swap attempted.

| Failure point | Rule |
|---|---|
| `ionsites/` directory missing | Return informative error to caller. Do not create the directory. Creation is Nucleus's responsibility. |
| `_staging/` directory creation fails | Log and abort this site. Do not continue to download. |
| Download of individual file fails | Leave `_staging/{site}/` intact (partial download). Abort this site. Next run will retry. |
| SHA-256 verification fails for any file | Delete `_staging/{site}/` entirely. Abort this site with `phase: "verify"`. |
| Brain does not respond to quiesce request | Abort this site. Do not swap. Log Brain's non-response separately. |
| Brain returns `"timeout"` on quiesce | Abort this site. Do not swap. Do not retry automatically. |
| First rename (live → backup) fails | No state change. Abort this site with `phase: "swap"`. |
| Second rename (staging → live) fails | Reverse first rename immediately. Abort with `phase: "swap"`. |
| `versions.json` update fails | The swap already completed. Log the `versions.json` failure but do NOT roll back — the on-disk state is correct. Schedule a `versions.json` repair on next startup. |
| Brain returns `"error"` on reload | Initiate rollback (Phase 7). |
| Rollback rename fails | This is a critical failure. Log with maximum severity. Do not attempt further automatic recovery. Alert Nucleus via its own error channel. |
| `versions.json` update after rollback fails | Same as above: rollback is complete on disk. Log failure, do not re-reverse. |

---

## Testing Requirements

Because IonPump recipes update daily, the reconciliation path must have higher test coverage than any other Metamorph subsystem. The following test cases are mandatory before the reconciliation feature ships.

### Unit tests (`ionrecipes_test.go`)

- `TestInspectIonRecipe_Healthy` — valid manifest, entrypoint exists, hash matches
- `TestInspectIonRecipe_MissingManifest` — site directory exists, no `ion.manifest.json`
- `TestInspectIonRecipe_ManifestUnparseable` — `ion.manifest.json` is invalid JSON
- `TestInspectIonRecipe_EntrypointMissing` — manifest declares entrypoint, file absent
- `TestInspectIonRecipe_SkipsMetaDir` — `_meta/`, `_staging/`, `_backup/` are not returned
- `TestVerifyIonRecipeStaging_AllPass` — all files match hashes
- `TestVerifyIonRecipeStaging_HashMismatch` — one file hash wrong → error
- `TestVerifyIonRecipeStaging_FileMissing` — declared file absent → error
- `TestAtomicSwap_BothRenames` — both renames succeed, state is `swapStateBothDone`
- `TestAtomicSwap_SecondRenameFails` — second rename fails, first is reversed
- `TestRollbackSwap_RestoresFromBackup` — backup present, rollback restores it
- `TestRollbackSwap_NoBackup` — no backup directory → error, live not touched
- `TestRecoverPendingSwap_BackupDoneNewLive` — crash after both renames → update versions.json
- `TestRecoverPendingSwap_BackupDoneOldLive` — crash after first rename → delete backup, abort
- `TestUpdateVersionsJSON_Atomic` — write + rename, file never in inconsistent state
- `TestUpdateVersionsJSON_SwapCountIncrement` — swap_count increments correctly

### Integration tests (`ionrecipes_integration_test.go`)

Uses a temporary directory as `ionsitesPath` and a `NoopIonPumpClient`. No network calls.

- `TestReconcileIonRecipe_SkippedIfUpToDate` — same version + same hash → action: "skipped"
- `TestReconcileIonRecipe_HappyPath` — full flow, Brain confirms reload → action: "swapped"
- `TestReconcileIonRecipe_BrainRefusesQuiesce` — Brain returns timeout → action: "failed", phase: "signal_pre"
- `TestReconcileIonRecipe_BrainFailsReload` → rollback executed → action: "rolled_back"
- `TestReconcileIonRecipe_VerificationFail` — hash mismatch → staging deleted → action: "failed", phase: "verify"
- `TestReconcileAllIonRecipes_OneSiteFailsOthersContinue` — failure isolation

---

## Acceptance Criteria

### Inspection milestone (GitHub Onboarding — already implemented)

- [x] `IonRecipeInfo` and `IonRecipesResult` added to `types.go`
- [x] `ionrecipes.go` created with `InspectIonRecipe`, `InspectAllIonRecipes`, `calculateDirSize`
- [x] `CalculateSHA256` and `FormatSize` from `utils.go` reused — not reimplemented
- [x] Flag `--ion-recipes` added to `inspect.go`
- [x] `resolveIonSitesPath()` uses `GetBasePath()` — no hardcoded paths
- [x] `printIonRecipesTable()` shows "No ion recipes installed." when list is empty
- [x] `metamorph inspect --ion-recipes` returns 0 recipes (no error) if `ionsites/` empty
- [x] `metamorph inspect --ion-recipes` returns informative warning if `ionsites/` missing
- [x] JSON `"recipes"` field is always `[]`, never `null`
- [x] `calculateDirSize` is unexported

### Reconciliation milestone (next phase — not yet implemented)

- [ ] `ReconcileIonRecipe` implements all 7 phases in order
- [ ] No swap is ever attempted without SHA-256 verification passing for all files
- [ ] No swap is ever attempted without Brain acknowledging quiesce
- [ ] `atomicSwap` uses two renames — never copies in-place
- [ ] Second rename failure reverses first rename before returning
- [ ] Rollback uses `_backup/` exclusively — never re-downloads
- [ ] `_meta/versions.json` is updated atomically (write `.tmp`, rename)
- [ ] `versions.json` update failure after a successful swap does NOT trigger rollback
- [ ] Crash recovery runs at Metamorph startup if any site has `"status": "pending"`
- [ ] `IonPumpClient` is an interface — production and noop implementations both exist
- [ ] `metamorph reconcile-ion-recipes --dry-run` makes no filesystem writes
- [ ] All unit and integration tests listed above pass
- [ ] A reconciliation run where all sites are already up to date completes in under 200ms

---

## Implementation Order for Reconciliation Milestone

Implement in this strict order. Do not skip ahead — each phase depends on the previous being correct.

1. **`types.go`** — Add `IonRecipeUpdate`, `IonRecipeFile`, `IonRecipeManifest`, `ReconcileResult`, `VersionEntry`, `VersionsFile`, `swapState`, `IonPumpClient`, `QuiesceResult`, `ReloadResult`
2. **`ionpump_client.go`** — Implement `HttpIonPumpClient` and `NoopIonPumpClient`
3. **`ionrecipes.go`** — Add `downloadIonRecipeToStaging`, `verifyIonRecipeStaging`, `atomicSwap`, `rollbackSwap`, `updateVersionsJSON` (no reconcile orchestration yet — just the primitives)
4. **`ionrecipes_test.go`** — Write all unit tests against the primitives. All must pass before proceeding.
5. **`ionrecipes.go`** — Add `ReconcileIonRecipe` and `ReconcileAllIonRecipes` using the verified primitives
6. **`ionrecipes_integration_test.go`** — Write integration tests. All must pass before proceeding.
7. **`ionrecipes.go`** — Add `recoverPendingSwap`, integrate into startup path
8. **`inspect.go`** — Add `reconcile-ion-recipes` command, `--dry-run` flag, `--force-swap` flag
9. **End-to-end validation** — Manually run against a real `ionsites/github.com/` seed directory, verify all phases execute and `versions.json` reflects the correct state

---

*This is Metamorph's highest-risk update path. Every shortcut taken here has a proportionally higher chance of leaving a user's automation silently broken. Build it to be boring and correct, not fast and clever.*
