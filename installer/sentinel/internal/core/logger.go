package core

import (
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

type Logger struct {
	file       *os.File
	logger     *log.Logger
	isJSONMode bool
	silentMode bool
}

// InitLogger crea el archivo de log en targetDir y registra el stream
// en telemetry.json invocando `nucleus telemetry register` (escritor único).
// La firma es retrocompatible: jsonMode es variadic opcional.
func InitLogger(paths *Paths, componentID, label string, priority int, jsonMode ...bool) (*Logger, error) {
	// 1. Crear directorio de logs si no existe
	targetDir := paths.LogsDir
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return nil, fmt.Errorf("error creando directorio %s: %w", targetDir, err)
	}

	// 2. Preparar archivo de log
	now := time.Now()
	logFileName := fmt.Sprintf("%s_%s.log", componentID, now.Format("20060102"))
	logPath := filepath.Join(targetDir, logFileName)

	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		return nil, fmt.Errorf("error al abrir log: %w", err)
	}

	// 3. Detectar modo JSON
	isJSON := false
	if len(jsonMode) > 0 {
		isJSON = jsonMode[0]
	}

	// 4. Configurar output según modo JSON
	var consoleWriter io.Writer
	if isJSON {
		// Modo JSON: logs van a stderr para no contaminar stdout
		consoleWriter = os.Stderr
	} else {
		// Modo normal: logs van a stdout
		consoleWriter = os.Stdout
	}

	multiWriter := io.MultiWriter(consoleWriter, file)
	l := log.New(multiWriter, "", log.Ldate|log.Ltime)

	// 5. Registrar stream en telemetry.json via nucleus CLI (escritor único).
	//    Best-effort: si nucleus no está disponible no bloquea el arranque.
	icon := getPriorityIcon(priority)
	registerTelemetryStream(paths.NucleusBin, componentID, icon+" "+label, logPath, priority)

	return &Logger{
		file:       file,
		logger:     l,
		isJSONMode: isJSON,
		silentMode: false,
	}, nil
}

// registerTelemetryStream invoca `nucleus telemetry register` de forma
// asíncrona y best-effort. Nunca bloquea ni falla silenciosamente el caller.
func registerTelemetryStream(nucleusBin, streamID, label, logPath string, priority int) {
	if nucleusBin == "" {
		return
	}
	// Ejecutar en goroutine para no bloquear el inicio de la aplicación
	go func() {
		cmd := exec.Command(
			nucleusBin,
			"telemetry", "register",
			"--stream", streamID,
			"--label", label,
			"--path", filepath.ToSlash(logPath),
			"--priority", fmt.Sprintf("%d", priority),
		)
		// Los errores de registro de telemetría no deben interrumpir la aplicación
		_ = cmd.Run()
	}()
}

func getPriorityIcon(priority int) string {
	switch priority {
	case 1:
		return "🔥"
	case 2:
		return "🚀"
	case 3:
		return "⚙️"
	case 4:
		return "📦"
	case 5:
		return "⚫"
	case 6:
		return "🧿"
	default:
		return "🔔"
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