// File: internal/orchestration/commands/logs.go
// Categoría: ORCHESTRATION
// Sigue Guía Maestra de Implementación Comandos NUCLEUS v2.0
//
// Comandos implementados:
//   nucleus logs <stream> [--since Xm/Xh] [--errors-only] [--no-startup] [--tail]
//   nucleus logs --launch <launch_id> [--profile <profile_id>] [--out <file>]
//   nucleus logs --summary [--since Xm]
package commands

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"nucleus/internal/core"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("ORCHESTRATION", createLogsCommand)
}

// ── telemetry.json structures ─────────────────────────────────────────────────

type telemetryFile struct {
	ActiveStreams map[string]telemetryStream `json:"active_streams"`
}

type telemetryStream struct {
	Path        string   `json:"path"`
	Label       string   `json:"label,omitempty"`
	Categories  []string `json:"categories"`
	Description string   `json:"description,omitempty"`
	LastUpdate  string   `json:"last_update,omitempty"`
}

// ── startup noise patterns (Brain CLI) ───────────────────────────────────────

var startupNoisePatterns = []string{
	"_setup_specialized_namespaces",
	"SPECIALIZED LOGGER INITIALIZED",
	"Log File:",
	"Propagate to root:",
	"Telemetry registered:",
}

func isStartupNoise(line string) bool {
	for _, p := range startupNoisePatterns {
		if strings.Contains(line, p) {
			return true
		}
	}
	// Separator lines
	trimmed := strings.TrimSpace(line)
	if strings.Count(trimmed, "=") == len(trimmed) && len(trimmed) > 3 {
		return true
	}
	if strings.Count(trimmed, "-") == len(trimmed) && len(trimmed) > 3 {
		return true
	}
	return false
}

// ── time helpers ──────────────────────────────────────────────────────────────

// parseSinceDuration parses "5m", "2h", "30s" into a time.Duration.
func parseSinceDuration(since string) (time.Duration, error) {
	since = strings.TrimSpace(strings.ToLower(since))
	if since == "" {
		return 0, nil
	}
	// Try Go native format first (e.g. "5m", "2h30m")
	if d, err := time.ParseDuration(since); err == nil {
		return d, nil
	}
	// Accept shorthand like "5m", "2h" without explicit unit suffix already handled above
	return 0, fmt.Errorf("invalid duration %q — use formats like 5m, 2h, 30s", since)
}

// parseLineTimestamp tries to extract a timestamp from a log line.
// Supports: "2006/01/02 15:04:05", "2006-01-02T15:04:05", ISO8601 with Z/offset.
// Returns zero time on failure.
func parseLineTimestamp(line string) time.Time {
	if len(line) < 10 {
		return time.Time{}
	}
	formats := []string{
		"2006/01/02 15:04:05",
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05",
		"2006-01-02T15:04:05.999999999Z",
		"2006-01-02T15:04:05.999999999Z07:00",
	}
	// Try the first 30 characters of the line in various positions
	candidate := strings.TrimSpace(line)
	for _, format := range formats {
		n := len(format)
		if len(candidate) >= n {
			if t, err := time.Parse(format, candidate[:n]); err == nil {
				return t
			}
		}
	}
	return time.Time{}
}

// ── telemetry loader ──────────────────────────────────────────────────────────

func loadTelemetry(logsDir string) (*telemetryFile, error) {
	path := filepath.Join(logsDir, "telemetry.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("cannot read telemetry.json: %w", err)
	}
	var tf telemetryFile
	if err := json.Unmarshal(data, &tf); err != nil {
		return nil, fmt.Errorf("invalid telemetry.json: %w", err)
	}
	return &tf, nil
}

// ── stream reader ─────────────────────────────────────────────────────────────

type streamReadOptions struct {
	since      time.Duration
	errorsOnly bool
	noStartup  bool
	prefix     string
}

// readStream reads lines from a log file applying filters. Returns filtered lines.
// If the file does not exist, returns an empty slice (stream inactive).
func readStream(path string, opts streamReadOptions) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // inactive stream
		}
		return nil, err
	}
	defer f.Close()

	var cutoff time.Time
	if opts.since > 0 {
		cutoff = time.Now().Add(-opts.since)
	}

	var result []string
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()

		if opts.noStartup && isStartupNoise(line) {
			continue
		}

		if opts.errorsOnly {
			upper := strings.ToUpper(line)
			if !strings.Contains(upper, "WARNING") && !strings.Contains(upper, "ERROR") {
				continue
			}
		}

		if !cutoff.IsZero() {
			ts := parseLineTimestamp(line)
			if !ts.IsZero() && ts.Before(cutoff) {
				continue
			}
		}

		if opts.prefix != "" {
			result = append(result, fmt.Sprintf("[%s] %s", opts.prefix, line))
		} else {
			result = append(result, line)
		}
	}
	return result, scanner.Err()
}

// readStreamWindow reads lines within [start, end] time window.
func readStreamWindow(path string, start, end time.Time, noStartup bool) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var result []string
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if noStartup && isStartupNoise(line) {
			continue
		}
		ts := parseLineTimestamp(line)
		if ts.IsZero() {
			// If we can't parse timestamp, include if window is not strict
			result = append(result, line)
			continue
		}
		if !ts.Before(start) && !ts.After(end) {
			result = append(result, line)
		}
	}
	return result
}

// ── Parent command ────────────────────────────────────────────────────────────

func createLogsCommand(c *core.Core) *cobra.Command {
	var (
		launchID  string
		profileID string
		outFile   string
		summary   bool
		since     string
		errOnly   bool
		noStartup bool
		tailMode  bool
		jsonOut   bool
	)

	cmd := &cobra.Command{
		Use:   "logs [stream]",
		Short: "Read, trace and analyze Nucleus log streams",
		Long: `Access and correlate logs across all Nucleus components.

Three modes of operation:

  1. STREAM READER — read a single named stream:
       nucleus logs nucleus_synapse --since 5m --errors-only

  2. SYNAPSE TRACE — full correlated trace for a launch:
       nucleus logs --launch 001_0b31f2fa_033803 --profile <uuid>
       Produces: logs/synapse/trace_<launch_id>.log

  3. SUMMARY — dashboard of all active streams:
       nucleus logs --summary --since 10m

Stream names come from the keys in telemetry.json (active_streams).`,

		Annotations: map[string]string{
			"category": "ORCHESTRATION",
			"json_response": `{
  "success": true,
  "mode": "stream|launch|summary",
  "lines": 42,
  "output_file": "logs/synapse_trace/trace_001_0b31f2fa_033803.log"
}`,
		},

		Example: `  nucleus logs nucleus_synapse --since 5m
  nucleus logs sentinel_core --errors-only --no-startup
  nucleus logs --launch 001_0b31f2fa_033803 --profile 0b31f2fa-1463-4919-b63e-96db6e36744c
  nucleus logs --summary --since 10m
  nucleus --json logs --launch 001_0b31f2fa_033803 --profile 0b31f2fa-1463-4919-b63e-96db6e36744c`,

		RunE: func(cmd *cobra.Command, args []string) error {
			if c.IsJSON {
				jsonOut = true
			}

			// ── MODE DISPATCH ────────────────────────────────────────────

			switch {
			case launchID != "":
				return runLaunchTrace(c, launchID, profileID, outFile, jsonOut)

			case summary:
				return runSummary(c, since, jsonOut)

			case len(args) == 1:
				return runStreamReader(c, args[0], since, errOnly, noStartup, tailMode, jsonOut)

			default:
				return fmt.Errorf("specify a stream name, --launch <id>, or --summary\nRun 'nucleus logs --help' for usage")
			}
		},
	}

	// Flags
	cmd.Flags().StringVar(&launchID, "launch", "", "Launch ID to produce a full synapse trace")
	cmd.Flags().StringVar(&profileID, "profile", "", "Profile ID (required for Chrome log analysis with --launch)")
	cmd.Flags().StringVar(&outFile, "out", "", "Output file path (default: logs/synapse/trace_<launch_id>.log)")
	cmd.Flags().BoolVar(&summary, "summary", false, "Show dashboard of all streams")
	cmd.Flags().StringVar(&since, "since", "", "Only show lines from last X minutes/hours (e.g. 5m, 2h)")
	cmd.Flags().BoolVar(&errOnly, "errors-only", false, "Only show WARNING or ERROR lines")
	cmd.Flags().BoolVar(&noStartup, "no-startup", false, "Exclude Brain startup noise patterns")
	cmd.Flags().BoolVar(&tailMode, "tail", false, "Live tail mode (follow file)")
	cmd.Flags().BoolVar(&jsonOut, "json", false, "Output in JSON format")

	return cmd
}

// ═════════════════════════════════════════════════════════════════════════════
// MODE 1: STREAM READER
// ═════════════════════════════════════════════════════════════════════════════

func runStreamReader(c *core.Core, streamName, since string, errOnly, noStartup, tailMode, jsonOut bool) error {
	tf, err := loadTelemetry(c.Paths.Logs)
	if err != nil {
		return err
	}

	stream, ok := tf.ActiveStreams[streamName]
	if !ok {
		// List valid streams
		var valid []string
		for k := range tf.ActiveStreams {
			valid = append(valid, k)
		}
		sort.Strings(valid)
		return fmt.Errorf("unknown stream %q\n\nAvailable streams:\n  %s", streamName, strings.Join(valid, "\n  "))
	}

	var dur time.Duration
	if since != "" {
		dur, err = parseSinceDuration(since)
		if err != nil {
			return err
		}
	}

	opts := streamReadOptions{
		since:      dur,
		errorsOnly: errOnly,
		noStartup:  noStartup,
		prefix:     streamName,
	}

	// Live tail mode
	if tailMode {
		return tailStream(stream.Path, opts)
	}

	lines, err := readStream(stream.Path, opts)
	if err != nil {
		return fmt.Errorf("reading stream %s: %w", streamName, err)
	}

	if jsonOut {
		outputJSON(map[string]interface{}{
			"success":     true,
			"mode":        "stream",
			"stream":      streamName,
			"path":        stream.Path,
			"lines_count": len(lines),
			"lines":       lines,
		})
		return nil
	}

	if len(lines) == 0 {
		fmt.Printf("[%s] (no matching lines)\n", streamName)
		return nil
	}
	for _, l := range lines {
		fmt.Println(l)
	}
	return nil
}

// tailStream follows a file like tail -f.
func tailStream(path string, opts streamReadOptions) error {
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("cannot open %s: %w", path, err)
	}
	defer f.Close()

	// Seek to end
	if _, err := f.Seek(0, io.SeekEnd); err != nil {
		return err
	}

	reader := bufio.NewReader(f)
	fmt.Printf("Following %s (Ctrl+C to stop)\n\n", path)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				time.Sleep(200 * time.Millisecond)
				continue
			}
			return err
		}
		line = strings.TrimRight(line, "\r\n")
		if opts.noStartup && isStartupNoise(line) {
			continue
		}
		if opts.errorsOnly {
			upper := strings.ToUpper(line)
			if !strings.Contains(upper, "WARNING") && !strings.Contains(upper, "ERROR") {
				continue
			}
		}
		if opts.prefix != "" {
			fmt.Printf("[%s] %s\n", opts.prefix, line)
		} else {
			fmt.Println(line)
		}
	}
}

// ═════════════════════════════════════════════════════════════════════════════
// MODE 2: SYNAPSE TRACE — nucleus logs --launch <id>
// ═════════════════════════════════════════════════════════════════════════════

// launchedEvent holds parsed metadata from the synapse log for a launch.
type launchedEvent struct {
	timestamp time.Time
	raw       string
}

// findLaunchTimestamp scans nucleus_synapse log for the given launchID,
// returning the timestamp of its first mention.
func findLaunchTimestamp(synapseLogPath, launchID string) (time.Time, error) {
	f, err := os.Open(synapseLogPath)
	if err != nil {
		return time.Time{}, fmt.Errorf("cannot open synapse log %s: %w", synapseLogPath, err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, launchID) {
			ts := parseLineTimestamp(line)
			if !ts.IsZero() {
				return ts, nil
			}
		}
	}
	return time.Time{}, fmt.Errorf("launch_id %q not found in %s", launchID, synapseLogPath)
}

// timedLine holds a log line with its parsed timestamp and origin stream.
type timedLine struct {
	ts     time.Time
	stream string
	text   string
}

// collectWindowLines collects all lines from all streams within the time window.
func collectWindowLines(tf *telemetryFile, start, end time.Time) []timedLine {
	var all []timedLine
	for streamID, stream := range tf.ActiveStreams {
		lines := readStreamWindow(stream.Path, start, end, false)
		for _, l := range lines {
			ts := parseLineTimestamp(l)
			all = append(all, timedLine{ts: ts, stream: streamID, text: l})
		}
	}
	// Sort by timestamp, then by stream name for stability
	sort.SliceStable(all, func(i, j int) bool {
		if all[i].ts.IsZero() || all[j].ts.IsZero() {
			return all[i].stream < all[j].stream
		}
		return all[i].ts.Before(all[j].ts)
	})
	return all
}

// invokeBrainCLI runs a Brain CLI command and returns parsed JSON output.
// Returns (outputFile, rawOutput, error).
func invokeBrainCLI(binDir string, args ...string) (string, string, error) {
	brainExe := filepath.Join(binDir, "brain", "brain.exe")
	if _, err := os.Stat(brainExe); err != nil {
		// Try PATH
		brainExe = "brain"
	}

	allArgs := append([]string{"--json"}, args...)
	cmd := exec.Command(brainExe, allArgs...)
	out, err := cmd.Output()
	if err != nil {
		return "", string(out), fmt.Errorf("brain %s: %w (output: %s)", strings.Join(args, " "), err, string(out))
	}

	// Parse JSON output to extract output_file
	var result map[string]interface{}
	if jsonErr := json.Unmarshal(out, &result); jsonErr == nil {
		if outFile, ok := result["output_file"].(string); ok {
			return outFile, string(out), nil
		}
	}
	return "", string(out), nil
}

// readFileContents reads a file's content; returns placeholder on failure.
func readFileContents(path string) string {
	if path == "" {
		return "(not generated)"
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Sprintf("(file not found: %s)", path)
	}
	return string(data)
}

// extractSummaryFacts scans the unified timeline for key facts.
type traceSummary struct {
	launchTime     string
	chromePID      string
	extensionOK    string
	errorCount     int
	warningCount   int
	streamsActive  int
	totalLines     int
}

func extractSummaryFacts(lines []timedLine) traceSummary {
	s := traceSummary{
		launchTime:  "unknown",
		chromePID:   "unknown",
		extensionOK: "unknown",
	}
	for _, l := range lines {
		s.totalLines++
		upper := strings.ToUpper(l.text)
		if strings.Contains(upper, "ERROR") {
			s.errorCount++
		} else if strings.Contains(upper, "WARNING") {
			s.warningCount++
		}
		// Chrome PID
		if s.chromePID == "unknown" && strings.Contains(l.text, "PID=") {
			pidIdx := strings.Index(l.text, "PID=")
			rest := l.text[pidIdx+4:]
			end := strings.IndexAny(rest, " \t\r\n")
			if end < 0 {
				end = len(rest)
			}
			s.chromePID = strings.TrimSpace(rest[:end])
		}
		// Extension
		if s.extensionOK == "unknown" {
			if strings.Contains(l.text, "extension loaded") || strings.Contains(l.text, "Extension loaded") {
				s.extensionOK = "true"
			} else if strings.Contains(upper, "EXTENSION") && strings.Contains(upper, "ERROR") {
				s.extensionOK = "false"
			}
		}
	}
	// streams active
	seen := map[string]struct{}{}
	for _, l := range lines {
		seen[l.stream] = struct{}{}
	}
	s.streamsActive = len(seen)
	if len(lines) > 0 && !lines[0].ts.IsZero() {
		s.launchTime = lines[0].ts.Format("15:04:05")
	}
	return s
}

// streamSymbol returns a simple emoji prefix for known stream types.
func streamSymbol(stream, text string) string {
	upper := strings.ToUpper(text)
	if strings.Contains(upper, "ERROR") {
		return "❌"
	}
	if strings.Contains(upper, "WARNING") {
		return "⚠️ "
	}
	if strings.Contains(upper, "SUCCESS") || strings.Contains(text, "✅") {
		return "✅"
	}
	if strings.Contains(stream, "synapse") {
		return "🚀"
	}
	if strings.Contains(stream, "sentinel") {
		return "🛡️ "
	}
	if strings.Contains(stream, "brain") {
		return "🧠"
	}
	return "  "
}

func runLaunchTrace(c *core.Core, launchID, profileID, outFilePath string, jsonOut bool) error {
	tf, err := loadTelemetry(c.Paths.Logs)
	if err != nil {
		return err
	}

	// ── Step 1: Find launch timestamp in synapse log ──────────────────────────
	synapseStream, hasSynapse := tf.ActiveStreams["nucleus_synapse"]
	if !hasSynapse {
		return fmt.Errorf("nucleus_synapse stream not found in telemetry.json")
	}

	launchTS, err := findLaunchTimestamp(synapseStream.Path, launchID)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[WARNING] %v — using now-30s as fallback window start\n", err)
		launchTS = time.Now().Add(-5 * time.Minute)
	}

	windowStart := launchTS.Add(-30 * time.Second)
	windowEnd := launchTS.Add(5 * time.Minute)

	fmt.Fprintf(os.Stderr, "[INFO] Window: %s → %s\n",
		windowStart.Format(time.RFC3339), windowEnd.Format(time.RFC3339))

	// ── Step 2: Collect lines from all telemetry streams ────────────────────
	allLines := collectWindowLines(tf, windowStart, windowEnd)

	// Collect inactive streams
	seenStreams := map[string]struct{}{}
	for _, l := range allLines {
		seenStreams[l.stream] = struct{}{}
	}
	var inactiveStreams []string
	for streamID, stream := range tf.ActiveStreams {
		if _, active := seenStreams[streamID]; !active {
			// Get last event time
			info, statErr := os.Stat(stream.Path)
			var lastEvent string
			if statErr == nil {
				diff := time.Since(info.ModTime()).Round(time.Minute)
				lastEvent = fmt.Sprintf("last event: %v ago", diff)
			} else {
				lastEvent = "file not found"
			}
			inactiveStreams = append(inactiveStreams, fmt.Sprintf("- %s (%s)", streamID, lastEvent))
		}
	}
	sort.Strings(inactiveStreams)

	// ── Step 3: Brain CLI Chrome analysis ────────────────────────────────────
	type chromeAnalysis struct {
		readLog     string
		networkLog  string
		miningLog   string
		readErr     string
		networkErr  string
		miningErr   string
	}
	var chrome chromeAnalysis

	if profileID != "" {
		fmt.Fprintln(os.Stderr, "[INFO] Invoking Brain CLI for Chrome log analysis...")

		readOutFile, _, readErr := invokeBrainCLI(c.Paths.Bin,
			"chrome", "read-log", profileID, "--launch-id", launchID)
		if readErr != nil {
			chrome.readErr = readErr.Error()
		} else {
			chrome.readLog = readFileContents(readOutFile)
		}

		netOutFile, _, netErr := invokeBrainCLI(c.Paths.Bin,
			"chrome", "read-net-log", profileID, "--launch-id", launchID)
		if netErr != nil {
			chrome.networkErr = netErr.Error()
		} else {
			chrome.networkLog = readFileContents(netOutFile)
		}

		miningOutFile, _, miningErr := invokeBrainCLI(c.Paths.Bin,
			"chrome", "mining-log", profileID, "--launch-id", launchID, "--keyword", "bloom")
		if miningErr != nil {
			chrome.miningErr = miningErr.Error()
		} else {
			chrome.miningLog = readFileContents(miningOutFile)
		}
	}

	// ── Step 4: Build digest file ─────────────────────────────────────────────
	traceDir := filepath.Join(c.Paths.Logs, "synapse")
	if err := os.MkdirAll(traceDir, 0755); err != nil {
		return fmt.Errorf("cannot create synapse_trace dir: %w", err)
	}

	if outFilePath == "" {
		outFilePath = filepath.Join(traceDir, fmt.Sprintf("trace_%s.log", launchID))
	}

	sum := extractSummaryFacts(allLines)

	// Collect error lines for the ERRORES section
	var errorLines []timedLine
	for _, l := range allLines {
		upper := strings.ToUpper(l.text)
		if strings.Contains(upper, "ERROR") || strings.Contains(upper, "WARNING") {
			errorLines = append(errorLines, l)
		}
	}

	f, err := os.Create(outFilePath)
	if err != nil {
		return fmt.Errorf("cannot create trace file: %w", err)
	}
	defer f.Close()
	w := bufio.NewWriter(f)

	sep := strings.Repeat("=", 80)
	dash := strings.Repeat("-", 80)

	fmt.Fprintf(w, "%s\n", sep)
	fmt.Fprintf(w, "SYNAPSE TRACE — launch_id: %s\n", launchID)
	fmt.Fprintf(w, "Generado: %s\n", time.Now().UTC().Format(time.RFC3339))
	fmt.Fprintf(w, "Ventana: %s → %s\n", windowStart.Format(time.RFC3339), windowEnd.Format(time.RFC3339))
	if profileID != "" {
		fmt.Fprintf(w, "Profile:  %s\n", profileID)
	}
	fmt.Fprintf(w, "%s\n\n", sep)

	// RESUMEN EJECUTIVO
	fmt.Fprintf(w, "[RESUMEN EJECUTIVO]\n")
	fmt.Fprintf(w, "- Launch iniciado:   %s\n", sum.launchTime)
	fmt.Fprintf(w, "- Chrome PID:        %s\n", sum.chromePID)
	fmt.Fprintf(w, "- Extension loaded:  %s\n", sum.extensionOK)
	fmt.Fprintf(w, "- Errores detectados:  %d\n", sum.errorCount)
	fmt.Fprintf(w, "- Warnings detectados: %d\n", sum.warningCount)
	fmt.Fprintf(w, "- Streams analizados:  %d\n", sum.streamsActive)
	fmt.Fprintf(w, "- Líneas totales:      %d\n", sum.totalLines)
	fmt.Fprintf(w, "\n%s\n", sep)

	// LÍNEA DE TIEMPO UNIFICADA
	fmt.Fprintf(w, "\n[LÍNEA DE TIEMPO UNIFICADA]\n\n")
	for _, l := range allLines {
		tsStr := "??:??:??"
		if !l.ts.IsZero() {
			tsStr = l.ts.Format("15:04:05")
		}
		sym := streamSymbol(l.stream, l.text)
		// Pad stream name for alignment
		paddedStream := fmt.Sprintf("%-28s", "["+l.stream+"]")
		fmt.Fprintf(w, "%s %s %s %s\n", tsStr, paddedStream, sym, l.text)
	}
	fmt.Fprintf(w, "\n%s\n", sep)

	// ERRORES DETECTADOS
	fmt.Fprintf(w, "\n[ERRORES DETECTADOS]\n\n")
	if len(errorLines) == 0 {
		fmt.Fprintf(w, "(ningún error o warning encontrado en la ventana)\n")
	} else {
		for _, l := range errorLines {
			tsStr := "??:??:??"
			if !l.ts.IsZero() {
				tsStr = l.ts.Format("15:04:05")
			}
			fmt.Fprintf(w, "%s [%s] %s\n", tsStr, l.stream, l.text)
		}
	}
	fmt.Fprintf(w, "\n%s\n", sep)

	// ANÁLISIS CHROME
	fmt.Fprintf(w, "\n[ANÁLISIS CHROME — read-log]\n\n")
	if chrome.readErr != "" {
		fmt.Fprintf(w, "ERROR: %s\n", chrome.readErr)
	} else if chrome.readLog != "" {
		fmt.Fprintf(w, "%s\n", chrome.readLog)
	} else {
		fmt.Fprintf(w, "(no se proveyó --profile, análisis Chrome omitido)\n")
	}
	fmt.Fprintf(w, "\n%s\n", dash)

	fmt.Fprintf(w, "\n[ANÁLISIS CHROME — network]\n\n")
	if chrome.networkErr != "" {
		fmt.Fprintf(w, "ERROR: %s\n", chrome.networkErr)
	} else if chrome.networkLog != "" {
		fmt.Fprintf(w, "%s\n", chrome.networkLog)
	} else {
		fmt.Fprintf(w, "(no se proveyó --profile, análisis de red omitido)\n")
	}
	fmt.Fprintf(w, "\n%s\n", dash)

	fmt.Fprintf(w, "\n[ANÁLISIS CHROME — mining bloom]\n\n")
	if chrome.miningErr != "" {
		fmt.Fprintf(w, "ERROR: %s\n", chrome.miningErr)
	} else if chrome.miningLog != "" {
		fmt.Fprintf(w, "%s\n", chrome.miningLog)
	} else {
		fmt.Fprintf(w, "(no se proveyó --profile, mining log omitido)\n")
	}
	fmt.Fprintf(w, "\n%s\n", sep)

	// STREAMS SIN ACTIVIDAD
	fmt.Fprintf(w, "\n[STREAMS SIN ACTIVIDAD EN VENTANA]\n\n")
	if len(inactiveStreams) == 0 {
		fmt.Fprintf(w, "(todos los streams tuvieron actividad en la ventana)\n")
	} else {
		for _, s := range inactiveStreams {
			fmt.Fprintf(w, "%s\n", s)
		}
	}
	fmt.Fprintf(w, "\n%s\n", sep)

	if err := w.Flush(); err != nil {
		return fmt.Errorf("flushing trace file: %w", err)
	}

	// ── Step 5: Register in telemetry ────────────────────────────────────────
	shortID := launchID
	if len(shortID) > 16 {
		shortID = shortID[:16]
	}
	tm := core.GetTelemetryManager(c.Paths.Logs, c.Paths.Logs)
	tm.RegisterStream(
		fmt.Sprintf("synapse_trace_%s", strings.ReplaceAll(launchID, "_", "")),
		fmt.Sprintf("🔍 SYNAPSE TRACE (%s)", shortID),
		filepath.ToSlash(outFilePath),
		2,
		[]string{"nucleus", "synapse"},
		fmt.Sprintf("Synapse trace autocontenido para launch %s — correlación temporal de todos los streams", launchID),
	)

	// ── Output ────────────────────────────────────────────────────────────────
	if jsonOut {
		outputJSON(map[string]interface{}{
			"success":      true,
			"mode":         "launch",
			"launch_id":    launchID,
			"profile_id":   profileID,
			"output_file":  filepath.ToSlash(outFilePath),
			"window_start": windowStart.Format(time.RFC3339),
			"window_end":   windowEnd.Format(time.RFC3339),
			"total_lines":  sum.totalLines,
			"errors":       sum.errorCount,
			"warnings":     sum.warningCount,
		})
		return nil
	}

	fmt.Printf("\n✅ Synapse trace generado: %s\n", outFilePath)
	fmt.Printf("   Ventana: %s → %s\n", windowStart.Format("15:04:05"), windowEnd.Format("15:04:05"))
	fmt.Printf("   Líneas:  %d | Errores: %d | Warnings: %d\n\n",
		sum.totalLines, sum.errorCount, sum.warningCount)
	return nil
}

// ═════════════════════════════════════════════════════════════════════════════
// MODE 3: SUMMARY DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

type streamStats struct {
	streamID    string
	lastSeen    time.Duration
	errorCount  int
	warnCount   int
	fileExists  bool
}

func runSummary(c *core.Core, since string, jsonOut bool) error {
	tf, err := loadTelemetry(c.Paths.Logs)
	if err != nil {
		return err
	}

	var dur time.Duration = 10 * time.Minute // default
	if since != "" {
		dur, err = parseSinceDuration(since)
		if err != nil {
			return err
		}
	}

	cutoff := time.Now().Add(-dur)

	var stats []streamStats
	for streamID, stream := range tf.ActiveStreams {
		s := streamStats{streamID: streamID}

		info, statErr := os.Stat(stream.Path)
		if statErr != nil {
			s.fileExists = false
			stats = append(stats, s)
			continue
		}
		s.fileExists = true
		s.lastSeen = time.Since(info.ModTime()).Round(time.Second)

		// Count errors/warnings in the since window
		f, openErr := os.Open(stream.Path)
		if openErr == nil {
			scanner := bufio.NewScanner(f)
			scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
			for scanner.Scan() {
				line := scanner.Text()
				ts := parseLineTimestamp(line)
				if !ts.IsZero() && ts.Before(cutoff) {
					continue
				}
				upper := strings.ToUpper(line)
				if strings.Contains(upper, "ERROR") {
					s.errorCount++
				} else if strings.Contains(upper, "WARNING") {
					s.warnCount++
				}
			}
			f.Close()
		}
		stats = append(stats, s)
	}

	// Sort by stream ID for stable output
	sort.Slice(stats, func(i, j int) bool {
		return stats[i].streamID < stats[j].streamID
	})

	if jsonOut {
		type jsonStream struct {
			StreamID    string `json:"stream_id"`
			LastSeenAgo string `json:"last_seen_ago"`
			Errors      int    `json:"errors"`
			Warnings    int    `json:"warnings"`
			FileExists  bool   `json:"file_exists"`
		}
		var out []jsonStream
		for _, s := range stats {
			out = append(out, jsonStream{
				StreamID:    s.streamID,
				LastSeenAgo: s.lastSeen.String(),
				Errors:      s.errorCount,
				Warnings:    s.warnCount,
				FileExists:  s.fileExists,
			})
		}
		outputJSON(map[string]interface{}{
			"success":   true,
			"mode":      "summary",
			"since":     since,
			"streams":   out,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
		return nil
	}

	// ── Terminal table ────────────────────────────────────────────────────────
	const reset = "\033[0m"
	const red = "\033[31m"
	const yellow = "\033[33m"

	// Header
	fmt.Printf("\n%-32s  %-18s  %s (%s)  %s (%s)\n",
		"stream", "última actividad",
		"errores", dur.String(), "warnings", dur.String())
	fmt.Println(strings.Repeat("-", 80))

	for _, s := range stats {
		if !s.fileExists {
			fmt.Printf("%-32s  %-18s  -               -\n", s.streamID, "(archivo no existe)")
			continue
		}

		lastStr := formatDurationAgo(s.lastSeen)
		errStr := strconv.Itoa(s.errorCount)
		warnStr := strconv.Itoa(s.warnCount)

		// Colorize if errors present
		errColor := ""
		errReset := ""
		if s.errorCount > 0 {
			errColor = red
			errReset = reset
			errStr = errStr + "  ←"
		}
		warnColor := ""
		warnReset := ""
		if s.warnCount > 0 {
			warnColor = yellow
			warnReset = reset
		}

		fmt.Printf("%-32s  %-18s  %s%-14s%s%s%-14s%s\n",
			s.streamID, lastStr,
			errColor, errStr, errReset,
			warnColor, warnStr, warnReset,
		)
	}
	fmt.Println()
	return nil
}

func formatDurationAgo(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("hace %ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("hace %dmin", int(d.Minutes()))
	}
	return fmt.Sprintf("hace %.1fh", d.Hours())
}