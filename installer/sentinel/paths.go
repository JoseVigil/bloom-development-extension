package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// PathResolver gestiona todas las rutas relativas al ejecutable
type PathResolver struct {
	executableDir string
	logsDir       string
	brainPath     string
	blueprintPath string
}

// NewPathResolver crea un resolver basado en la ubicación del ejecutable
func NewPathResolver() (*PathResolver, error) {
	// Obtener ruta del ejecutable (no CWD)
	execPath, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("cannot determine executable path: %w", err)
	}

	execDir := filepath.Dir(execPath)

	pr := &PathResolver{
		executableDir: execDir,
	}

	// Configurar rutas según plataforma
	pr.setupPaths()

	return pr, nil
}

// setupPaths configura las rutas específicas por plataforma
func (pr *PathResolver) setupPaths() {
	// Blueprint siempre en el mismo directorio que el ejecutable
	pr.blueprintPath = filepath.Join(pr.executableDir, "blueprint.json")

	// Rutas de Brain relativas al ejecutable
	// Estructura: bin/[platform]/sentinel.exe
	//             bin/[platform]/brain/brain.exe
	brainDir := filepath.Join(pr.executableDir, "brain")

	if runtime.GOOS == "windows" {
		pr.brainPath = filepath.Join(brainDir, "brain.exe")
	} else {
		pr.brainPath = filepath.Join(brainDir, "brain")
	}

	// Logs: un nivel arriba de bin/ o en LOCALAPPDATA
	pr.logsDir = pr.resolveLogsDir()
}

// resolveLogsDir determina dónde guardar los logs
func (pr *PathResolver) resolveLogsDir() string {
	// Synapse escribe logs en %LOCALAPPDATA%/BloomNucleus/logs/
	if runtime.GOOS == "windows" {
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData != "" {
			logsDir := filepath.Join(localAppData, "BloomNucleus", "logs")
			// Crear si no existe
			os.MkdirAll(logsDir, 0755)
			return logsDir
		}
	} else {
		// macOS/Linux: ~/.local/share/BloomNucleus/logs
		homeDir, _ := os.UserHomeDir()
		logsDir := filepath.Join(homeDir, ".local", "share", "BloomNucleus", "logs")
		os.MkdirAll(logsDir, 0755)
		return logsDir
	}

	// Fallback: un nivel arriba de bin/
	parentDir := filepath.Dir(pr.executableDir)
	logsDir := filepath.Join(parentDir, "logs")
	os.MkdirAll(logsDir, 0755)
	return logsDir
}

// GetBlueprintPath retorna la ruta al blueprint.json
func (pr *PathResolver) GetBlueprintPath() string {
	return pr.blueprintPath
}

// GetBrainPath retorna la ruta a brain.exe/brain
func (pr *PathResolver) GetBrainPath() string {
	return pr.brainPath
}

// GetLogsDir retorna el directorio de logs
func (pr *PathResolver) GetLogsDir() string {
	return pr.logsDir
}

// GetLogPath retorna la ruta completa a un archivo de log específico
func (pr *PathResolver) GetLogPath(logName string) string {
	return filepath.Join(pr.logsDir, logName)
}

// Validate verifica que las rutas críticas existan
func (pr *PathResolver) Validate() error {
	// Verificar blueprint
	if _, err := os.Stat(pr.blueprintPath); os.IsNotExist(err) {
		return fmt.Errorf("blueprint.json not found at: %s", pr.blueprintPath)
	}

	// Verificar brain executable
	if _, err := os.Stat(pr.brainPath); os.IsNotExist(err) {
		return fmt.Errorf("brain executable not found at: %s", pr.brainPath)
	}

	// Verificar/crear directorio de logs
	if err := os.MkdirAll(pr.logsDir, 0755); err != nil {
		return fmt.Errorf("cannot create logs directory: %s (%v)", pr.logsDir, err)
	}

	// Verificar directorio de logs es escribible
	testFile := filepath.Join(pr.logsDir, ".write_test")
	if err := os.WriteFile(testFile, []byte("test"), 0644); err != nil {
		return fmt.Errorf("logs directory not writable: %s", pr.logsDir)
	}
	os.Remove(testFile)

	return nil
}