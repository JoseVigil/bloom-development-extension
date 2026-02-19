package core

// logger_helpers.go
// Funciones adicionales del package core requeridas por seed.go y otros
// comandos que necesitan crear loggers ad-hoc o registrar streams externamente.

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"os/exec"
)

// InitLoggerFromFile crea un Logger a partir de un *os.File ya abierto.
// Útil cuando el caller ya gestionó la creación y ubicación del archivo
// (por ejemplo, seed.go que necesita un logger por perfil).
// No registra telemetría — el caller es responsable de llamar a RegisterTelemetryStream.
func InitLoggerFromFile(file *os.File, isJSON bool) (*Logger, error) {
	if file == nil {
		return nil, fmt.Errorf("file no puede ser nil")
	}

	var consoleWriter io.Writer
	if isJSON {
		consoleWriter = os.Stderr
	} else {
		consoleWriter = os.Stdout
	}

	multiWriter := io.MultiWriter(consoleWriter, file)
	l := log.New(multiWriter, "", log.Ldate|log.Ltime)

	return &Logger{
		file:       file,
		logger:     l,
		isJSONMode: isJSON,
		silentMode: false,
	}, nil
}

// RegisterTelemetryStream es la versión exportada de registerTelemetryStream.
// Permite que paquetes externos (seed, ignition, etc.) registren sus streams
// en telemetry.json a través de nucleus CLI sin importar el TelemetryManager.
// nucleusBin debe pasarse como c.Paths.NucleusBin.
func RegisterTelemetryStream(nucleusBin, streamID, label, logPath string, priority int) {
	if nucleusBin == "" {
		return
	}
	go func() {
		cmd := exec.Command(
			nucleusBin,
			"telemetry", "register",
			"--stream", streamID,
			"--label", label,
			"--path", filepath.ToSlash(logPath),
			"--priority", fmt.Sprintf("%d", priority),
		)
		_ = cmd.Run()
	}()
}