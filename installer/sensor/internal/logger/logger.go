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
	debug  bool
}

// New crea un logger que escribe en:
//
//	%LOCALAPPDATA%\BloomNucleus\logs\sensor\sensor_YYYYMMDD.log
//
// Al finalizar la inicialización registra el stream en el sistema de
// telemetría de Nucleus (no-fatal si falla).
func New(debug bool) *Logger {
	logDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "BloomNucleus", "logs", "sensor")
	os.MkdirAll(logDir, 0755)

	logFileName := fmt.Sprintf("sensor_%s.log", time.Now().UTC().Format("20060102"))
	logPath := filepath.Join(logDir, logFileName)

	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		// Fallback a stderr si no se puede abrir el archivo
		l := &Logger{
			debug:  debug,
			logger: log.New(os.Stderr, "", 0),
		}
		l.log("WARN", "No se pudo abrir log en disco: %v — usando stderr", err)
		return l
	}

	l := &Logger{
		file:   f,
		logger: log.New(f, "", 0),
		debug:  debug,
	}

	// Registrar el stream de telemetría (no-fatal si nucleus no está disponible).
	// Categoría y source: "launcher" hasta que Nucleus agregue "sensor".
	go registerTelemetry(
		"sensor_human_state",
		"🌱 SENSOR HUMAN STATE",
		filepath.ToSlash(logPath),
		2,
		[]string{"launcher"},
		"launcher",
		"Bloom Sensor — human presence metrics stream",
	)

	return l
}

// registerTelemetry llama a nucleus CLI para registrar el log como stream
// de telemetría. Se ejecuta en goroutine para no bloquear el arranque.
func registerTelemetry(streamID, label, path string, priority int, categories []string, source, description string) {
	args := []string{
		"telemetry", "register",
		"--stream", streamID,
		"--label", label,
		"--path", path,
		"--priority", fmt.Sprintf("%d", priority),
		"--source", source,
		"--description", description,
	}
	for _, cat := range categories {
		args = append(args, "--category", cat)
	}
	cmd := exec.Command("nucleus", args...)
	// Ignoramos el error; si nucleus no está disponible simplemente no se registra.
	_ = cmd.Run()
}

// log escribe una línea con timestamp UTC, nivel y mensaje.
func (l *Logger) log(level, format string, args ...interface{}) {
	msg := fmt.Sprintf(format, args...)
	l.logger.Printf("[%s] [%s] %s",
		time.Now().UTC().Format("2006-01-02 15:04:05"),
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

// Debug solo emite si el logger fue creado con debug=true.
func (l *Logger) Debug(format string, args ...interface{}) {
	if l.debug {
		l.log("DEBUG", format, args...)
	}
}
