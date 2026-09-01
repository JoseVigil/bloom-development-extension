package core

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// ============================================================================
// LOGGER - Maneja logs estructurados (archivo + consola)
// ============================================================================

type Logger struct {
	file        *os.File
	logger      *log.Logger
	isJSONMode  bool
	silentMode  bool
	mu          sync.Mutex
	category    string
	paths       *Paths
	targetDir   string
	filePrefix  string
	currentDay  string
	streamID    string
	streamLabel string
	priority    int
	categories  []string
	description string
	source      string
}

var loggerNow = func() time.Time { return time.Now().UTC() }

// InitLogger crea un logger que escribe a archivo y consola.
// extraCategories permite registrar el stream en categorías adicionales
// (e.g. "synapse" para nucleus_synapse, que pertenece a ["nucleus", "synapse"]).
func InitLogger(paths *Paths, category string, jsonMode bool, extraCategories ...string) (*Logger, error) {
	targetDir := filepath.Join(paths.LogsDir, "nucleus")
	icon := getNucleusIcon(category)
	categories := append([]string{"nucleus"}, extraCategories...)
	return initManagedLogger(paths, targetDir, "nucleus_"+strings.ToLower(category), category,
		"nucleus_"+strings.ToLower(category), icon+" "+category, 2, categories,
		getNucleusStreamDescription(category), "nucleus", jsonMode)
}

func initManagedLogger(paths *Paths, targetDir, filePrefix, category, streamID, streamLabel string,
	priority int, categories []string, description, source string, jsonMode bool) (*Logger, error) {
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, fmt.Errorf("error creando directorio %s: %w", targetDir, err)
	}
	l := &Logger{paths: paths, targetDir: targetDir, filePrefix: filePrefix,
		isJSONMode: jsonMode, category: category, streamID: streamID,
		streamLabel: streamLabel, priority: priority, categories: categories,
		description: description, source: source}
	if err := l.rolloverLocked(loggerNow()); err != nil {
		return nil, err
	}
	banner := fmt.Sprintf("======================================== [%s] Logging session started ========================================", category)
	if err := l.writeRawLocked(banner, jsonMode); err != nil {
		_ = l.file.Close()
		return nil, err
	}
	return l, nil
}

func (l *Logger) rolloverLocked(now time.Time) error {
	now = now.UTC()
	day := now.Format("20060102")
	if l.file != nil && l.currentDay == day {
		return nil
	}
	oldFile := l.file
	oldDay := l.currentDay
	if oldFile != nil {
		if err := oldFile.Sync(); err != nil {
			return err
		}
		if err := oldFile.Close(); err != nil {
			return err
		}
	}
	logPath := filepath.Join(l.targetDir, fmt.Sprintf("%s_%s.log", l.filePrefix, day))
	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_RDWR|os.O_APPEND, 0666)
	if err != nil {
		if oldFile != nil {
			oldPath := filepath.Join(l.targetDir, fmt.Sprintf("%s_%s.log", l.filePrefix, oldDay))
			l.file, _ = os.OpenFile(oldPath, os.O_CREATE|os.O_RDWR|os.O_APPEND, 0666)
		}
		return fmt.Errorf("error al abrir log %s: %w", logPath, err)
	}
	l.file = file
	l.currentDay = day
	l.reconfigure()
	tm := GetTelemetryManager(l.paths.LogsDir, l.paths.LogsDir)
	if err := tm.RegisterStream(l.streamID, l.streamLabel, l.priority, l.categories,
		l.description, l.source, filepath.ToSlash(logPath)); err != nil {
		_ = file.Close()
		l.file = nil
		return fmt.Errorf("register telemetry stream %s: %w", l.streamID, err)
	}
	return nil
}

func (l *Logger) writeRawLocked(message string, fileOnly bool) error {
	now := loggerNow().UTC()
	if err := l.rolloverLocked(now); err != nil {
		return err
	}
	line := fmt.Sprintf("%s %s\n", now.Format("2006/01/02 15:04:05"), message)
	if fileOnly {
		_, _ = io.WriteString(l.file, line)
	} else {
		l.logger.Print(strings.TrimSuffix(line, "\n"))
	}
	return l.file.Sync()
}

func (l *Logger) write(level, format string, values ...any) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.logger == nil {
		return
	}
	now := loggerNow().UTC()
	if err := l.rolloverLocked(now); err != nil {
		fmt.Fprintf(os.Stderr, "[logger] rollover failed for %s: %v\n", l.streamID, err)
		return
	}
	message := fmt.Sprintf(format, values...)
	l.logger.Printf("%s [%s] %s", now.Format("2006/01/02 15:04:05"), level, message)
	if level == "ERROR" || level == "WARNING" {
		_ = l.file.Sync()
	}
}

func getNucleusIcon(category string) string {
	switch category {
	case "SYSTEM":
		return "🛠️"
	case "GOVERNANCE":
		return "⚖️"
	case "TEAM":
		return "👥"
	case "VAULT":
		return "🔐"
	case "SYNC":
		return "🔄"
	case "ORCHESTRATION":
		return "🕸️"
	case "ANALYTICS":
		return "📊"
	case "TEMPORAL":
		return "⏱️"
	case "SYNAPSE":
		return "🔗"
	case "SERVICE":
		return "⚙️"
	case "WORKER":
		return "👷"
	case "MANDATE":
		return "📋"
	case "BRAIN_POLLER":
		return "🔌"
	case "TELEMETRY":
		return "📡"
	case "GRAVITY":
		return "🪐"
	default:
		return "⚙️"
	}
}

func getNucleusStreamDescription(category string) string {
	switch category {
	case "SYSTEM":
		return "Nucleus system log — captures initialization, configuration and system-level events"
	case "GOVERNANCE":
		return "Nucleus governance log — tracks policy enforcement and access control decisions"
	case "TEAM":
		return "Nucleus team log — records team management operations"
	case "VAULT":
		return "Nucleus vault log — captures credential and secret management operations"
	case "SYNC":
		return "Nucleus sync log — tracks synchronization operations and state reconciliation"
	case "ORCHESTRATION":
		return "Nucleus orchestration log — captures workflow coordination and task dispatch"
	case "ANALYTICS":
		return "Nucleus analytics log — records metrics collection and reporting events"
	case "TEMPORAL":
		return "Nucleus temporal log — captures Temporal workflow engine interactions"
	case "SYNAPSE":
		return "Synapse orchestration log — records the full launch chain for a browser profile"
	case "MANDATE":
		return "Nucleus mandate log — captures hook execution and mandate orchestration events"
	case "BRAIN_POLLER":
		return "Nucleus brain_poller log — captures Brain TCP connection lifecycle, PROFILE_DISCONNECTED events received, and hook dispatch results"
	case "TELEMETRY": // ← NUEVO
		return "Nucleus telemetry log — captures all reads, writes, errors, parse failures and lock issues related to telemetry.json"
	case "GRAVITY":
		return "Nucleus gravity log — captures Gravity posture resolution and confirmed collision findings (e.g. PRIORITY_CYCLE)"
	default:
		return fmt.Sprintf("Nucleus %s log", strings.ToLower(category))
	}
}

func (l *Logger) SetSilentMode(e bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.silentMode = e
	l.reconfigure()
}

// SetJSONMode reconfigures the logger to route console output to stderr (JSON mode)
// or stdout (interactive mode). Call this after InitLogger if the JSON flag is global.
func (l *Logger) SetJSONMode(enabled bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.isJSONMode = enabled
	l.reconfigure()
}

func (l *Logger) reconfigure() {
	var dest io.Writer

	if l.silentMode {
		// Modo silencioso: solo archivo
		dest = l.file
	} else {
		// ✅ Decisión según modo JSON (configurado en Init)
		var consoleWriter io.Writer
		if l.isJSONMode {
			consoleWriter = os.Stderr
		} else {
			consoleWriter = os.Stdout
		}
		dest = io.MultiWriter(consoleWriter, l.file)
	}

	if l.logger == nil {
		l.logger = log.New(dest, "", 0)
	} else {
		l.logger.SetOutput(dest)
	}
}

// Flush fuerza la escritura de logs al disco
func (l *Logger) Flush() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.file != nil {
		return l.file.Sync()
	}
	return nil
}

func (l *Logger) Info(f string, v ...any) {
	l.write("INFO", f, v...)
}

func (l *Logger) Error(f string, v ...any) {
	l.write("ERROR", f, v...)
}

func (l *Logger) Warning(f string, v ...any) {
	l.write("WARNING", f, v...)
}

func (l *Logger) Success(f string, v ...any) {
	l.write("SUCCESS", f, v...)
}

func (l *Logger) Debug(f string, v ...any) {
	l.write("DEBUG", f, v...)
}

func (l *Logger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.file != nil {
		banner := fmt.Sprintf("======================================== [%s] Logging session ended ========================================", l.category)
		if err := l.writeRawLocked(banner, l.isJSONMode); err != nil {
			return err
		}
		logPath := l.file.Name()

		err := l.file.Close()
		l.file = nil
		l.logger = nil
		if err != nil {
			return err
		}
		tm := GetTelemetryManager(l.paths.LogsDir, l.paths.LogsDir)
		return tm.CloseStreamFile(l.streamID, filepath.ToSlash(logPath))
	}
	return nil
}

// ============================================================================
// OUTPUT HELPERS - Resultados finales de comandos
// ============================================================================

// OutputJSON escribe JSON a stdout (para --json flag)
func (l *Logger) OutputJSON(data interface{}) error {
	bytes, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("error marshaling JSON: %w", err)
	}

	// ✅ JSON SIEMPRE a stdout, independiente del logger
	fmt.Fprintln(os.Stdout, string(bytes))
	return nil
}

// OutputResult maneja el resultado final según el modo
func (l *Logger) OutputResult(jsonData interface{}, interactiveMessage string) error {
	if l.isJSONMode {
		return l.OutputJSON(jsonData)
	} else {
		// En modo interactivo, usa el mismo canal que los logs (stdout)
		fmt.Fprintln(os.Stdout, interactiveMessage)
		return nil
	}
}

// ============================================================================
// SERVICE LOGGER
// ============================================================================

// InitServiceLogger crea un logger para el servicio background de Nucleus.
// Escribe en logs/nucleus/service/nucleus_service_YYYYMMDD.log (rotación diaria).
func InitServiceLogger(paths *Paths, jsonMode bool) (*Logger, error) {
	targetDir := filepath.Join(paths.LogsDir, "nucleus", "service")
	return initManagedLogger(paths, targetDir, "nucleus_service", "SERVICE", "nucleus_service",
		"⚙️ NUCLEUS SERVICE", 2, []string{"nucleus"},
		"Nucleus background service log — captures service lifecycle, health checks and daemon events",
		"nucleus", jsonMode)
}

// ============================================================================
// WORKER MANAGER LOGGER
// ============================================================================

// InitWorkerManagerLogger crea un logger para el pool de workers de Nucleus.
// Escribe en logs/nucleus/worker/nucleus_worker_manager_YYYYMMDD.log.
func InitWorkerManagerLogger(paths *Paths, jsonMode bool) (*Logger, error) {
	targetDir := filepath.Join(paths.LogsDir, "nucleus", "worker")
	return initManagedLogger(paths, targetDir, "nucleus_worker_manager", "WORKER",
		"nucleus_worker_manager", "👷 WORKER MANAGER", 2, []string{"nucleus"},
		"Nucleus worker manager log — tracks worker pool lifecycle, task assignment and completion",
		"nucleus", jsonMode)
}

// ============================================================================
// TEMPORAL LOGGER ADAPTER
// ============================================================================

// TemporalLogger adapta nuestro Logger al interface de Temporal SDK
type TemporalLogger struct {
	logger *Logger
}

// InitTemporalLogger crea un logger específico para Temporal
func InitTemporalLogger(paths *Paths, jsonMode bool) (*TemporalLogger, error) {
	logger, err := InitLogger(paths, "TEMPORAL", jsonMode)
	if err != nil {
		return nil, err
	}

	return &TemporalLogger{logger: logger}, nil
}

// Debug implements Temporal's logger interface
func (tl *TemporalLogger) Debug(msg string, keyvals ...interface{}) {
	tl.logger.Debug("%s %v", msg, keyvals)
}

// Info implements Temporal's logger interface
func (tl *TemporalLogger) Info(msg string, keyvals ...interface{}) {
	tl.logger.Info("%s %v", msg, keyvals)
}

// Warn implements Temporal's logger interface
func (tl *TemporalLogger) Warn(msg string, keyvals ...interface{}) {
	tl.logger.Warning("%s %v", msg, keyvals)
}

// Error implements Temporal's logger interface
func (tl *TemporalLogger) Error(msg string, keyvals ...interface{}) {
	tl.logger.Error("%s %v", msg, keyvals)
}
