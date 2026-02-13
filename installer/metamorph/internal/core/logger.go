package core

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
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

// NewLogger crea un logger simple para Core (sin archivo)
func NewLogger(output io.Writer) *Logger {
	return &Logger{
		logger:     log.New(output, "", log.Ldate|log.Ltime),
		isJSONMode: false,
		silentMode: false,
		category:   "CORE",
	}
}

// InitLogger crea un logger que escribe a archivo y consola
// En modo JSON, los logs van a stderr; en modo normal, a stdout
func InitLogger(paths *PathConfig, category string, jsonMode bool) (*Logger, error) {
	targetDir := filepath.Join(paths.Logs, "metamorph")
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, fmt.Errorf("error creando directorio %s: %w", targetDir, err)
	}

	now := time.Now()
	logFileName := fmt.Sprintf("metamorph_%s_%s.log", strings.ToLower(category), now.Format("20060102"))
	logPath := filepath.Join(targetDir, logFileName)

	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_RDWR|os.O_APPEND, 0666)
	if err != nil {
		return nil, fmt.Errorf("error al abrir log %s: %w", logPath, err)
	}

	if file == nil {
		return nil, fmt.Errorf("file handle es nil despues de OpenFile")
	}

	// Decision unica de routing
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

	label := getMetamorphLabel(category)

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

	// Registrar stream en telemetry usando Nucleus CLI
	streamID := "metamorph_" + strings.ToLower(category)
	streamLabel := label + " " + category
	registerTelemetry(streamID, streamLabel, filepath.ToSlash(logPath), 2)

	return logger, nil
}

func getMetamorphLabel(category string) string {
	switch category {
	case "RECONCILE":
		return "[RECONCILE]"
	case "INSPECTOR":
		return "[INSPECTOR]"
	case "STAGING":
		return "[STAGING]"
	case "SERVICES":
		return "[SERVICES]"
	case "ROLLBACK":
		return "[ROLLBACK]"
	default:
		return "[METAMORPH]"
	}
}

// registerTelemetry registra el stream en el sistema de telemetria usando Nucleus CLI
func registerTelemetry(streamID, label, path string, priority int) {
	cmd := exec.Command(
		"nucleus", "telemetry", "register",
		"--stream", streamID,
		"--label", label,
		"--path", path,
		"--priority", fmt.Sprintf("%d", priority),
	)

	if err := cmd.Run(); err != nil {
		log.Printf("Warning: failed to register telemetry for %s: %v", streamID, err)
	}
}

func (l *Logger) SetSilentMode(e bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.silentMode = e
	l.reconfigure()
}

func (l *Logger) reconfigure() {
	var dest io.Writer

	if l.silentMode {
		// Modo silencioso: solo archivo
		dest = l.file
	} else {
		// Decision segun modo JSON (configurado en Init)
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

	// JSON SIEMPRE a stdout, independiente del logger
	fmt.Fprintln(os.Stdout, string(bytes))
	return nil
}

// OutputResult maneja el resultado final segun el modo
func (l *Logger) OutputResult(jsonData interface{}, interactiveMessage string) error {
	if l.isJSONMode {
		return l.OutputJSON(jsonData)
	} else {
		// En modo interactivo, usa el mismo canal que los logs (stdout)
		fmt.Fprintln(os.Stdout, interactiveMessage)
		return nil
	}
}
