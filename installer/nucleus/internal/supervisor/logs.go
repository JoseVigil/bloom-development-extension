// File: internal/supervisor/logs.go
// Categoría: SUPERVISOR
// Sigue Guía Maestra de Implementación Comandos NUCLEUS v2.0
//
// Comandos implementados:
//   nucleus logs <stream> [--since Xm/Xh] [--errors-only] [--no-startup] [--tail]
//   nucleus logs --launch <launch_id> [--profile <profile_id>] [--out <file>]
//   nucleus logs --summary [--since Xm]
//   nucleus logs synapse
//     Lista perfiles disponibles vía Brain CLI, toma el último launch_id del
//     perfil elegido y ejecuta automáticamente el trace completo de logs.
package supervisor

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
	core.RegisterCommand("SUPERVISOR", createLogsCommand)
}

// outputJSON serializes v to indented JSON and writes it to stdout.
func outputJSON(v interface{}) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
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
	FirstSeen   string   `json:"first_seen,omitempty"`
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
//
// Handles four layouts found across Bloom log streams:
//
//  1. Go logger prefix (nucleus, sentinel):
//     "2006/01/02 15:04:05 ..."
//
//  2. Brain Python logger (ISO8601, no brackets):
//     "2006-01-02T15:04:05.000Z ..."
//
//  3. Conductor / Electron installer (ISO8601 in brackets):
//     "[2006-01-02T15:04:05.000Z] ..."
//     "[2006-01-02T15:04:05Z] ..."
//
//  4. Chromium engine log (MMDD/HHMMss.mmm inside square-bracket process header):
//     "[PID:TID:MMDD/HHMMss.mmm:LEVEL:source] ..."
//     e.g. "[14012:19908:0223/000150.567:VERBOSE1:...]"
//     Month+day = 0223 → Feb 23; time = 000150.567 → 00:01:50.567
//     The year is inferred from the current UTC year since Chromium omits it.
//
// Returns zero time on failure.
func parseLineTimestamp(line string) time.Time {
	if len(line) < 10 {
		return time.Time{}
	}

	// ── Priority 1: Chromium process-header format ────────────────────────────
	// Pattern: [...:MMDD/HHMMss.mmm:...] at any position in the line.
	// We scan every '/' looking for one where the 4 chars before it are all
	// digits (MMDD) AND the char before those 4 digits is ':' or '['.
	// This avoids false matches on file-system paths that also contain '/'.
	{
		allDigits := func(s string) bool {
			for _, c := range s {
				if c < '0' || c > '9' {
					return false
				}
			}
			return len(s) > 0
		}

		searchFrom := 0
		for {
			idx := strings.Index(line[searchFrom:], "/")
			if idx < 0 {
				break
			}
			idx += searchFrom // absolute index in line

			start := idx - 4
			// Need at least 4 digits before '/' and 10 chars after (HHMMss.mmm)
			minEnd := idx + 1 + 10
			if start < 0 || minEnd > len(line) {
				searchFrom = idx + 1
				continue
			}

			part1 := line[start:idx]        // MMDD
			part2 := line[idx+1 : idx+1+6]  // HHMMss

			// Must be all digits and preceded by ':' or '['
			if allDigits(part1) && allDigits(part2) &&
				(line[start-1] == ':' || line[start-1] == '[') {

				// Grab milliseconds if present: HHMMss.mmm
				fullEnd := idx + 1 + 10 // points at char after 'mmm'
				var msStr string
				if fullEnd <= len(line) && line[idx+1+6] == '.' {
					msStr = line[idx+1+7 : fullEnd]
					if !allDigits(msStr) {
						msStr = "000"
					}
				} else {
					msStr = "000"
				}

				month := part1[0:2]
				day := part1[2:4]
				hour := part2[0:2]
				min := part2[2:4]
				sec := part2[4:6]
				year := time.Now().UTC().Year()
				synthetic := fmt.Sprintf("%d-%s-%sT%s:%s:%s.%sZ", year, month, day, hour, min, sec, msStr)
				if t, err := time.Parse("2006-01-02T15:04:05.000Z", synthetic); err == nil {
					return t
				}
			}

			searchFrom = idx + 1
		}
	}

	// ── Priority 1b: Windows batch/cmd timestamp ─────────────────────────────
	// Format emitted by build scripts via %DATE% %TIME%:
	//   "Mon 02/23/2026  1:46:42.71 ..."
	//   "Build Log - Mon 02/23/2026  1:46:42.71"
	// Day-of-week prefix (3 chars + space) is skipped; we parse MM/DD/YYYY HH:MM:SS.
	{
		line := strings.TrimSpace(line)
		// Strip optional label prefix up to " - " (e.g. "Build Log - ")
		if di := strings.Index(line, " - "); di >= 0 {
			line = strings.TrimSpace(line[di+3:])
		}
		// Expect: "Mon MM/DD/YYYY  H:MM:SS.cc" or "Mon MM/DD/YYYY HH:MM:SS.cc"
		// Day-of-week is 3 chars + space = 4 chars prefix.
		if len(line) >= 4 {
			rest := line[4:] // skip "Mon "
			// rest = "MM/DD/YYYY  H:MM:SS.cc" or "MM/DD/YYYY HH:MM:SS.cc"
			// Find the space(s) between date and time
			slashCount := 0
			dateEnd := -1
			for i, c := range rest {
				if c == '/' {
					slashCount++
				}
				if slashCount == 2 && c == ' ' {
					dateEnd = i
					break
				}
			}
			if dateEnd > 0 {
				datePart := rest[:dateEnd]                      // "MM/DD/YYYY"
				timePart := strings.TrimSpace(rest[dateEnd+1:]) // "H:MM:SS.cc ..."
				// Take only the time token (up to first space)
				if sp := strings.Index(timePart, " "); sp >= 0 {
					timePart = timePart[:sp]
				}
				// Strip centiseconds/milliseconds suffix (.cc or .ccc)
				if dot := strings.LastIndex(timePart, "."); dot >= 0 {
					timePart = timePart[:dot]
				}
				// Zero-pad single-digit hour: "1:46:42" → "01:46:42"
				if len(timePart) > 0 && timePart[1] == ':' {
					timePart = "0" + timePart
				}
				combined := datePart + " " + timePart // "02/23/2026 01:46:42"
				if t, err := time.ParseInLocation("01/02/2006 15:04:05", combined, time.Local); err == nil {
					return t
				}
			}
		}
	}
	// Formats that include an explicit timezone offset (Z or ±HH:MM) are parsed
	// as-is via time.Parse — the offset is self-describing.
	// Formats WITHOUT an explicit offset (Go logger, plain ISO) are written by
	// Go's log package using local time, so we use time.ParseInLocation(Local).
	type tsFormat struct {
		format   string
		length   int
		hasZone  bool // true = offset embedded, false = treat as local
	}
	formats := []tsFormat{
		// Bracketed ISO8601 with milliseconds: [2026-02-23T02:08:37.849Z]
		{"[2006-01-02T15:04:05.000Z]", 26, true},
		// Bracketed ISO8601 no ms with Z: [2026-02-23T01:52:05Z]
		// NOTE: build_all writes local time but appends a literal 'Z' (script bug).
		// We use a sentinel hasZone value (2) handled below to strip the zone and
		// reinterpret the wall clock as local.
		{"[2006-01-02T15:04:05Z]", 22, false},
		// Bracketed ISO8601 with offset: [2026-02-23T02:08:37.849-03:00]
		{"[2006-01-02T15:04:05.000Z07:00]", 31, true},
		// Plain ISO8601 with milliseconds: 2026-02-23T02:08:37.849Z
		{"2006-01-02T15:04:05.000Z", 24, true},
		// Plain ISO8601 with ms and offset: 2026-02-23T02:08:37.849+00:00
		{"2006-01-02T15:04:05.000Z07:00", 29, true},
		// Plain ISO8601 no ms: 2026-02-22T23:08:19Z
		{"2006-01-02T15:04:05Z", 20, true},
		// Plain ISO8601 with offset no ms: 2026-02-22T23:08:19-03:00
		{"2006-01-02T15:04:05Z07:00", 25, true},
		// Go logger: 2026/02/22 23:08:19  — LOCAL time, no zone info
		{"2006/01/02 15:04:05", 19, false},
		// Space-separated date: 2026-02-22 23:08:19  — LOCAL time, no zone info
		{"2006-01-02 15:04:05", 19, false},
		// Plain ISO8601 no ms no Z: 2026-02-22T23:08:19  — LOCAL time, no zone info
		{"2006-01-02T15:04:05", 19, false},
	}

	candidate := strings.TrimSpace(line)

	for _, e := range formats {
		if len(candidate) >= e.length {
			substr := candidate[:e.length]
			var t time.Time
			var err error
			if e.hasZone {
				t, err = time.Parse(e.format, substr)
			} else {
				// hasZone=false: the format may contain a literal 'Z' in the layout
				// (e.g. build_all writes local time with a bogus 'Z' suffix).
				// Parse it with time.Parse to accept the Z, then reinterpret the
				// wall-clock components as local time — discarding the false UTC offset.
				var parsed time.Time
				parsed, err = time.Parse(e.format, substr)
				if err == nil {
					// Re-parse wall clock in local timezone
					t, err = time.ParseInLocation(
						"2006-01-02 15:04:05",
						parsed.Format("2006-01-02 15:04:05"),
						time.Local,
					)
				}
			}
			if err == nil {
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
// Lines without a parseable timestamp are treated as continuation lines
// (e.g. stack trace frames, context blocks) and inherit the timestamp of
// the most recently seen timestamped line in the same file.  Only if no
// timestamped anchor has been seen yet do we include them unconditionally,
// so that file-level headers are not silently dropped.
//
// Returns []timedLine with the resolved timestamp already set (including the
// sticky timestamp for continuation lines), so callers don't need to re-parse
// and the inherited timestamp is not lost.
func readStreamWindow(path string, start, end time.Time, noStartup bool) []timedLine {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var result []timedLine
	var stickyTS time.Time // last known timestamp for continuation lines
	headerDone := false    // true once we've seen the first timestamped line

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if noStartup && isStartupNoise(line) {
			continue
		}
		ts := parseLineTimestamp(line)
		if ts.IsZero() {
			// Continuation / context line — use sticky timestamp for window check.
			if !headerDone {
				// Pre-first-timestamp headers (file banners, report metadata) — include always.
				// stickyTS is still zero here, which is fine: the render will show ??:??:??
				// only for true pre-header lines, not for stack traces mid-stream.
				result = append(result, timedLine{ts: stickyTS, text: line})
			} else if !stickyTS.IsZero() && !stickyTS.Before(start) && !stickyTS.After(end) {
				// Inherit the anchor timestamp so the render shows the right time.
				result = append(result, timedLine{ts: stickyTS, text: line})
			}
			// else: sticky is outside window, skip continuation line
			continue
		}
		// Timestamped line
		stickyTS = ts
		headerDone = true
		if !ts.Before(start) && !ts.After(end) {
			result = append(result, timedLine{ts: ts, text: line})
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
			"category": "SUPERVISOR",
			"json_response": `{
  "success": true,
  "mode": "stream|launch|summary",
  "lines": 42,
  "output_file": "logs/synapse_trace/synapse_trace_001_0b31f2fa_033803.log"
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

	// Subcomandos
	cmd.AddCommand(createSynapseCommand(c))

	return cmd
}

// ═════════════════════════════════════════════════════════════════════════════
// SUBCOMMAND: nucleus logs synapse
// ─ Obtiene perfiles via Brain CLI, toma el último launch y corre el trace
// ═════════════════════════════════════════════════════════════════════════════

// brainProfileList representa la respuesta de `brain --json profile list`.
type brainProfileList struct {
	Status string `json:"status"`
	Data   struct {
		Profiles []brainProfile `json:"profiles"`
	} `json:"data"`
}

type brainProfile struct {
	ID           string `json:"id"`
	Alias        string `json:"alias"`
	LastLaunchID string `json:"last_launch_id"`
}

// brainLaunchList representa la respuesta de `brain --json profile launches <id>`.
type brainLaunchList struct {
	Status string `json:"status"`
	Data   struct {
		Launches []brainLaunch `json:"launches"`
	} `json:"data"`
}

type brainLaunch struct {
	LaunchID string `json:"launch_id"`
	TS       string `json:"ts"`
	Result   string `json:"result"`
	Status   string `json:"_status"`
}

func runBrainJSON(binDir string, dest interface{}, args ...string) error {
	brainExe := filepath.Join(binDir, "brain", "brain.exe")
	if _, err := os.Stat(brainExe); err != nil {
		brainExe = "brain"
	}
	allArgs := append([]string{"--json"}, args...)
	out, err := exec.Command(brainExe, allArgs...).Output()
	if err != nil {
		return fmt.Errorf("brain %s: %w\noutput: %s", strings.Join(args, " "), err, string(out))
	}
	return json.Unmarshal(out, dest)
}

func createSynapseCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "synapse",
		Short: "Trace automático del último launch — obtiene perfil y launch_id via Brain CLI",
		Long: `Ejecuta automáticamente:
  1. brain profile list          → lista perfiles disponibles
  2. brain profile launches <id> → obtiene el último launch_id
  3. nucleus logs --launch <id> --profile <id>  → genera el trace completo

Si hay más de un perfil te pregunta cuál usar.`,
		Example: `  nucleus logs synapse`,
		RunE: func(cmd *cobra.Command, args []string) error {
			// ── Step 1: obtener perfiles ──────────────────────────────────────
			fmt.Println("🔍 Obteniendo perfiles via Brain CLI...")
			var profileList brainProfileList
			if err := runBrainJSON(c.Paths.Bin, &profileList, "profile", "list"); err != nil {
				return fmt.Errorf("no se pudo obtener la lista de perfiles: %w", err)
			}
			profiles := profileList.Data.Profiles
			if len(profiles) == 0 {
				return fmt.Errorf("no hay perfiles registrados en Brain CLI")
			}

			// ── Step 2: elegir perfil ─────────────────────────────────────────
			var chosen brainProfile
			if len(profiles) == 1 {
				chosen = profiles[0]
				fmt.Printf("✅ Perfil: %s (%s)\n", chosen.Alias, chosen.ID)
			} else {
				fmt.Println("\nPerfiles disponibles:")
				for i, p := range profiles {
					fmt.Printf("  [%d] %s — %s  (último launch: %s)\n", i+1, p.Alias, p.ID, p.LastLaunchID)
				}
				fmt.Print("\nElegí un número: ")
				var sel int
				if _, err := fmt.Scan(&sel); err != nil || sel < 1 || sel > len(profiles) {
					return fmt.Errorf("selección inválida")
				}
				chosen = profiles[sel-1]
			}

			// ── Step 3: obtener último launch_id ──────────────────────────────
			fmt.Printf("🔍 Obteniendo launches del perfil %s...\n", chosen.Alias)
			var launchList brainLaunchList
			if err := runBrainJSON(c.Paths.Bin, &launchList, "profile", "launches", chosen.ID); err != nil {
				return fmt.Errorf("no se pudo obtener los launches: %w", err)
			}
			launches := launchList.Data.Launches
			if len(launches) == 0 {
				return fmt.Errorf("el perfil %s no tiene launches registrados", chosen.Alias)
			}

			// El más reciente es el último de la lista
			last := launches[len(launches)-1]
			// Si last_launch_id ya está en el perfil lo usamos directamente
			launchID := chosen.LastLaunchID
			if launchID == "" {
				launchID = last.LaunchID
			}

			fmt.Printf("✅ Launch ID: %s  (ts: %s, estado: %s)\n\n", launchID, last.TS, last.Status)

			// Parsear el timestamp del launch para evitar búsqueda en synapse log
			var launchTime time.Time
			if last.TS != "" {
				if t, err := time.Parse(time.RFC3339, last.TS); err == nil {
					launchTime = t
				} else if t, err := time.Parse("2006-01-02T15:04:05Z", last.TS); err == nil {
					launchTime = t
				}
			}

			// ── Step 4: correr el trace completo ──────────────────────────────
			fmt.Println("🚀 Ejecutando trace completo de logs...")
			return runLaunchTrace(c, launchID, chosen.ID, "", false, launchTime)
		},
	}
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

// calculateWindowFromTelemetry calcula la ventana de captura del trace a partir
// de los metadatos de telemetry.json en lugar de usar un intervalo hardcodeado.
//
// Regla:
//   - windowStart = min(launchTS-30s, min(first_seen) de todos los streams)
//   - windowEnd   = max(launchTS+5m,  max(last_update) de todos los streams + 1m)
//
// Esto garantiza que ningún stream registrado en telemetry quede cortado por un
// límite de ventana arbitrario, independientemente de cuánto tarde en terminar.
// Si los timestamps de telemetry no son parseables, se usa el mínimo launchTS±5m.
func calculateWindowFromTelemetry(tf *telemetryFile, launchTS time.Time) (time.Time, time.Time) {
	// Telemetry timestamps are written with time.Now().Format(time.RFC3339),
	// which uses the local timezone. We must parse them as local time so the
	// window aligns with the local timestamps written in log lines by Go's
	// log package (log.Ldate|log.Ltime, also local).
	parseLocal := func(s string) time.Time {
		// RFC3339 with explicit offset (e.g. "-03:00") — parse as-is, already correct.
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			return t
		}
		// Fallback: no offset suffix — treat as local.
		for _, f := range []string{
			"2006-01-02T15:04:05",
			"2006-01-02T15:04:05.999999999",
			"2006-01-02 15:04:05",
		} {
			if t, err := time.ParseInLocation(f, s, time.Local); err == nil {
				return t
			}
		}
		return time.Time{}
	}

	// Baseline mínima garantizada
	start := launchTS.Add(-30 * time.Second)
	end := launchTS.Add(5 * time.Minute)

	for _, stream := range tf.ActiveStreams {
		if fs := parseLocal(stream.FirstSeen); !fs.IsZero() && fs.Before(start) {
			start = fs
		}
		if lu := parseLocal(stream.LastUpdate); !lu.IsZero() {
			// +1m de margen sobre el último evento registrado en telemetry
			candidate := lu.Add(1 * time.Minute)
			if candidate.After(end) {
				end = candidate
			}
		}
	}

	// Sanidad: ventana mínima de 1 minuto
	if end.Before(start.Add(time.Minute)) {
		end = start.Add(time.Minute)
	}

	return start, end
}

// collectWindowLines collects all lines from all streams within the time window.
// readStreamWindow already resolves sticky timestamps for continuation lines,
// so we just stamp each timedLine with its stream ID without re-parsing.
func collectWindowLines(tf *telemetryFile, start, end time.Time) []timedLine {
	var all []timedLine
	for streamID, stream := range tf.ActiveStreams {
		lines := readStreamWindow(stream.Path, start, end, false)
		for _, tl := range lines {
			tl.stream = streamID
			all = append(all, tl)
		}
	}
	// Sort by timestamp, then by stream name for stability.
	// Lines with zero timestamp (true pre-header lines) sort to the front.
	sort.SliceStable(all, func(i, j int) bool {
		if all[i].ts.IsZero() && all[j].ts.IsZero() {
			return all[i].stream < all[j].stream
		}
		if all[i].ts.IsZero() {
			return true
		}
		if all[j].ts.IsZero() {
			return false
		}
		return all[i].ts.Before(all[j].ts)
	})
	return all
}

// invokeBrainCLI runs a Brain CLI command and returns parsed JSON output.
// Returns (outputFile, rawOutput, error).
//
// Brain CLI emite líneas INFO/DEBUG a stdout antes del JSON.
// Extrae la primera línea que empiece con '{'.
// La estructura de respuesta es: {"status":"success","data":{"output_file":"..."}}
func invokeBrainCLI(binDir string, args ...string) (string, string, error) {
	brainExe := filepath.Join(binDir, "brain", "brain.exe")
	if _, err := os.Stat(brainExe); err != nil {
		brainExe = "brain"
	}

	allArgs := append([]string{"--json"}, args...)
	cmd := exec.Command(brainExe, allArgs...)
	out, err := cmd.Output()
	raw := string(out)
	if err != nil {
		return "", raw, fmt.Errorf("brain %s: %w\noutput: %s", strings.Join(args, " "), err, raw)
	}

	// Extraer línea JSON — brain CLI puede prefijar con líneas INFO/DEBUG
	jsonLine := ""
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "{") {
			jsonLine = line
			break
		}
	}
	if jsonLine == "" {
		return "", raw, fmt.Errorf("brain %s: no JSON en output: %s", strings.Join(args, " "), raw)
	}

	// Parsear {"status":"success","data":{"output_file":"..."}}
	var envelope struct {
		Status string                 `json:"status"`
		Data   map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal([]byte(jsonLine), &envelope); err != nil {
		return "", raw, fmt.Errorf("brain %s: JSON parse error: %w", strings.Join(args, " "), err)
	}
	if envelope.Status != "success" {
		return "", raw, fmt.Errorf("brain %s: status=%s", strings.Join(args, " "), envelope.Status)
	}
	if outFile, ok := envelope.Data["output_file"].(string); ok && outFile != "" {
		return outFile, raw, nil
	}
	return "", raw, fmt.Errorf("brain %s: output_file no encontrado en data", strings.Join(args, " "))
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

func runLaunchTrace(c *core.Core, launchID, profileID, outFilePath string, jsonOut bool, knownTS ...time.Time) error {
	tf, err := loadTelemetry(c.Paths.Logs)
	if err != nil {
		return err
	}

	// ── Step 1: Find launch timestamp ───────────────────────────────────────
	// Priority: knownTS passed by caller > search in synapse log > fallback now-5m
	var launchTS time.Time
	if len(knownTS) > 0 && !knownTS[0].IsZero() {
		launchTS = knownTS[0]
		fmt.Fprintf(os.Stderr, "[INFO] Usando timestamp del launch: %s\n", launchTS.Format(time.RFC3339))
	} else {
		synapseStream, hasSynapse := tf.ActiveStreams["nucleus_synapse"]
		if !hasSynapse {
			return fmt.Errorf("nucleus_synapse stream not found in telemetry.json")
		}
		var tsErr error
		launchTS, tsErr = findLaunchTimestamp(synapseStream.Path, launchID)
		if tsErr != nil {
			fmt.Fprintf(os.Stderr, "[WARNING] %v — using now-5m as fallback window start\n", tsErr)
			launchTS = time.Now().Add(-5 * time.Minute)
		}
	}

	// Ventana dinámica desde metadatos de telemetry.json.
	// Garantiza que ningún stream registrado quede cortado por un límite arbitrario.
	// Mínimo: launchTS-30s → launchTS+5m. Se extiende hasta max(last_update)+1m.
	windowStart, windowEnd := calculateWindowFromTelemetry(tf, launchTS)

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

	// ── Step 3: Chrome engine log analysis ──────────────────────────────────────
	// Invoca brain CLI para generar los archivos _engine_*.log.
	// brain devuelve el output_file en su JSON — nucleus lo lee directamente
	// y registra el stream en telemetry usando el TelemetryManager en memoria,
	// evitando el race condition entre registerStreamCLI y autoSaveLoop.
	type chromeAnalysis struct {
		readLog    string
		networkLog string
		miningLog  string
		readErr    string
		networkErr string
		miningErr  string
	}
	var chrome chromeAnalysis

	if profileID != "" {
		fmt.Fprintln(os.Stderr, "[INFO] Invocando brain CLI para análisis Chrome...")
		tm := core.GetTelemetryManager(c.Paths.Logs, c.Paths.Logs)
		shortID := launchID
		if len(shortID) > 8 {
			shortID = shortID[:8]
		}

		// read-log → _engine_read.log
		readPath, _, readErr := invokeBrainCLI(c.Paths.Bin,
			"chrome", "read-log", profileID, "--launch-id", launchID)
		if readErr != nil {
			chrome.readErr = readErr.Error()
			fmt.Fprintf(os.Stderr, "[WARN] brain chrome read-log: %v\n", readErr)
		} else {
			chrome.readLog = readFileContents(readPath)
			tm.RegisterStream(
				"chrome_engine_read_"+shortID,
				"🔍 CHROME ENGINE AUDIT ("+shortID+")",
				filepath.ToSlash(readPath),
				2,
				[]string{"synapse"},
				"Chrome engine audit para launch "+launchID+" — detección de errores Chromium y bloqueos de seguridad",
			)
			fmt.Fprintf(os.Stderr, "[INFO] engine_read generado y registrado: %s\n", readPath)
		}

		// read-net-log → _engine_network.log
		netPath, _, netErr := invokeBrainCLI(c.Paths.Bin,
			"chrome", "read-net-log", profileID, "--launch-id", launchID)
		if netErr != nil {
			chrome.networkErr = netErr.Error()
			fmt.Fprintf(os.Stderr, "[WARN] brain chrome read-net-log: %v\n", netErr)
		} else {
			chrome.networkLog = readFileContents(netPath)
			tm.RegisterStream(
				"chrome_network_"+shortID,
				"🌐 CHROME NETWORK ("+shortID+")",
				filepath.ToSlash(netPath),
				2,
				[]string{"synapse"},
				"Chrome network log para launch "+launchID+" — requests URL y sesiones HTTP/2",
			)
			fmt.Fprintf(os.Stderr, "[INFO] engine_network generado y registrado: %s\n", netPath)
		}

		// mining-log → _engine_mining.log
		miningPath, _, miningErr := invokeBrainCLI(c.Paths.Bin,
			"chrome", "mining-log", profileID, "--launch-id", launchID, "--keyword", "bloom")
		if miningErr != nil {
			chrome.miningErr = miningErr.Error()
			fmt.Fprintf(os.Stderr, "[WARN] brain chrome mining-log: %v\n", miningErr)
		} else {
			chrome.miningLog = readFileContents(miningPath)
			tm.RegisterStream(
				"chrome_engine_mining_"+shortID,
				"⛏️ CHROME ENGINE MINING ("+shortID+")",
				filepath.ToSlash(miningPath),
				2,
				[]string{"synapse"},
				"Chrome mining log para launch "+launchID+" — extracción keyword bloom con contexto",
			)
			fmt.Fprintf(os.Stderr, "[INFO] engine_mining generado y registrado: %s\n", miningPath)
		}
	} else {
		chrome.readErr = "profileID no provisto — análisis Chrome omitido"
		chrome.networkErr = chrome.readErr
		chrome.miningErr = chrome.readErr
	}

	// ── Step 4: Build digest file ─────────────────────────────────────────────
	traceDir := filepath.Join(c.Paths.Logs, "synapse_trace")
	if err := os.MkdirAll(traceDir, 0755); err != nil {
		return fmt.Errorf("cannot create synapse_trace dir: %w", err)
	}

	if outFilePath == "" {
		outFilePath = filepath.Join(traceDir, fmt.Sprintf("synapse_trace_%s.log", launchID))
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
	tm := core.GetTelemetryManager(c.Paths.Logs, c.Paths.Logs)
	tm.RegisterStream(
		fmt.Sprintf("synapse_trace_%s", launchID),
		fmt.Sprintf("🔍 SYNAPSE TRACE (%s)", launchID),
		filepath.ToSlash(outFilePath),
		2,
		[]string{"nucleus", "synapse"},
		fmt.Sprintf("Synapse trace log — correlación temporal de todos los streams activos para launch %s (profile: %s)", launchID, profileID),
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