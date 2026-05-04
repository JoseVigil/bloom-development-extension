//go:build !windows

package seed

// registerInWindows es un no-op en plataformas no-Windows.
// En macOS y Linux el registro de Native Messaging se hace mediante
// archivos de manifiesto en directorios del sistema, no en el registry.
func registerInWindows(hostName, manifestPath string) error {
	return nil
}
