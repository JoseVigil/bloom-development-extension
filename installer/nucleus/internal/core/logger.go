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

func InitLogger(paths *Paths, category string) (*Logger, error) {
	// 1. Directorio en AppData/nucleus/logs
	targetDir := filepath.Join(paths.LogsDir, "nucleus")
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, fmt.Errorf("error creando directorio %s: %w", targetDir, err)
	}

	// 2. Preparar archivo de log ( nucleus_GOVERNANCE_2026-02-04.log )
	now := time.Now()
	logFileName := fmt.Sprintf("nucleus_%s_%s.log", category, now.Format("2006-01-02"))
	logPath := filepath.Join(targetDir, logFileName)

	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return nil, fmt.Errorf("error al abrir log: %w", err)
	}

	multiWriter := io.MultiWriter(os.Stdout, file)
	l := log.New(multiWriter, "", log.Ldate|log.Ltime)

	// 3. Registro en telemetría (usando categorías de Nucleus)
	icon := getNucleusIcon(category)
	tm := GetTelemetryManager(paths.LogsDir, paths.TelemetryDir)
	// Registra en el telemetry.json global
	tm.RegisterStream("nucleus-"+category, icon+" "+category, logPath, 2)

	return &Logger{
		file:       file,
		logger:     l,
		isJSONMode: false,
		silentMode: false,
	}, nil
}

func getNucleusIcon(category string) string {
	switch category {
	case "SYSTEM":     return "🏛️"
	case "GOVERNANCE": return "⚖️"
	case "TEAM":       return "👥"
	case "VAULT":      return "🔐"
	case "SYNC":       return "🔄"
	default:           return "⚙️"
	}
}

func (l *Logger) SetSilentMode(e bool) { l.silentMode = e; l.reconfigure() }
func (l *Logger) SetJSONMode(e bool)   { l.isJSONMode = e; l.reconfigure() }

func (l *Logger) reconfigure() {
	var dest io.Writer = l.file
	if !l.silentMode {
		dest = io.MultiWriter(os.Stdout, l.file)
	}
	l.logger.SetOutput(dest)
}

func (l *Logger) Info(f string, v ...any)    { l.logger.Printf("[INFO] "+f, v...) }
func (l *Logger) Error(f string, v ...any)   { l.logger.Printf("[ERROR] "+f, v...) }
func (l *Logger) Warning(f string, v ...any) { l.logger.Printf("[WARNING] "+f, v...) }
func (l *Logger) Success(f string, v ...any) { l.logger.Printf("[SUCCESS] "+f, v...) }
func (l *Logger) Close() error               { return l.file.Close() }