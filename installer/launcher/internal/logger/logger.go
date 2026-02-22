// internal/logger/logger.go

package logger

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

type Logger struct {
	file   *os.File
	logger *log.Logger
}

// New crea un logger que escribe en:
//
//	%LOCALAPPDATA%\BloomNucleus\logs\launcher\launcher_YYYYMMDD.log
//
// Al finalizar la inicialización registra el stream en el sistema de
// telemetría de Nucleus (no-fatal si falla).
func New() *Logger {
	logDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "BloomNucleus", "logs", "launcher")
	os.MkdirAll(logDir, 0755)

	logFileName := fmt.Sprintf("launcher_%s.log", time.Now().Format("20060102"))
	logPath := filepath.Join(logDir, logFileName)

	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		// Fallback a stderr si no se puede abrir el archivo
		l := &Logger{
			logger: log.New(os.Stderr, "", 0),
		}
		l.log("WARN", "No se pudo abrir log en disco: %v — usando stderr", err)
		return l
	}

	l := &Logger{
		file:   f,
		logger: log.New(f, "", 0),
	}

	// Registrar el stream de telemetría (no-fatal si nucleus no está disponible)
	go registerTelemetry(
		"launcher",
		"🚀 LAUNCHER",
		filepath.ToSlash(logPath),
		2,
		[]string{"launcher"},
		"Native launcher log — records the initial app bootstrap, environment checks and handoff to Conductor",
	)

	return l
}

// registerTelemetry llama a nucleus CLI para registrar el log como stream
// de telemetría. Se ejecuta en goroutine para no bloquear el arranque.
func registerTelemetry(streamID, label, path string, priority int, categories []string, description string) {
	args := []string{
		"telemetry", "register",
		"--stream", streamID,
		"--label", label,
		"--path", path,
		"--priority", fmt.Sprintf("%d", priority),
		"--description", description,
	}
	for _, cat := range categories {
		args = append(args, "--category", cat)
	}
	cmd := exec.Command("nucleus", args...)
	// Ignoramos el error; si nucleus no está disponible simplemente no se registra.
	_ = cmd.Run()
}

// log escribe una línea con timestamp, nivel y mensaje.
func (l *Logger) log(level, format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	l.logger.Printf("[%s] [%s] %s",
		time.Now().Format("2006-01-02 15:04:05"),
		level,
		msg,
	)
}

// Close cierra el archivo de log si fue abierto en disco.
func (l *Logger) Close() {
	if l.file != nil {
		l.file.Sync()
		l.file.Close()
		l.file = nil
	}
}

func (l *Logger) Info(format string, args ...interface{})  { l.log("INFO", format, args...) }
func (l *Logger) Warn(format string, args ...interface{})  { l.log("WARN", format, args...) }
func (l *Logger) Error(format string, args ...interface{}) { l.log("ERROR", format, args...) }
func (l *Logger) Debug(format string, args ...interface{}) { l.log("DEBUG", format, args...) }