package health

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"strings"
)

// EnsureBrainRunning verifica que el ejecutable brain.exe exista y sea accesible.
// Si no existe, retorna error descriptivo para que dev-start pueda fallar rápido.
func EnsureBrainRunning(c *core.Core) error {
	sm, err := discovery.DiscoverSystem(c.Paths.BinDir)
	if err != nil {
		return fmt.Errorf("no se pudo descubrir el sistema: %w", err)
	}

	if sm.BrainPath == "" {
		return fmt.Errorf("BrainPath no resuelto por DiscoverSystem")
	}

	// Verificar que el ejecutable existe en disco
	if _, err := os.Stat(sm.BrainPath); os.IsNotExist(err) {
		return fmt.Errorf("brain.exe no encontrado en: %s", sm.BrainPath)
	}

	c.Logger.Info("✓ Brain encontrado en: %s", sm.BrainPath)

	// Verificar que el proceso está corriendo
	running, pid := isBrainProcessRunning()
	if !running {
		return fmt.Errorf("brain.exe no está en ejecución (ejecutable existe pero proceso no activo)")
	}

	c.Logger.Success("✓ Brain activo (PID: %d)", pid)
	return nil
}

// CheckHealth realiza una validación de estado del entorno de desarrollo completo.
// Retorna un mapa con el estado de cada componente y un error si algo crítico falla.
func CheckHealth(c *core.Core, sm *discovery.SystemMap) (map[string]string, error) {
	results := make(map[string]string)

	// Brain
	if sm.BrainPath != "" {
		if _, err := os.Stat(sm.BrainPath); err == nil {
			running, _ := isBrainProcessRunning()
			if running {
				results["brain"] = "OK"
			} else {
				results["brain"] = "NOT_RUNNING"
			}
		} else {
			results["brain"] = "NOT_FOUND"
		}
	} else {
		results["brain"] = "PATH_UNKNOWN"
	}

	// VSCode Plugin
	if sm.VSCodePlugin != "" {
		if _, err := os.Stat(sm.VSCodePlugin); err == nil {
			results["vscode_plugin"] = "OK"
			if sm.PluginVersion != "" {
				results["plugin_version"] = sm.PluginVersion
			}
		} else {
			results["vscode_plugin"] = "NOT_FOUND"
		}
	}

	// Chrome
	if sm.ChromePath != "" {
		if _, err := os.Stat(sm.ChromePath); err == nil {
			results["chrome"] = "OK"
		} else {
			results["chrome"] = "NOT_FOUND"
		}
	}

	// Loguear resultados
	for component, status := range results {
		if status == "OK" {
			c.Logger.Success("  ✓ %-12s %s", component, status)
		} else {
			c.Logger.Warning("  ⚠ %-12s %s", component, status)
		}
	}

	return results, nil
}

// isBrainProcessRunning detecta si brain.exe está activo en el sistema.
// Retorna (running bool, pid int).
func isBrainProcessRunning() (bool, int) {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("tasklist", "/FI", "IMAGENAME eq brain.exe", "/FO", "CSV", "/NH")
	default:
		cmd = exec.Command("pgrep", "-x", "brain")
	}

	output, err := cmd.Output()
	if err != nil {
		return false, 0
	}

	outputStr := strings.TrimSpace(string(output))
	if outputStr == "" || strings.Contains(outputStr, "No tasks") {
		return false, 0
	}

	return true, 0 // PID parsing omitido — tasklist CSV requiere parsing adicional si se necesita
}