// internal/startup/startup_windows.go

//go:build windows

package startup

import (
	"fmt"

	"golang.org/x/sys/windows/registry"
)

const (
	runKey          = `Software\Microsoft\Windows\CurrentVersion\Run`
	registryValueOld = "BloomLauncher" // Clave legacy — eliminar si existe
	registryValueNew = "BloomSensor"   // Clave actual de Sensor
)

// Enable registra bloom-sensor en el arranque del usuario actual (HKCU\Run).
// Si existe la clave legacy de BloomLauncher, la elimina primero.
// El valor registrado incluye el subcomando "run" para arrancar el engine.
// La operación es idempotente.
func Enable(installPath string) error {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("no se pudo abrir HKCU\\%s: %w", runKey, err)
	}
	defer k.Close()

	// 1. Eliminar clave legacy si existe (no-fatal si no existe)
	_ = k.DeleteValue(registryValueOld)

	// 2. Registrar nueva clave con subcomando "run"
	value := fmt.Sprintf(`"%s\bloom-sensor.exe" run`, installPath)
	if err := k.SetStringValue(registryValueNew, value); err != nil {
		return fmt.Errorf("no se pudo escribir valor de registro: %w", err)
	}
	return nil
}

// Disable elimina la entrada BloomSensor del arranque del usuario actual.
// No mata el proceso en ejecución. La operación es idempotente.
func Disable() error {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("no se pudo abrir HKCU\\%s: %w", runKey, err)
	}
	defer k.Close()

	err = k.DeleteValue(registryValueNew)
	if err != nil && err.Error() != "The system cannot find the file specified." {
		return fmt.Errorf("no se pudo eliminar valor de registro: %w", err)
	}
	return nil
}

// IsEnabled devuelve (true, valor_registrado) si la entrada BloomSensor existe,
// o (false, "") si no existe o no se puede leer.
func IsEnabled() (bool, string) {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.QUERY_VALUE)
	if err != nil {
		return false, ""
	}
	defer k.Close()

	val, _, err := k.GetStringValue(registryValueNew)
	if err != nil {
		return false, ""
	}
	return true, val
}
