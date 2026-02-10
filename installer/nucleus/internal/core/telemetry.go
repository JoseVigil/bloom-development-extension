package core

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/spf13/cobra"
)

type StreamInfo struct {
	Label      string `json:"label"`
	Path       string `json:"path"`
	Priority   int    `json:"priority"`
	FirstSeen  string `json:"first_seen"`
	LastUpdate string `json:"last_update"`
	Active     bool   `json:"active"`
}

type TelemetryData struct {
	Streams map[string]StreamInfo `json:"active_streams"`
}

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
		json.Unmarshal(data, &tm.data)
	}
	if tm.data.Streams == nil {
		tm.data.Streams = make(map[string]StreamInfo)
	}
}

func (tm *TelemetryManager) RegisterStream(id, label, path string, priority int) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	now := time.Now().Format(time.RFC3339)
	firstSeen := now
	if existing, exists := tm.data.Streams[id]; exists {
		firstSeen = existing.FirstSeen
	}

	tm.data.Streams[id] = StreamInfo{
		Label:      label,
		Path:       filepath.ToSlash(path),
		Priority:   priority,
		FirstSeen:  firstSeen,
		LastUpdate: now,
		Active:     true,
	}
	tm.dirty = true
}

func (tm *TelemetryManager) GetData() TelemetryData {
	tm.mu.RLock()
	defer tm.mu.RUnlock()
	copyStreams := make(map[string]StreamInfo)
	for k, v := range tm.data.Streams {
		copyStreams[k] = v
	}
	return TelemetryData{Streams: copyStreams}
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

// NewTelemetryCommand creates the telemetry command
func NewTelemetryCommand(c *Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "telemetry",
		Short: "Centralized log stream registration",
		Long:  "Manage telemetry streams in the central telemetry.json file",
		
		Annotations: map[string]string{
			"category": "TELEMETRY",
		},
	}

	cmd.AddCommand(newTelemetryRegisterCommand(c))

	return cmd
}

// newTelemetryRegisterCommand creates the register subcommand
func newTelemetryRegisterCommand(c *Core) *cobra.Command {
	var (
		streamID string
		label    string
		logPath  string
		priority int
	)

	cmd := &cobra.Command{
		Use:   "register",
		Short: "Register or update a telemetry stream",
		Long: `Register or update a telemetry stream in telemetry.json.

This command is the ONLY way to write to telemetry.json. External applications
must invoke this command instead of writing the file directly.

USAGE EXAMPLES:

  # Basic registration
  nucleus telemetry register \
    --stream electron_install \
    --label "📥 ELECTRON INSTALL" \
    --path "C:/Users/josev/AppData/Local/BloomNucleus/logs/install/electron_install.log" \
    --priority 2

  # From Node.js/Electron
  execFileSync('nucleus', [
    'telemetry', 'register',
    '--stream', 'electron_launch',
    '--label', '🚀 ELECTRON LAUNCH',
    '--path', logPath,
    '--priority', '2'
  ]);

  # From PowerShell
  nucleus telemetry register ` + "`" + `
    --stream worker ` + "`" + `
    --label "🧠 WORKER" ` + "`" + `
    --path "C:/logs/worker.log" ` + "`" + `
    --priority 3

RESULTING JSON STRUCTURE:

  {
    "active_streams": {
      "electron_install": {
        "label": "📥 ELECTRON INSTALL",
        "path": "C:/Users/josev/AppData/Local/BloomNucleus/logs/install/electron_install.log",
        "priority": 2,
        "last_update": "2026-02-10T13:42:11Z"
      }
    }
  }

PRIORITY LEVELS:
  1 = Critical   (system-critical, fatal errors, security)
  2 = Important  (main operations, significant events, warnings)
  3 = Informational (debug logs, build info, informational messages)

NOTES:
  - last_update is automatically generated in UTC ISO 8601 format
  - If stream exists, it will be overwritten
  - Command is silent on success (exit code 0)
  - Errors are printed to stderr (exit code != 0)
`,
		Args: cobra.NoArgs,
		
		Annotations: map[string]string{
			"category": "TELEMETRY",
			"json_response": `{
  "success": true,
  "stream_id": "electron_install",
  "message": "Stream registered successfully"
}`,
		},
		
		Example: `  nucleus telemetry register --stream test --label "🧪 TEST" --path "C:/logs/test.log" --priority 3
  nucleus --json telemetry register --stream worker --label "🧠 WORKER" --path "C:/logs/worker.log"`,
		
		RunE: func(cmd *cobra.Command, args []string) error {
			// Validate required flags
			if streamID == "" {
				return fmt.Errorf("--stream is required")
			}
			if label == "" {
				return fmt.Errorf("--label is required")
			}
			if logPath == "" {
				return fmt.Errorf("--path is required")
			}
			if priority < 1 || priority > 3 {
				return fmt.Errorf("--priority must be 1, 2, or 3")
			}

			// Get telemetry path from Core.Paths
			telemetryPath := filepath.Join(c.Paths.Logs, "telemetry.json")

			// Register the stream
			if err := registerStreamCLI(telemetryPath, streamID, label, logPath, priority); err != nil {
				return fmt.Errorf("failed to register stream: %w", err)
			}

			// Output based on mode
			if c.IsJSON {
				result := map[string]interface{}{
					"success":   true,
					"stream_id": streamID,
					"message":   "Stream registered successfully",
				}
				data, _ := json.MarshalIndent(result, "", "  ")
				fmt.Println(string(data))
				return nil
			}

			// Success - no output in normal mode (silent on success)
			return nil
		},
	}

	// Flags
	cmd.Flags().StringVar(&streamID, "stream", "", "Stream identifier (required)")
	cmd.Flags().StringVar(&label, "label", "", "Display label with emoji (required)")
	cmd.Flags().StringVar(&logPath, "path", "", "Absolute path to log file (required)")
	cmd.Flags().IntVar(&priority, "priority", 2, "Priority level: 1=critical, 2=important, 3=informational")

	cmd.MarkFlagRequired("stream")
	cmd.MarkFlagRequired("label")
	cmd.MarkFlagRequired("path")

	return cmd
}

// registerStreamCLI registers a stream in telemetry.json (CLI version - standalone)
func registerStreamCLI(telemetryPath, streamID, label, logPath string, priority int) error {
	// Create directory if it doesn't exist
	logsDir := filepath.Dir(telemetryPath)
	if err := os.MkdirAll(logsDir, 0755); err != nil {
		return fmt.Errorf("failed to create logs directory: %w", err)
	}

	// Read existing file or create empty structure
	var telemetry TelemetryData
	data, err := os.ReadFile(telemetryPath)
	if err != nil {
		if !os.IsNotExist(err) {
			return fmt.Errorf("failed to read telemetry file: %w", err)
		}
		// File doesn't exist - create empty structure
		telemetry.Streams = make(map[string]StreamInfo)
	} else {
		// Parse existing JSON
		if err := json.Unmarshal(data, &telemetry); err != nil {
			return fmt.Errorf("failed to parse telemetry JSON: %w", err)
		}
		// Ensure map exists
		if telemetry.Streams == nil {
			telemetry.Streams = make(map[string]StreamInfo)
		}
	}

	// Normalize path (use forward slashes for cross-platform)
	normalizedPath := filepath.ToSlash(logPath)

	// Get first_seen (preserve if updating existing stream)
	now := time.Now().UTC().Format(time.RFC3339)
	firstSeen := now
	if existing, exists := telemetry.Streams[streamID]; exists {
		firstSeen = existing.FirstSeen
	}

	// Create or update entry
	telemetry.Streams[streamID] = StreamInfo{
		Label:      label,
		Path:       normalizedPath,
		Priority:   priority,
		FirstSeen:  firstSeen,
		LastUpdate: now,
		Active:     true,
	}

	// Serialize to JSON with indentation
	output, err := json.MarshalIndent(telemetry, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}

	// Write file (atomic overwrite)
	if err := os.WriteFile(telemetryPath, output, 0644); err != nil {
		return fmt.Errorf("failed to write telemetry file: %w", err)
	}

	return nil
}