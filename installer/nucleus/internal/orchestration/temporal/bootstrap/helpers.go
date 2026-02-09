package bootstrap

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"syscall"

	"nucleus/internal/core"
)


// ============================================================================
// PID FILE MANAGEMENT
// ============================================================================

// GetPIDFilePath retorna la ruta del archivo PID para Temporal
func GetPIDFilePath(c *core.Core) string {
	return filepath.Join(c.Paths.Logs, "temporal", "temporal.pid")
}

// SavePID guarda el PID en un archivo
func SavePID(pidFile string, pid int) error {
	// Crear directorio si no existe
	dir := filepath.Dir(pidFile)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create PID directory: %w", err)
	}

	// Escribir PID
	pidStr := strconv.Itoa(pid)
	if err := os.WriteFile(pidFile, []byte(pidStr), 0644); err != nil {
		return fmt.Errorf("failed to write PID file: %w", err)
	}

	return nil
}

// LoadPID carga el PID desde un archivo
func LoadPID(pidFile string) (int, error) {
	data, err := os.ReadFile(pidFile)
	if err != nil {
		return 0, fmt.Errorf("failed to read PID file: %w", err)
	}

	pid, err := strconv.Atoi(string(data))
	if err != nil {
		return 0, fmt.Errorf("invalid PID in file: %w", err)
	}

	return pid, nil
}

// IsProcessRunning verifica si un proceso está corriendo dado su PID
func IsProcessRunning(pid int) bool {
	// En Windows, intentar abrir el proceso
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}

	// Enviar señal 0 (no hace nada, solo verifica existencia)
	// En Windows, Signal(0) no funciona, usar alternativa
	if err := process.Signal(syscall.Signal(0)); err != nil {
		return false
	}

	return true
}