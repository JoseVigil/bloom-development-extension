//go:build !windows

package seed

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// registerInWindows en plataformas Unix registra el Native Messaging Host
// copiando el manifest a DOS ubicaciones:
//
//  1. El directorio estándar de Chromium según la plataforma:
//     - macOS: ~/Library/Application Support/Chromium/NativeMessagingHosts/
//     - Linux: ~/.config/chromium/NativeMessagingHosts/
//
//     IMPORTANTE — comportamiento por plataforma con --user-data-dir custom:
//     - macOS: Chromium ignora el directorio estándar y busca SOLO dentro del
//       user-data-dir. Por eso se necesitan los dos destinos.
//     - Linux: Chromium busca SIEMPRE en ~/.config/chromium/NativeMessagingHosts/
//       independientemente del --user-data-dir. El directorio del sistema
//       es obligatorio y suficiente; el del perfil es redundante pero inofensivo.
//
//  2. El NativeMessagingHosts dentro del user-data-dir del perfil
//     (profileDir/NativeMessagingHosts/) — requerido en macOS con user-data-dir
//     custom. En Linux es redundante pero se mantiene para consistencia.
func registerInWindows(hostName, manifestPath, profileDir string) error {
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return fmt.Errorf("no se pudo leer manifest: %w", err)
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("no se pudo obtener home dir: %w", err)
	}

	// ── 1. Directorio estándar según plataforma ───────────────────────────────
	var stdDir string
	switch runtime.GOOS {
	case "darwin":
		// macOS: con --user-data-dir custom Chromium ignora este path y busca
		// dentro del user-data-dir (destino 2). Se escribe igual para cubrir
		// launches sin user-data-dir custom.
		stdDir = filepath.Join(homeDir, "Library", "Application Support", "Chromium", "NativeMessagingHosts")
	case "linux":
		// Linux: Chromium busca aquí SIEMPRE, con o sin --user-data-dir custom.
		// Este es el destino crítico en Linux.
		stdDir = filepath.Join(homeDir, ".config", "chromium", "NativeMessagingHosts")
	default:
		return fmt.Errorf("plataforma no soportada: %s", runtime.GOOS)
	}

	if err := writeManifestTo(stdDir, hostName, data); err != nil {
		return fmt.Errorf("directorio estándar (%s): %w", stdDir, err)
	}

	// ── 2. user-data-dir del perfil (custom --user-data-dir) ─────────────────
	// Requerido en macOS. En Linux es redundante pero inofensivo.
	profileNMHDir := filepath.Join(profileDir, "NativeMessagingHosts")
	if err := writeManifestTo(profileNMHDir, hostName, data); err != nil {
		return fmt.Errorf("profile NativeMessagingHosts: %w", err)
	}

	return nil
}

func writeManifestTo(dir, hostName string, data []byte) error {
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("no se pudo crear dir %s: %w", dir, err)
	}
	dest := filepath.Join(dir, hostName+".json")
	if err := os.WriteFile(dest, data, 0644); err != nil {
		return fmt.Errorf("no se pudo escribir manifest en %s: %w", dest, err)
	}
	return nil
}
