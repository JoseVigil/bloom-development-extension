package core

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/spf13/cobra"
)

// StreamInfo holds metadata for a single log stream.
// Categories is a slice so a stream can belong to multiple subsystems
// (e.g. nucleus_synapse belongs to both "nucleus" and "synapse").
type StreamInfo struct {
	Label       string   `json:"label"`
	Path        string   `json:"path"`
	Priority    int      `json:"priority"`
	Categories  []string `json:"categories"`
	Description string   `json:"description"`
	FirstSeen   string   `json:"first_seen"`
	LastUpdate  string   `json:"last_update"`
	Active      bool     `json:"active"`
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
	tm.mu.Lock()
	defer tm.mu.Unlock()
	if data, err := os.ReadFile(tm.path); err == nil {
		_ = json.Unmarshal(data, &tm.data)
	}
	if tm.data.Streams == nil {
		tm.data.Streams = make(map[string]StreamInfo)
	}
}

// RegisterStream registers or updates a stream from within the nucleus process.
// categories is a slice like []string{"nucleus", "synapse"}.
func (tm *TelemetryManager) RegisterStream(id, label, path string, priority int, categories []string, description string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	now := time.Now().UTC().Format(time.RFC3339)
	firstSeen := now
	if existing, exists := tm.data.Streams[id]; exists {
		firstSeen = existing.FirstSeen
	}

	tm.data.Streams[id] = StreamInfo{
		Label:       label,
		Path:        filepath.ToSlash(path),
		Priority:    priority,
		Categories:  categories,
		Description: description,
		FirstSeen:   firstSeen,
		LastUpdate:  now,
		Active:      true,
	}
	tm.dirty = true
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
	data, _ := json.MarshalIndent(tm.data, "", "  ")
	tm.dirty = false
	tm.mu.Unlock()
	_ = os.WriteFile(tm.path, data, 0644)
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

			telemetryPath := filepath.Join(c.Paths.Logs, "telemetry.json")

			if err := registerStreamCLI(telemetryPath, streamID, label, logPath, description, priority, categories); err != nil {
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
			telemetryPath := filepath.Join(c.Paths.Logs, "telemetry.json")

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

// registerStreamCLI is the standalone atomic writer called by the CLI.
func registerStreamCLI(telemetryPath, streamID, label, logPath, description string, priority int, categories []string) error {
	logsDir := filepath.Dir(telemetryPath)
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		return fmt.Errorf("failed to create logs directory: %w", err)
	}

	var telemetry TelemetryData
	raw, err := os.ReadFile(telemetryPath)
	if err != nil {
		if !os.IsNotExist(err) {
			return fmt.Errorf("failed to read telemetry file: %w", err)
		}
		telemetry.Streams = make(map[string]StreamInfo)
	} else {
		if err := json.Unmarshal(raw, &telemetry); err != nil {
			return fmt.Errorf("failed to parse telemetry JSON: %w", err)
		}
		if telemetry.Streams == nil {
			telemetry.Streams = make(map[string]StreamInfo)
		}
	}

	now := time.Now().UTC().Format(time.RFC3339)
	firstSeen := now
	if existing, exists := telemetry.Streams[streamID]; exists {
		firstSeen = existing.FirstSeen
	}

	telemetry.Streams[streamID] = StreamInfo{
		Label:       label,
		Path:        filepath.ToSlash(logPath),
		Priority:    priority,
		Categories:  categories,
		Description: description,
		FirstSeen:   firstSeen,
		LastUpdate:  now,
		Active:      true,
	}

	output, err := json.MarshalIndent(telemetry, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}

	// Atomic write: temp file + rename
	tmpPath := telemetryPath + ".tmp"
	if err := os.WriteFile(tmpPath, output, 0644); err != nil {
		return fmt.Errorf("failed to write temp file: %w", err)
	}
	if err := os.Rename(tmpPath, telemetryPath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("failed to rename temp file: %w", err)
	}

	return nil
}