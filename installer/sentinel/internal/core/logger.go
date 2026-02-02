package core

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"
)

type Logger struct {
	file       *os.File
	logger     *log.Logger
	isJSONMode bool
	silentMode bool
}

func InitLogger(paths *Paths, componentID, label string, priority int) (*Logger, error) {
	// 1. Crear directorio de logs si no existe
	targetDir := paths.LogsDir
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, fmt.Errorf("error creando directorio %s: %w", targetDir, err)
	}

	// 2. Preparar archivo de log
	now := time.Now()
	logFileName := fmt.Sprintf("%s_%s.log", componentID, now.Format("2006-01-02"))
	logPath := filepath.Join(targetDir, logFileName)

	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return nil, fmt.Errorf("error al abrir log: %w", err)
	}

	multiWriter := io.MultiWriter(os.Stdout, file)
	l := log.New(multiWriter, "", log.Ldate|log.Ltime)

	// 3. Registro en telemetría (con icono según prioridad)
	icon := getPriorityIcon(priority)
	tm := GetTelemetryManager(paths.LogsDir)
	tm.RegisterStream(componentID, icon+" "+label, logPath, priority)

	return &Logger{
		file:       file,
		logger:     l,
		isJSONMode: false,
		silentMode: false,
	}, nil
}

func getPriorityIcon(priority int) string {
	switch priority {
	case 1: return "🔥"
	case 2: return "🚀"
	case 3: return "⚙️"
	case 4: return "📦"
	case 5: return "⚫"
	case 6: return "🧿"  
	default: return "📝"
	}
}

func (l *Logger) SetSilentMode(e bool) { l.silentMode = e; l.reconfigure() }
func (l *Logger) SetJSONMode(e bool)   { l.isJSONMode = e; l.reconfigure() }

func (l *Logger) reconfigure() {
	var dest io.Writer = l.file
	if !l.silentMode {
		if l.isJSONMode {
			dest = io.MultiWriter(os.Stderr, l.file)
		} else {
			dest = io.MultiWriter(os.Stdout, l.file)
		}
	}
	l.logger.SetOutput(dest)
}

func (l *Logger) Info(f string, v ...any)    { l.logger.Printf("[INFO] "+f, v...) }
func (l *Logger) Error(f string, v ...any)   { l.logger.Printf("[ERROR] "+f, v...) }
func (l *Logger) Warning(f string, v ...any) { l.logger.Printf("[WARNING] "+f, v...) }
func (l *Logger) Success(f string, v ...any) { l.logger.Printf("[SUCCESS] "+f, v...) }
func (l *Logger) Close() error               { return l.file.Close() }