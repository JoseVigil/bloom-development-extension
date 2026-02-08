package core

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Logger struct {
	file       *os.File
	logger     *log.Logger
	isJSONMode bool
	silentMode bool
	mu         sync.Mutex
	category   string
}

func InitLogger(paths *PathConfig, category string, silent bool) (*Logger, error) {
	targetDir := filepath.Join(paths.Logs, "nucleus")
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, fmt.Errorf("error creando directorio %s: %w", targetDir, err)
	}

	now := time.Now()
	logFileName := fmt.Sprintf("nucleus_%s_%s.log", category, now.Format("2006-01-02"))
	logPath := filepath.Join(targetDir, logFileName)

	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_RDWR|os.O_APPEND, 0666)
	if err != nil {
		return nil, fmt.Errorf("error al abrir log %s: %w", logPath, err)
	}

	if file == nil {
		return nil, fmt.Errorf("file handle es nil después de OpenFile")
	}

	var dest io.Writer = file
	if !silent {
		dest = io.MultiWriter(os.Stdout, file)
	}
	l := log.New(dest, "", log.Ldate|log.Ltime)

	icon := getNucleusIcon(category)
	
	logger := &Logger{
		file:       file,
		logger:     l,
		isJSONMode: false,
		silentMode: silent,
		category:   category,
	}

	header := fmt.Sprintf("\n%s [%s] Logging session started %s\n", 
		strings.Repeat("=", 40), 
		category, 
		strings.Repeat("=", 40))
	
	file.WriteString(header)
	file.Sync()

	// Registrar stream en telemetry
	tm := GetTelemetryManager(paths.Logs, paths.Root)
	streamID := "nucleus-" + category
	streamLabel := icon + " " + category
	tm.RegisterStream(streamID, streamLabel, logPath, 2)

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

func (l *Logger) SetJSONMode(e bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.isJSONMode = e
	l.reconfigure()
}

func (l *Logger) reconfigure() {
	var dest io.Writer = l.file
	if !l.silentMode {
		dest = io.MultiWriter(os.Stdout, l.file)
	}
	if l.logger != nil {
		l.logger.SetOutput(dest)
	}
}

// writeAndFlush escribe y hace flush inmediatamente con manejo de errores
func (l *Logger) writeAndFlush(message string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	
	if l.file == nil {
		return fmt.Errorf("log file is nil")
	}
	
	n, err := l.file.WriteString(message)
	if err != nil {
		return fmt.Errorf("failed to write to log file: %w", err)
	}
	
	if n != len(message) {
		return fmt.Errorf("incomplete write: wrote %d of %d bytes", n, len(message))
	}
	
	if err := l.file.Sync(); err != nil {
		return fmt.Errorf("failed to sync log file: %w", err)
	}
	
	return nil
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
	// Info no hace flush automático para performance
}

func (l *Logger) Error(f string, v ...any) {
	if l.logger == nil {
		return
	}
	l.logger.Printf("[ERROR] "+f, v...)
	// Errores se escriben inmediatamente
	if err := l.Flush(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to flush error log: %v\n", err)
	}
}

func (l *Logger) Warning(f string, v ...any) {
	if l.logger == nil {
		return
	}
	l.logger.Printf("[WARNING] "+f, v...)
	// Warnings se escriben inmediatamente
	if err := l.Flush(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to flush warning log: %v\n", err)
	}
}

func (l *Logger) Success(f string, v ...any) {
	if l.logger == nil {
		return
	}
	l.logger.Printf("[SUCCESS] "+f, v...)
	// Success se escribe inmediatamente
	if err := l.Flush(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to flush success log: %v\n", err)
	}
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
		// Escribir footer
		footer := fmt.Sprintf("\n%s [%s] Logging session ended %s\n\n", 
			strings.Repeat("=", 40), 
			l.category, 
			strings.Repeat("=", 40))
		
		// Intentar escribir footer pero no fallar si falla
		l.file.WriteString(footer)
		
		// Flush final
		l.file.Sync()
		
		// Cerrar archivo
		err := l.file.Close()
		l.file = nil
		l.logger = nil
		return err
	}
	return nil
}