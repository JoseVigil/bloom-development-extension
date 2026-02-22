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

// LoggerOptions agrupa los campos obligatorios del spec que antes no existían.
// Se usa en InitLogger y en RegisterExternalStream.
type LoggerOptions struct {
	// Categories es la lista de categorías válidas del spec:
	// brain · build · conductor · launcher · nucleus · sentinel · synapse
	// Debe tener al menos un elemento.
	Categories []string

	// Description describe quién escribe el log y qué captura.
	// Campo obligatorio según el spec (--description).
	Description string

	// JSONMode redirige la salida de consola a stderr para no contaminar stdout.
	JSONMode bool
}

// InitLogger crea el archivo de log en paths.LogsDir y registra el stream
// en telemetry.json invocando `nucleus telemetry register` (escritor único).
//
// El stream_id resultante es componentID; el path se genera automáticamente
// como <LogsDir>/<componentID>_<YYYYMMDD>.log.
//
// opts.Categories y opts.Description son obligatorios según el spec.
// Si opts es nil se registra sin --category ni --description (modo legacy,
// solo para compatibilidad transitoria — migrar lo antes posible).
func InitLogger(paths *Paths, componentID, label string, priority int, opts *LoggerOptions) (*Logger, error) {
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
	isJSON := opts != nil && opts.JSONMode

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
	var categories []string
	var description string
	if opts != nil {
		categories = opts.Categories
		description = opts.Description
	}
	registerTelemetryStream(paths.NucleusBin, componentID, icon+" "+label, logPath, priority, categories, description)

	return &Logger{
		file:       file,
		logger:     l,
		isJSONMode: isJSON,
		silentMode: false,
	}, nil
}

// RegisterExternalStream registra en telemetry.json un stream cuyo archivo de log
// NO es creado por InitLogger — por ejemplo, los logs de sentinel/startup,
// sentinel/profiles y chromium/debug que son disparados por synapse pero cuyo
// path y stream_id se conocen en el momento del launch.
//
// Esta función NO abre ni escribe el archivo; solo lo registra en telemetry.
// El caller es responsable de que el archivo exista o vaya a existir en logPath.
//
// Ejemplo de uso desde synapse, justo después de disparar el launch del perfil:
//
//	core.RegisterExternalStream(paths, "sentinel_startup",    "🟢 SENTINEL STARTUP",    startupLogPath,  2, &LoggerOptions{Categories: []string{"synapse"}, Description: "..."})
//	core.RegisterExternalStream(paths, "sentinel_profile_"+shortID, "👤 SENTINEL PROFILE ("+shortID+")", profileLogPath, 2, &LoggerOptions{Categories: []string{"synapse"}, Description: "..."})
//	core.RegisterExternalStream(paths, "chromium_debug_"+shortID,   "🌐 CHROMIUM DEBUG ("+shortID+")",  debugLogPath,   3, &LoggerOptions{Categories: []string{"synapse"}, Description: "..."})
func RegisterExternalStream(paths *Paths, streamID, label, logPath string, priority int, opts *LoggerOptions) {
	icon := getPriorityIcon(priority)
	var categories []string
	var description string
	if opts != nil {
		categories = opts.Categories
		description = opts.Description
	}
	registerTelemetryStream(paths.NucleusBin, streamID, icon+" "+label, logPath, priority, categories, description)
}

// registerTelemetryStream invoca `nucleus telemetry register` de forma
// asíncrona y best-effort. Nunca bloquea ni falla el caller.
// categories y description son opcionales a nivel de función pero obligatorios
// según el spec — los callers deben siempre proveerlos.
func registerTelemetryStream(nucleusBin, streamID, label, logPath string, priority int, categories []string, description string) {
	if nucleusBin == "" {
		return
	}
	go func() {
		args := []string{
			"telemetry", "register",
			"--stream", streamID,
			"--label", label,
			"--path", filepath.ToSlash(logPath),
			"--priority", fmt.Sprintf("%d", priority),
		}

		// --category es repetible; pasar uno por categoría
		for _, cat := range categories {
			args = append(args, "--category", cat)
		}

		// --description es obligatorio según el spec
		if description != "" {
			args = append(args, "--description", description)
		}

		cmd := exec.Command(nucleusBin, args...)
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