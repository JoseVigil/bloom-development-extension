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
	file       *os.File
	logger     *log.Logger
	isJSONMode bool
	silentMode bool
	mu         sync.Mutex
	category   string
}

// InitLogger crea un logger que escribe a archivo y consola
// En modo JSON, los logs van a stderr; en modo normal, a stdout
func InitLogger(paths *PathConfig, category string, jsonMode bool) (*Logger, error) {
	targetDir := filepath.Join(paths.Logs, "nucleus")
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, fmt.Errorf("error creando directorio %s: %w", targetDir, err)
	}

	now := time.Now()
	logFileName := fmt.Sprintf("nucleus_%s_%s.log", strings.ToLower(category), now.Format("20060102"))
	logPath := filepath.Join(targetDir, logFileName)

	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_RDWR|os.O_APPEND, 0666)
	if err != nil {
		return nil, fmt.Errorf("error al abrirlog %s: %w", logPath, err)
	}

	if file == nil {
		return nil, fmt.Errorf("file handle es nil después de OpenFile")
	}

	// ✅ DECISIÓN ÚNICA DE ROUTING
	var consoleWriter io.Writer
	if jsonMode {
		// Modo JSON: logs van a stderr para no contaminar stdout
		consoleWriter = os.Stderr
	} else {
		// Modo normal: logs van a stdout
		consoleWriter = os.Stdout
	}
	
	dest := io.MultiWriter(consoleWriter, file)
	l := log.New(dest, "", log.Ldate|log.Ltime)

	icon := getNucleusIcon(category)
	
	logger := &Logger{
		file:       file,
		logger:     l,
		isJSONMode: jsonMode,
		silentMode: false,
		category:   category,
	}

	header := fmt.Sprintf("\n%s [%s] Logging session started %s\n", 
		strings.Repeat("=", 40), 
		category, 
		strings.Repeat("=", 40))
	
	file.WriteString(header)
	file.Sync()

	// Registrar stream en telemetry
	tm := GetTelemetryManager(paths.Logs, paths.Logs)
	streamID := "nucleus-" + strings.ToLower(category)
	streamLabel := icon + " " + category
	tm.RegisterStream(streamID, streamLabel, filepath.ToSlash(logPath), 2)

	return logger, nil
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
	default:
		return "⚙️"
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
	
	if l.logger != nil {
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
	if l.logger == nil {
		return
	}
	l.logger.Printf("[INFO] "+f, v...)
}

func (l *Logger) Error(f string, v ...any) {
	if l.logger == nil {
		return
	}
	l.logger.Printf("[ERROR] "+f, v...)
	l.Flush() // Errores se escriben inmediatamente
}

func (l *Logger) Warning(f string, v ...any) {
	if l.logger == nil {
		return
	}
	l.logger.Printf("[WARNING] "+f, v...)
	l.Flush()
}

func (l *Logger) Success(f string, v ...any) {
	if l.logger == nil {
		return
	}
	l.logger.Printf("[SUCCESS] "+f, v...)
	l.Flush()
}

func (l *Logger) Debug(f string, v ...any) {
	if l.logger == nil {
		return
	}
	l.logger.Printf("[DEBUG] "+f, v...)
}

func (l *Logger) Close() error {
	l.mu.Lock()
	defer l.mu.Unlock()
	
	if l.file != nil {
		footer := fmt.Sprintf("\n%s [%s] Logging session ended %s\n\n", 
			strings.Repeat("=", 40), 
			l.category, 
			strings.Repeat("=", 40))
		
		l.file.WriteString(footer)
		l.file.Sync()
		
		err := l.file.Close()
		l.file = nil
		l.logger = nil
		return err
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
// TEMPORAL LOGGER ADAPTER
// ============================================================================

// TemporalLogger adapta nuestro Logger al interface de Temporal SDK
type TemporalLogger struct {
	logger *Logger
}

// InitTemporalLogger crea un logger específico para Temporal
func InitTemporalLogger(paths *PathConfig, jsonMode bool) (*TemporalLogger, error) {
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