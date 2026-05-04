//go:build !windows

package ignition

type coreLogger interface {
	Info(format string, args ...interface{})
	Error(format string, args ...interface{})
}

// registerNativeHostHKCU es un no-op en plataformas no-Windows.
// El registro de Native Messaging en macOS/Linux se hace mediante
// archivos de manifiesto en directorios del sistema, no en el registry.
func registerNativeHostHKCU(regKeyPath string, manifestPath string, logger coreLogger) error {
	return nil
}

// cleanupHKLM es un no-op en plataformas no-Windows.
func cleanupHKLM(regKeyPath string, logger coreLogger) {}
