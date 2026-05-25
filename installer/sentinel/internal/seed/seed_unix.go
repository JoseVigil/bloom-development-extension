//go:build !windows

package seed

import (
	"fmt"
	"os"
	"path/filepath"
)

// registerInWindows en Darwin registra el Native Messaging Host copiando
// el manifest a DOS ubicaciones:
//
//  1. El directorio estándar de Chromium (~/.../Chromium/NativeMessagingHosts/)
//     — necesario para launches fuera de un user-data-dir custom.
//
//  2. El NativeMessagingHosts dentro del user-data-dir del perfil
//     (profileDir/NativeMessagingHosts/) — necesario cuando Chromium arranca
//     con --user-data-dir custom, que es el caso de Bloom Nucleus.
//     Con user-data-dir custom, Chromium ignora el directorio estándar y
//     busca los manifests exclusivamente dentro de su user-data-dir.
func registerInWindows(hostName, manifestPath, profileDir string) error {
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return fmt.Errorf("no se pudo leer manifest: %w", err)
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("no se pudo obtener home dir: %w", err)
	}

	// ── 1. Directorio estándar de Chromium ───────────────────────────────────
	stdDir := filepath.Join(homeDir, "Library", "Application Support", "Chromium", "NativeMessagingHosts")
	if err := writeManifestTo(stdDir, hostName, data); err != nil {
		return fmt.Errorf("directorio estándar: %w", err)
	}

	// ── 2. user-data-dir del perfil (custom --user-data-dir) ─────────────────
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
