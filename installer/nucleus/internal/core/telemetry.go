package core

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gofrs/flock"
	"github.com/spf13/cobra"
)

// StreamPaths represents a log path that can be a single string or a list.
// JSON: "path": "single.log"  OR  "path": ["a.log", "b.log"]
// When reading, always use Paths() to iterate. When a single string is
// registered it is stored as a one-element slice internally.
type StreamPaths []string

func (sp StreamPaths) MarshalJSON() ([]byte, error) {
	if len(sp) == 1 {
		// Serialize single path as plain string for backwards compatibility
		return json.Marshal(sp[0])
	}
	return json.Marshal([]string(sp))
}

func (sp *StreamPaths) UnmarshalJSON(data []byte) error {
	// Try string first
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		*sp = StreamPaths{s}
		return nil
	}
	// Try array
	var arr []string
	if err := json.Unmarshal(data, &arr); err != nil {
		return err
	}
	*sp = StreamPaths(arr)
	return nil
}

// Primary returns the first path — used for backwards-compatible single-path access.
func (sp StreamPaths) Primary() string {
	if len(sp) == 0 {
		return ""
	}
	return sp[0]
}

// StreamInfo holds metadata for a single log stream.
// Categories is a slice so a stream can belong to multiple subsystems
// (e.g. nucleus_synapse belongs to both "nucleus" and "synapse").
// Path supports a single string or an array — see StreamPaths.
// Source is optional — identifies which application/binary writes this stream.
type StreamInfo struct {
	Label       string      `json:"label"`
	Path        StreamPaths `json:"path"`
	Priority    int         `json:"priority"`
	Categories  []string    `json:"categories"`
	Description string      `json:"description"`
	Source      string      `json:"source,omitempty"`
	FirstSeen   string      `json:"first_seen"`
	LastUpdate  string      `json:"last_update"`
	Active      bool        `json:"active"`
}

// TelemetryData is the root object written to telemetry.json.
type TelemetryData struct {
	Streams map[string]StreamInfo `json:"active_streams"`
}

// TelemetryManager is a long-running in-process writer used by nucleus itself.
// External processes MUST use the CLI command instead.
type TelemetryManager struct {
	mu    sync.RWMutex
	data  TelemetryData
	path  string
	dirty bool
	tlog  *Logger // structured log for all telemetry operations — nil until InitTelemetryLogger is called
}

var (
	telemetryInstance *TelemetryManager
	once              sync.Once
)

// AUTO-REGISTRO DEL COMANDO
func init() {
	RegisterCommand("TELEMETRY", NewTelemetryCommand)
}

// GetTelemetryManager returns the singleton in-process manager.
func GetTelemetryManager(logsDir, telemetryDir string) *TelemetryManager {
	once.Do(func() {
		telemetryInstance = &TelemetryManager{
			path: filepath.Join(telemetryDir, "telemetry.json"),
			data: TelemetryData{Streams: make(map[string]StreamInfo)},
		}
		telemetryInstance.load()
		go telemetryInstance.autoSaveLoop()
	})
	return telemetryInstance
}

func (tm *TelemetryManager) load() {
	// load() must NEVER call tlogf() while holding the mutex.
	// tlogf() acquires mu.RLock — calling it under mu.Lock causes a deadlock.
	// Instead, capture messages and log them after releasing the lock.
	var logLevel, logMsg string

	tm.mu.Lock()
	if data, err := os.ReadFile(tm.path); err == nil {
		if parseErr := json.Unmarshal(data, &tm.data); parseErr != nil {
			logLevel, logMsg = "ERROR", fmt.Sprintf("load: failed to parse telemetry.json — %v (path: %s)", parseErr, tm.path)
		} else {
			logLevel, logMsg = "DEBUG", fmt.Sprintf("load: parsed telemetry.json — %d streams (path: %s)", len(tm.data.Streams), tm.path)
		}
	} else if !os.IsNotExist(err) {
		logLevel, logMsg = "ERROR", fmt.Sprintf("load: failed to read telemetry.json — %v (path: %s)", err, tm.path)
	}
	if tm.data.Streams == nil {
		tm.data.Streams = make(map[string]StreamInfo)
	}
	tm.mu.Unlock()

	// Safe to log here — lock is released
	if logMsg != "" {
		tm.tlogf(logLevel, "%s", logMsg)
	}
}

// RegisterStream registers or updates a stream from within the nucleus process.
// categories is a slice like []string{"nucleus", "synapse"}.
// paths accepts one or more file paths — stored as StreamPaths (string or array in JSON).
func (tm *TelemetryManager) RegisterStream(id, label string, priority int, categories []string, description, source string, paths ...string) {
	tm.mu.Lock()
	// NOTE: no defer — we unlock manually before calling tlogf to avoid deadlock

	now := time.Now().UTC().Format(time.RFC3339)
	firstSeen := now
	if existing, exists := tm.data.Streams[id]; exists {
		firstSeen = existing.FirstSeen
	}

	normalizedPaths := make(StreamPaths, len(paths))
	for i, p := range paths {
		normalizedPaths[i] = filepath.ToSlash(p)
	}

	tm.data.Streams[id] = StreamInfo{
		Label:       label,
		Path:        normalizedPaths,
		Priority:    priority,
		Categories:  categories,
		Description: description,
		Source:      source,
		FirstSeen:   firstSeen,
		LastUpdate:  now,
		Active:      true,
	}
	tm.dirty = true
	// Capture for logging after lock release — tlogf acquires RLock, cannot call under Lock
	logMsg := fmt.Sprintf("RegisterStream id=%s label=%q categories=%v source=%q paths=%v",
		id, label, categories, source, normalizedPaths)
	tm.mu.Unlock()
	tm.tlogf("INFO", "%s", logMsg)
}

// InitTelemetryLogger wires a dedicated Logger into the TelemetryManager.
//
// Call this once — after GetTelemetryManager — from the application bootstrap
// (e.g. after InitPaths). It solves the chicken-and-egg bootstrap problem:
// the logger is created first, then the stream is registered into the manager
// that is already running.
//
//	tm := core.GetTelemetryManager(paths.LogsDir, paths.LogsDir)
//	tm.InitTelemetryLogger(&paths, jsonMode)
func (tm *TelemetryManager) InitTelemetryLogger(paths *Paths, jsonMode bool) {
	// The telemetry logger ALWAYS routes its console output to stderr,
	// regardless of the global jsonMode flag. This is critical: nucleus
	// subcommands (including `telemetry register`) write JSON to stdout for
	// external callers — any log line on stdout would corrupt that output.
	logger, err := InitLogger(paths, "TELEMETRY", true /* forceStderr */)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[telemetry] WARNING: could not init telemetry logger: %v\n", err)
		return
	}
	tm.mu.Lock()
	tm.tlog = logger
	tm.mu.Unlock()

	tm.tlogf("INFO", "TelemetryManager logger initialized — path: %s", tm.path)
}

// tlogf is a nil-safe helper: logs only when the telemetry logger is wired.
func (tm *TelemetryManager) tlogf(level, f string, v ...any) {
	tm.mu.RLock()
	l := tm.tlog
	tm.mu.RUnlock()
	if l == nil {
		return
	}
	switch level {
	case "INFO":
		l.Info(f, v...)
	case "ERROR":
		l.Error(f, v...)
	case "WARNING":
		l.Warning(f, v...)
	case "SUCCESS":
		l.Success(f, v...)
	case "DEBUG":
		l.Debug(f, v...)
	}
}

// GetData returns a safe copy of the current telemetry data.
func (tm *TelemetryManager) GetData() TelemetryData {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	copyStreams := make(map[string]StreamInfo, len(tm.data.Streams))
	for k, v := range tm.data.Streams {
		copyStreams[k] = v
	}
	return TelemetryData{Streams: copyStreams}
}

// GetStreamsByCategory returns all streams that contain the given category.
func (tm *TelemetryManager) GetStreamsByCategory(category string) map[string]StreamInfo {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	result := make(map[string]StreamInfo)
	for id, s := range tm.data.Streams {
		for _, c := range s.Categories {
			if c == category {
				result[id] = s
				break
			}
		}
	}
	return result
}

func (tm *TelemetryManager) autoSaveLoop() {
	ticker := time.NewTicker(3 * time.Second)
	for range ticker.C {
		tm.save()
	}
}

func (tm *TelemetryManager) save() {
	tm.mu.Lock()
	if !tm.dirty {
		tm.mu.Unlock()
		return
	}
	data, marshalErr := json.MarshalIndent(tm.data, "", "  ")
	if marshalErr != nil {
		tm.mu.Unlock()
		tm.tlogf("ERROR", "save: json.MarshalIndent failed — %v", marshalErr)
		return
	}
	streamCount := len(tm.data.Streams)
	tm.dirty = false
	tm.mu.Unlock()

	if writeErr := os.WriteFile(tm.path, data, 0644); writeErr != nil {
		tm.tlogf("ERROR", "save: WriteFile(%s) failed — %v", tm.path, writeErr)
		return
	}
	tm.tlogf("DEBUG", "save: telemetry.json written — %d streams (%d bytes)", streamCount, len(data))
}

// ============================================================================
// CLI COMMAND
// ============================================================================

// NewTelemetryCommand creates the top-level `nucleus telemetry` command.
func NewTelemetryCommand(c *Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "telemetry",
		Short: "Centralized log stream registration",
		Long:  "Manage telemetry streams in the central telemetry.json file.",
		Annotations: map[string]string{
			"category": "TELEMETRY",
		},
	}

	cmd.AddCommand(newTelemetryRegisterCommand(c))
	cmd.AddCommand(newTelemetryListCommand(c))

	return cmd
}

// newTelemetryRegisterCommand creates `nucleus telemetry register`.
// --category can be repeated: --category nucleus --category synapse
func newTelemetryRegisterCommand(c *Core) *cobra.Command {
	var (
		streamID    string
		label       string
		logPath     string
		priority    int
		categories  []string
		description string
		source      string
	)

	cmd := &cobra.Command{
		Use:   "register",
		Short: "Register or update a telemetry stream",
		Long: `Register or update a telemetry stream in telemetry.json.

This command is the ONLY way to write to telemetry.json. External applications
must invoke this command instead of writing the file directly.

CATEGORIES
  A stream can belong to one or more categories. Pass --category once per category.
  Valid categories: brain | build | conductor | launcher | nucleus | sentinel | synapse

  conductor has two stream types:
    conductor        — the main Conductor executable log
    conductor_setup  — the setup/install log

  nucleus_synapse belongs to both "nucleus" and "synapse":
    --category nucleus --category synapse

DESCRIPTION
  Free-text description of who writes this log and what it captures.
  Required — forces every process to document the purpose of its log.

  Examples:
    "Runtime log of the Brain core module — captures initialization, state transitions and errors"
    "Conductor setup/install session log — one file per install attempt"
    "Synapse orchestration log — records the full launch chain for a browser profile"

USAGE EXAMPLES

  # Single category
  nucleus telemetry register \
    --stream brain_core \
    --label "🧠 BRAIN CORE" \
    --path "C:/Users/josev/AppData/Local/BloomNucleus/logs/brain/core/brain_core_20260221.log" \
    --priority 2 \
    --category brain \
    --description "Runtime log of the Brain core module — captures initialization, state transitions and errors"

  # Multi-category (nucleus_synapse participates in both subsystems)
  nucleus telemetry register \
    --stream nucleus_synapse \
    --label "⚙️ SYNAPSE" \
    --path "C:/Users/josev/AppData/Local/BloomNucleus/logs/nucleus/nucleus_synapse_20260221.log" \
    --priority 2 \
    --category nucleus \
    --category synapse \
    --description "Synapse orchestration log — records the full launch chain for a browser profile"

  # From Node.js
  execFileSync('nucleus', [
    'telemetry', 'register',
    '--stream', 'conductor_setup_2026-02-21_13-26-59',
    '--label', '🔥 CONDUCTOR SETUP',
    '--path', logPath,
    '--priority', '2',
    '--category', 'conductor',
    '--description', 'Conductor setup/install session log — one file per install attempt',
  ]);

RESULTING JSON ENTRY

  "nucleus_synapse": {
    "label": "⚙️ SYNAPSE",
    "path": "C:/.../nucleus/nucleus_synapse_20260221.log",
    "priority": 2,
    "categories": ["nucleus", "synapse"],
    "description": "Synapse orchestration log — records the full launch chain for a browser profile",
    "first_seen": "2026-02-21T10:28:45Z",
    "last_update": "2026-02-21T10:28:45Z",
    "active": true
  }

PRIORITY LEVELS
  1 = Critical       system-critical components, fatal errors, security
  2 = Important      main operations, significant events, warnings
  3 = Informational  debug logs, build info, informational messages

NOTES
  - last_update is automatically generated in UTC ISO 8601
  - first_seen is preserved on updates
  - Idempotent: safe to call multiple times with the same stream_id
  - Silent on success (exit 0); errors go to stderr (exit != 0)
`,
		Args: cobra.NoArgs,
		Annotations: map[string]string{
			"category": "TELEMETRY",
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			if priority < 1 || priority > 3 {
				return fmt.Errorf("--priority must be 1, 2, or 3")
			}
			if len(categories) == 0 {
				return fmt.Errorf("at least one --category is required")
			}

			telemetryPath := filepath.Join(c.Paths.LogsDir, "telemetry.json")

			if err := registerStreamCLI(telemetryPath, streamID, label, logPath, description, source, priority, categories); err != nil {
				return fmt.Errorf("failed to register stream: %w", err)
			}

			if c.IsJSON {
				result := map[string]interface{}{
					"success":    true,
					"stream_id":  streamID,
					"categories": categories,
					"message":    "Stream registered successfully",
				}
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(data))
			}
			return nil
		},
	}

	cmd.Flags().StringVar(&streamID, "stream", "", "Stream identifier — lowercase snake_case (required)")
	cmd.Flags().StringVar(&label, "label", "", "Display label with emoji (required)")
	cmd.Flags().StringVar(&logPath, "path", "", "Absolute path to log file (required)")
	cmd.Flags().IntVar(&priority, "priority", 2, "Priority: 1=critical 2=important 3=informational")
	cmd.Flags().StringArrayVar(&categories, "category", []string{}, "Subsystem category (repeatable): brain|build|conductor|launcher|nucleus|sentinel|synapse")
	cmd.Flags().StringVar(&description, "description", "", "Who writes this log and what it captures (required)")

	cmd.Flags().StringVar(&source, "source", "", "Application that writes this log (optional): brain|nucleus|sentinel|conductor|launcher|host")

	_ = cmd.MarkFlagRequired("stream")
	_ = cmd.MarkFlagRequired("label")
	_ = cmd.MarkFlagRequired("path")
	_ = cmd.MarkFlagRequired("description")

	return cmd
}

// newTelemetryListCommand creates `nucleus telemetry list [--category <n>]`.
func newTelemetryListCommand(c *Core) *cobra.Command {
	var filterCategory string

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List registered telemetry streams, optionally filtered by category",
		Long: `Print all registered streams, optionally filtered by category.

  nucleus telemetry list
  nucleus telemetry list --category synapse
  nucleus --json telemetry list --category build
`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			telemetryPath := filepath.Join(c.Paths.LogsDir, "telemetry.json")

			raw, err := os.ReadFile(telemetryPath)
			if err != nil {
				return fmt.Errorf("cannot read telemetry.json: %w", err)
			}
			var telemetry TelemetryData
			if err := json.Unmarshal(raw, &telemetry); err != nil {
				return fmt.Errorf("cannot parse telemetry.json: %w", err)
			}

			result := make(map[string]StreamInfo)
			for id, s := range telemetry.Streams {
				if filterCategory == "" {
					result[id] = s
					continue
				}
				for _, cat := range s.Categories {
					if cat == filterCategory {
						result[id] = s
						break
					}
				}
			}

			if c.IsJSON {
				out, _ := json.MarshalIndent(map[string]interface{}{"active_streams": result}, "", "  ")
				fmt.Println(string(out))
				return nil
			}

			fmt.Printf("%-42s %-30s %-3s  %s\n", "STREAM", "CATEGORIES", "PRI", "LABEL")
			fmt.Printf("%-42s %-30s %-3s  %s\n",
				strings.Repeat("-", 42), strings.Repeat("-", 30), "---", "-----")
			for id, s := range result {
				fmt.Printf("%-42s %-30s %-3d  %s\n",
					id, strings.Join(s.Categories, ", "), s.Priority, s.Label)
			}
			return nil
		},
	}

	cmd.Flags().StringVar(&filterCategory, "category", "", "Filter by category: brain|build|conductor|launcher|nucleus|sentinel|synapse")
	return cmd
}

// ============================================================================
// INTERNAL HELPER
// ============================================================================

// lockPath returns the canonical path for the telemetry file lock.
// All processes — CLI and in-process — must use the same lock file.
func lockPath(telemetryPath string) string {
	return telemetryPath + ".lock"
}

// acquireLock opens (or creates) the lock file and blocks until an exclusive
// flock is obtained. The caller is responsible for calling fl.Unlock().
//
// A 30-second timeout prevents a crashed process from starving callers forever.
// TryLockContext is used so we can propagate a meaningful error on timeout.
func acquireLock(telemetryPath string) (*flock.Flock, func(), error) {
	lp := lockPath(telemetryPath)

	if err := os.MkdirAll(filepath.Dir(lp), 0755); err != nil {
		return nil, nil, fmt.Errorf("failed to create lock directory: %w", err)
	}

	fl := flock.New(lp)

	// FIX: 5s en lugar de 30s — fail fast en lugar de acumular procesos zombie
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	locked, err := fl.TryLockContext(ctx, 50*time.Millisecond)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to acquire telemetry lock: %w", err)
	}
	if !locked {
		return nil, nil, fmt.Errorf("timeout waiting for telemetry lock after 5s")
	}

	// FIX: cleanup borra el archivo físico — gofrs/flock en Windows no lo hace
	cleanup := func() {
		fl.Unlock()
		fl.Close() 
		os.Remove(lp) // ← este era el bug
	}

	return fl, cleanup, nil
}

// registerStreamCLI is the standalone atomic writer called by the CLI.
//
// Lock order (strict):
//  1. Acquire telemetry.json.lock  ← FIRST, before any I/O
//  2. Read telemetry.json
//  3. Mutate in-memory
//  4. Write telemetry.json.tmp
//  5. Rename .tmp → telemetry.json
//  6. Release lock
func registerStreamCLI(telemetryPath, streamID, label, logPath, description, source string, priority int, categories []string) error {
	// logEvent writes to the telemetry logger (file) AND stderr as fallback.
	// NEVER to stdout — registerStreamCLI is called from the CLI path where
	// stdout is reserved for JSON output consumed by external callers.
	logEvent := func(level, f string, v ...any) {
		msg := fmt.Sprintf(f, v...)
		// Always write to file logger if available
		if telemetryInstance != nil {
			telemetryInstance.mu.RLock()
			l := telemetryInstance.tlog
			telemetryInstance.mu.RUnlock()
			if l != nil {
				switch level {
				case "INFO":
					l.Info("%s", msg)
				case "ERROR":
					l.Error("%s", msg)
				case "SUCCESS":
					l.Success("%s", msg)
				}
				return
			}
		}
		// Fallback: stderr only — never stdout
		fmt.Fprintf(os.Stderr, "[telemetry/%s] %s\n", level, msg)
	}

	logsDir := filepath.Dir(telemetryPath)
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		logEvent("ERROR", "registerStreamCLI: MkdirAll(%s) failed — %v", logsDir, err)
		return fmt.Errorf("failed to create logs directory: %w", err)
	}

	// FIX: cleanup hace unlock + os.Remove del lock file
	_, cleanup, err := acquireLock(telemetryPath)
	if err != nil {
		logEvent("ERROR", "registerStreamCLI: acquireLock failed — %v", err)
		return err
	}
	defer cleanup()

	// Lee el estado completo — todos los streams existentes se preservan
	var telemetry TelemetryData
	raw, err := os.ReadFile(telemetryPath)
	if err != nil {
		if !os.IsNotExist(err) {
			logEvent("ERROR", "registerStreamCLI: ReadFile(%s) failed — %v", telemetryPath, err)
			return fmt.Errorf("failed to read telemetry file: %w", err)
		}
		telemetry.Streams = make(map[string]StreamInfo)
	} else {
		if err := json.Unmarshal(raw, &telemetry); err != nil {
			logEvent("ERROR", "registerStreamCLI: json.Unmarshal failed — %v (path: %s, raw bytes: %d)", err, telemetryPath, len(raw))
			return fmt.Errorf("failed to parse telemetry JSON: %w", err)
		}
		if telemetry.Streams == nil {
			telemetry.Streams = make(map[string]StreamInfo)
		}
	}

	// Merge — solo toca el stream target, los demás quedan intactos
	now := time.Now().UTC().Format(time.RFC3339)
	firstSeen := now
	if existing, exists := telemetry.Streams[streamID]; exists {
		firstSeen = existing.FirstSeen
	}

	telemetry.Streams[streamID] = StreamInfo{
		Label:       label,
		Path:        StreamPaths{filepath.ToSlash(logPath)},
		Priority:    priority,
		Categories:  categories,
		Description: description,
		Source:      source,
		FirstSeen:   firstSeen,
		LastUpdate:  now,
		Active:      true,
	}

	logEvent("INFO", "registerStreamCLI: registering id=%s label=%q categories=%v source=%q path=%s",
		streamID, label, categories, source, logPath)

	output, err := json.MarshalIndent(telemetry, "", "  ")
	if err != nil {
		logEvent("ERROR", "registerStreamCLI: json.MarshalIndent failed — %v", err)
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}

	tmpPath := telemetryPath + ".tmp"
	if err := os.WriteFile(tmpPath, output, 0644); err != nil {
		logEvent("ERROR", "registerStreamCLI: WriteFile(%s) failed — %v", tmpPath, err)
		return fmt.Errorf("failed to write temp file: %w", err)
	}

	if err := os.Rename(tmpPath, telemetryPath); err != nil {
		_ = os.Remove(tmpPath)
		logEvent("ERROR", "registerStreamCLI: Rename(%s → %s) failed — %v", tmpPath, telemetryPath, err)
		return fmt.Errorf("failed to rename temp file: %w", err)
	}

	logEvent("SUCCESS", "registerStreamCLI: telemetry.json updated — id=%s (%d streams total)", streamID, len(telemetry.Streams))
	return nil
}