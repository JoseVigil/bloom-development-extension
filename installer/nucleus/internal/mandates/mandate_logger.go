package mandates

import (
	"nucleus/internal/core"
	"path/filepath"
)

// InitMandateLogger registra el stream de mandates en telemetry.json
// y retorna un Logger listo para usar.
// Log path: logs/nucleus/mandate/nucleus_mandate_YYYYMMDD.log
func InitMandateLogger(paths *core.PathConfig, jsonMode bool) (*core.Logger, error) {
	return core.InitLogger(paths, "MANDATE", jsonMode)
}

// mandateLogsDir retorna el path donde viven los logs de mandates.
func mandateLogsDir(logsBase string) string {
	return filepath.Join(logsBase, "nucleus", "mandate")
}