//go:build !windows

package maintenance

import (
	"fmt"
	"runtime"
)

// ensureElevated is a no-op on non-Windows platforms.
// The rollout command is Windows-only by design; if somehow invoked on another
// OS it returns a clear error instead of silently proceeding.
func ensureElevated() error {
	return fmt.Errorf("rollout requires Windows (current OS: %s)", runtime.GOOS)
}

// controlService is a no-op stub on non-Windows platforms.
// Windows Service Control Manager APIs are not available outside Windows.
func controlService(name string, start bool) error {
	return fmt.Errorf("controlService is not supported on %s", runtime.GOOS)
}
