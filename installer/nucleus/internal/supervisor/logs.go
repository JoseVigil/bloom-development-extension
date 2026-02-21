// File: internal/supervisor/logs.go
// Comando `nucleus logs` — filtra y lee logs de componentes via telemetry.json
// Categoría: DIAGNOSTICS
// Sigue Guía Maestra de Implementación Comandos NUCLEUS v2.0
package supervisor

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"nucleus/internal/core"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("DIAGNOSTICS", createLogsCommand)
}

// ── Telemetry index types ─────────────────────────────────────────────────────

// TelemetryStream representa un stream de log del sistema
type TelemetryStream struct {
	ID    string // clave del mapa en telemetry.json
	Label string `json:"label"`
	Path  string `json:"path"`
}

// TelemetryIndex es el índice en memoria de todos los streams
type TelemetryIndex struct {
	Streams []TelemetryStream
}

// telemetryStreamEntry representa un objeto de stream en telemetry.json
type telemetryStreamEntry struct {
	Label string `json:"label"`
	Path  string `json:"path"`
}

// ── Startup noise patterns (--no-startup) ────────────────────────────────────

var startupPatterns = []string{
	"_setup_specialized_namespaces",
	"SPECIALIZED LOGGER INITIALIZED",
	"Log File:",
	"Propagate to root:",
	"Telemetry registered:",
}

func isStartupLine(line string) bool {
	trimmed := strings.TrimSpace(line)
	if strings.HasPrefix(trimmed, "===") || strings.HasPrefix(trimmed, "---") {
		return true
	}
	for _, p := range startupPatterns {
		if strings.Contains(line, p) {
			return true
		}
	}
	return false
}

func isErrorLine(line string) bool {
	up := strings.ToUpper(line)
	return strings.Contains(up, "WARNING") ||
		strings.Contains(up, "ERROR") ||
		strings.Contains(up, "CRITICAL")
}

// ── Result type ───────────────────────────────────────────────────────────────

// LogsResult es la respuesta JSON del comando logs
type LogsResult struct {
	Success   bool     `json:"success"`
	Component string   `json:"component,omitempty"`
	LaunchID  string   `json:"launch_id,omitempty"`
	Lines     []string `json:"lines"`
	Count     int      `json:"count"`
}

// ── Command factory ───────────────────────────────────────────────────────────

func createLogsCommand(c *core.Core) *cobra.Command {
	var since string
	var errorsOnly bool
	var noStartup bool
	var launchID string
	var outputJSON bool

	cmd := &cobra.Command{
		Use:   "logs [component]",
		Short: "Read and filter component logs via telemetry.json index",
		Long: `Read logs for a specific component using telemetry.json as the index.

Component names are the stream IDs defined in telemetry.json:
  brain_server, brain_profile, brain_service, brain_server_event_bus,
  brain_server_manager, brain_core, sentinel_core, sentinel_startup,
  nucleus-synapse, nucleus-orchestration, nucleus-temporal,
  build_all, nucleus_build, sentinel_build, brain_build, conductor_launch_*

FILTERS:
  --since Xm/Xh    Only lines from the last X minutes or hours (e.g. 10m, 2h)
  --errors-only    Only WARNING and ERROR lines
  --no-startup     Exclude initialization noise blocks:
                     _setup_specialized_namespaces, SPECIALIZED LOGGER INITIALIZED,
                     Log File:, Propagate to root:, Telemetry registered:,
                     separator lines (=== or ---)

LAUNCH CORRELATION:
  --launch <id>    Correlate all log streams for a single launch.
                   Extracts the time window (±2 min) from the launch ID
                   timestamp and prints all matching lines, unified and
                   sorted by timestamp with [stream_id] prefix.

Requires: No special role
Effects:  Read-only`,

		Args: cobra.RangeArgs(0, 1),

		Annotations: map[string]string{
			"category": "DIAGNOSTICS",
			"json_response": `{
  "success": true,
  "component": "brain_server",
  "lines": [
    "2026-02-20 22:50:09 ERROR WinError 64: The specified network name is no longer available",
    "2026-02-20 22:50:09 ERROR Connection reset by peer"
  ],
  "count": 2
}`,
		},

		Example: `  nucleus logs brain_server
  nucleus logs brain_server --since 10m --errors-only --no-startup
  nucleus logs sentinel_core --since 1h
  nucleus logs brain_service --errors-only
  nucleus logs --launch 001_7a30f1a6_195107
  nucleus --json logs brain_server --since 5m --errors-only`,

		Run: func(cmd *cobra.Command, args []string) {
			// Inherit global --json flag
			if c.IsJSON {
				outputJSON = true
			}

			logsDir := getLogsDir(c)
			telemetryPath := filepath.Join(logsDir, "telemetry.json")

			index, err := loadTelemetryIndex(telemetryPath)
			if err != nil {
				c.Logger.Printf("[ERROR] Cannot load telemetry.json: %v", err)
				os.Exit(1)
			}

			// ── --launch mode ─────────────────────────────────────────────
			if launchID != "" {
				lines, err := runLaunchCorrelation(index, launchID, logsDir)
				if err != nil {
					c.Logger.Printf("[ERROR] %v", err)
					os.Exit(1)
				}
				if outputJSON {
					outputLogsJSON(&LogsResult{
						Success:  true,
						LaunchID: launchID,
						Lines:    lines,
						Count:    len(lines),
					})
					return
				}
				for _, l := range lines {
					fmt.Println(l)
				}
				c.Logger.Printf("[INFO] (%d lines in ±2min window of launch %s)", len(lines), launchID)
				return
			}

			// ── Single component mode ─────────────────────────────────────
			if len(args) == 0 {
				c.Logger.Printf("[ERROR] Provide a component name or use --launch <id>")
				c.Logger.Printf("[INFO] Available components:")
				for _, s := range index.Streams {
					c.Logger.Printf("[INFO]   %s", s.ID)
				}
				os.Exit(1)
			}

			componentID := args[0]
			stream := findStream(index, componentID)
			if stream == nil {
				c.Logger.Printf("[ERROR] Unknown component: %s", componentID)
				c.Logger.Printf("[INFO] Available:")
				for _, s := range index.Streams {
					c.Logger.Printf("[INFO]   %s", s.ID)
				}
				os.Exit(1)
			}

			sinceDur, err := parseSinceDuration(since)
			if err != nil {
				c.Logger.Printf("[ERROR] Invalid --since value %q: %v", since, err)
				os.Exit(1)
			}

			logPath := toAbsPath(stream.Path, logsDir)
			lines, err := filterLog(logPath, sinceDur, errorsOnly, noStartup)
			if err != nil {
				c.Logger.Printf("[ERROR] %v", err)
				os.Exit(1)
			}

			if outputJSON {
				outputLogsJSON(&LogsResult{
					Success:   true,
					Component: componentID,
					Lines:     lines,
					Count:     len(lines),
				})
				return
			}

			for _, l := range lines {
				fmt.Println(l)
			}
			c.Logger.Printf("[INFO] (%d lines from %s)", len(lines), componentID)
		},
	}

	cmd.Flags().StringVar(&since, "since", "", "Show lines from the last X duration (e.g. 5m, 2h, 30s)")
	cmd.Flags().BoolVar(&errorsOnly, "errors-only", false, "Show only WARNING and ERROR lines")
	cmd.Flags().BoolVar(&noStartup, "no-startup", false, "Exclude initialization/startup noise lines")
	cmd.Flags().StringVar(&launchID, "launch", "", "Correlate all logs for a launch ID (e.g. 001_7a30f1a6_195107)")
	cmd.Flags().BoolVar(&outputJSON, "json", false, "Output result as JSON")

	return cmd
}

// ── JSON output helper ────────────────────────────────────────────────────────

func outputLogsJSON(result *LogsResult) {
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		fmt.Fprintf(os.Stderr, `{"success":false,"error":"marshal failed"}`+"\n")
		return
	}
	fmt.Println(string(data))
}

// ── Telemetry loader ──────────────────────────────────────────────────────────

// loadTelemetryIndex lee telemetry.json y retorna el índice de streams.
// Soporta el formato real: {"active_streams": {"id": {"label":..., "path":...}}}
// Con fallback a {"streams": [...]} y a flat map {"id": {"path":...}}
func loadTelemetryIndex(path string) (*TelemetryIndex, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", path, err)
	}

	var raw struct {
		ActiveStreams map[string]telemetryStreamEntry `json:"active_streams"`
		Streams      []struct {
			ID    string `json:"id"`
			Label string `json:"label"`
			Path  string `json:"path"`
		} `json:"streams"`
	}

	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("cannot parse telemetry.json: %w", err)
	}

	index := &TelemetryIndex{}

	// Formato real: active_streams map
	if len(raw.ActiveStreams) > 0 {
		for id, entry := range raw.ActiveStreams {
			index.Streams = append(index.Streams, TelemetryStream{
				ID:    id,
				Label: entry.Label,
				Path:  entry.Path,
			})
		}
		return index, nil
	}

	// Fallback: legacy streams array
	if len(raw.Streams) > 0 {
		for _, s := range raw.Streams {
			index.Streams = append(index.Streams, TelemetryStream{ID: s.ID, Label: s.Label, Path: s.Path})
		}
		return index, nil
	}

	// Last resort: flat root map
	var flat map[string]telemetryStreamEntry
	if err := json.Unmarshal(data, &flat); err == nil {
		for id, entry := range flat {
			index.Streams = append(index.Streams, TelemetryStream{ID: id, Label: entry.Label, Path: entry.Path})
		}
	}

	return index, nil
}

func findStream(index *TelemetryIndex, id string) *TelemetryStream {
	for i := range index.Streams {
		if index.Streams[i].ID == id {
			return &index.Streams[i]
		}
	}
	return nil
}

// ── Log filtering ─────────────────────────────────────────────────────────────

func parseSinceDuration(s string) (time.Duration, error) {
	if s == "" {
		return 0, nil
	}
	return time.ParseDuration(s)
}

func tryParseTimestamp(line string) (time.Time, bool) {
	layouts := []struct {
		length int
		layout string
	}{
		{23, "2006-01-02 15:04:05.000"},
		{23, "2006-01-02T15:04:05.000"},
		{19, "2006-01-02 15:04:05"},
		{19, "2006-01-02T15:04:05"},
	}
	for _, l := range layouts {
		if len(line) >= l.length {
			t, err := time.ParseInLocation(l.layout, line[:l.length], time.Local)
			if err == nil {
				return t, true
			}
		}
	}
	return time.Time{}, false
}

func filterLog(path string, since time.Duration, errorsOnly, noStartup bool) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("opening %s: %w", path, err)
	}
	defer f.Close()

	cutoff := time.Time{}
	if since > 0 {
		cutoff = time.Now().Add(-since)
	}

	var out []string
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 512*1024), 512*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if noStartup && isStartupLine(line) {
			continue
		}
		if errorsOnly && !isErrorLine(line) {
			continue
		}
		if !cutoff.IsZero() {
			if ts, ok := tryParseTimestamp(line); ok && ts.Before(cutoff) {
				continue
			}
		}
		out = append(out, line)
	}

	if err := scanner.Err(); err != nil {
		return out, fmt.Errorf("scanning %s: %w", path, err)
	}
	return out, nil
}

// ── --launch correlation ──────────────────────────────────────────────────────

type timedLine struct {
	ts     time.Time
	stream string
	line   string
}

// runLaunchCorrelation extrae el timestamp del launch ID, busca en todos los
// streams las líneas dentro de ±2 minutos y retorna el resultado unificado.
func runLaunchCorrelation(index *TelemetryIndex, launchID string, logsDir string) ([]string, error) {
	launchTime, err := parseLaunchTime(launchID)
	if err != nil {
		return nil, fmt.Errorf("cannot parse launch time from %q: %w", launchID, err)
	}

	windowStart := launchTime.Add(-2 * time.Minute)
	windowEnd := launchTime.Add(2 * time.Minute)

	var allLines []timedLine

	for _, stream := range index.Streams {
		logPath := toAbsPath(stream.Path, logsDir)
		f, err := os.Open(logPath)
		if err != nil {
			continue // stream ausente — saltar silenciosamente
		}
		scanner := bufio.NewScanner(f)
		scanner.Buffer(make([]byte, 512*1024), 512*1024)
		for scanner.Scan() {
			line := scanner.Text()
			ts, ok := tryParseTimestamp(line)
			if !ok || ts.Before(windowStart) || ts.After(windowEnd) {
				continue
			}
			allLines = append(allLines, timedLine{ts: ts, stream: stream.ID, line: line})
		}
		f.Close()
	}

	sort.Slice(allLines, func(i, j int) bool {
		return allLines[i].ts.Before(allLines[j].ts)
	})

	header := fmt.Sprintf("── Launch %s  window %s → %s ──",
		launchID, windowStart.Format("15:04:05"), windowEnd.Format("15:04:05"))

	result := []string{header}
	for _, tl := range allLines {
		result = append(result, fmt.Sprintf("[%s] %s", tl.stream, tl.line))
	}
	if len(allLines) == 0 {
		result = append(result, "(no log lines found in the ±2 minute window)")
	}
	return result, nil
}

// parseLaunchTime extrae la hora HHMMSS del último segmento de un launch ID
// como "001_7a30f1a6_195107" → 19:51:07
func parseLaunchTime(id string) (time.Time, error) {
	parts := strings.Split(id, "_")
	if len(parts) < 3 {
		return time.Time{}, fmt.Errorf("expected NNN_<hex>_HHMMSS, got %q", id)
	}
	hhmmss := parts[len(parts)-1]
	if len(hhmmss) != 6 {
		return time.Time{}, fmt.Errorf("time segment %q must be 6 digits", hhmmss)
	}
	hh, _ := strconv.Atoi(hhmmss[0:2])
	mm, _ := strconv.Atoi(hhmmss[2:4])
	ss, _ := strconv.Atoi(hhmmss[4:6])

	now := time.Now()
	t := time.Date(now.Year(), now.Month(), now.Day(), hh, mm, ss, 0, time.Local)
	// Si cayó a futuro (medianoche cruzada), retroceder un día
	if t.After(now.Add(5 * time.Minute)) {
		t = t.Add(-24 * time.Hour)
	}
	return t, nil
}

// ── Path resolver ─────────────────────────────────────────────────────────────

// toAbsPath retorna p como ruta absoluta. Si ya es absoluta (C:/... o /...),
// la convierte con FromSlash sin joinear con base.
func toAbsPath(p, base string) string {
	// Windows: "C:/..." o "C:\..."
	if len(p) >= 3 && p[1] == ':' && (p[2] == '/' || p[2] == '\\') {
		return filepath.FromSlash(p)
	}
	if filepath.IsAbs(p) {
		return filepath.FromSlash(p)
	}
	return filepath.Join(base, p)
}