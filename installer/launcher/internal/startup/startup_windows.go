// internal/startup/startup_windows.go

package startup

import (
	"fmt"

	"golang.org/x/sys/windows/registry"
)

const (
	runKey   = `Software\Microsoft\Windows\CurrentVersion\Run`
	appName  = "bloom-launcher"
)

// Register añade bloom-launcher al arranque del usuario actual (HKCU\Run).
func Register(exePath string) error {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("no se pudo abrir HKCU\\%s: %w", runKey, err)
	}
	defer k.Close()

	if err := k.SetStringValue(appName, exePath); err != nil {
		return fmt.Errorf("no se pudo escribir valor de registro: %w", err)
	}
	return nil
}

// Unregister elimina la entrada de arranque del usuario actual.
func Unregister() error {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("no se pudo abrir HKCU\\%s: %w", runKey, err)
	}
	defer k.Close()

	if err := k.DeleteValue(appName); err != nil {
		return fmt.Errorf("no se pudo eliminar valor de registro: %w", err)
	}
	return nil
}

// IsRegistered devuelve true si la entrada de arranque existe.
func IsRegistered() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()

	_, _, err = k.GetStringValue(appName)
	return err == nil
}