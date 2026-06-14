//go:build !windows

package ignition

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

type coreLogger interface {
	Info(format string, args ...interface{})
	Error(format string, args ...interface{})
}

// installNativeHostManifest copia el manifest actualizado al directorio del
// sistema que Chromium usa para Native Messaging según la plataforma:
//
//   - macOS: ~/Library/Application Support/Chromium/NativeMessagingHosts/
//   - Linux: ~/.config/chromium/NativeMessagingHosts/
//
// Se llama en cada launch (no solo en seed) porque prepareSessionFiles
// actualiza el manifest con --launch-id y --user-base-dir antes de este punto.
// Sin esta copia, el manifest del sistema queda con los args del seed original
// y bloom-host arranca sin launch-id ni user-base-dir correctos.
//
// Comportamiento por plataforma con --user-data-dir custom:
//   - macOS: Chromium ignora el directorio estándar y busca dentro del
//     user-data-dir del perfil. El directorio del sistema es backup.
//   - Linux: Chromium busca SIEMPRE en ~/.config/chromium/NativeMessagingHosts/
//     independientemente del --user-data-dir. Este es el único path que importa.
func installNativeHostManifest(regKeyPath string, manifestPath string, logger coreLogger) error {
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return fmt.Errorf("no se pudo leer manifest: %w", err)
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("no se pudo obtener home dir: %w", err)
	}

	// Extraer el nombre del host desde el path del manifest
	hostFileName := filepath.Base(manifestPath)

	var stdDir string
	switch runtime.GOOS {
	case "darwin":
		stdDir = filepath.Join(homeDir, "Library", "Application Support", "Chromium", "NativeMessagingHosts")
	case "linux":
		stdDir = filepath.Join(homeDir, ".config", "chromium", "NativeMessagingHosts")
	default:
		return fmt.Errorf("plataforma no soportada: %s", runtime.GOOS)
	}

	if err := os.MkdirAll(stdDir, 0755); err != nil {
		return fmt.Errorf("no se pudo crear dir %s: %w", stdDir, err)
	}

	dest := filepath.Join(stdDir, hostFileName)
	if err := os.WriteFile(dest, data, 0644); err != nil {
		return fmt.Errorf("no se pudo escribir manifest en %s: %w", dest, err)
	}

	logger.Info("[IGNITION] ✅ Manifest instalado en: %s", dest)
	return nil
}

// registerNativeHostHKCU es un no-op en plataformas no-Windows.
func registerNativeHostHKCU(regKeyPath string, manifestPath string, logger coreLogger) error {
	return nil
}

// cleanupHKLM es un no-op en plataformas no-Windows.
func cleanupHKLM(regKeyPath string, logger coreLogger) {}
