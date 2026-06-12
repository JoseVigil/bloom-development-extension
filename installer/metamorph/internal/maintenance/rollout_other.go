//go:build !windows

package maintenance

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

// ensureElevated is a no-op on Darwin and Linux.
// Those platforms do not require elevation to run rollout; individual
// post-deploy steps that need root (e.g. chrome-sandbox chown) handle
// privilege escalation themselves and log a warning if they lack it.
// On any other non-Windows OS (e.g. FreeBSD), we return a clear error.
func ensureElevated() error {
	switch runtime.GOOS {
	case "darwin", "linux":
		return nil
	default:
		return fmt.Errorf("rollout is not supported on %s", runtime.GOOS)
	}
}

// controlService is a no-op stub on non-Windows platforms.
// Windows Service Control Manager APIs are not available outside Windows.
func controlService(name string, start bool) error {
	_ = name
	_ = start
	return nil
}

// sudoChown changes ownership of path to uid:gid using the system sudo command.
// It is used on Linux for chrome-sandbox. Non-fatal: if sudo is unavailable or
// fails, the caller should log a warning and continue.
func sudoChown(path string, uid, gid int) error {
	cmd := exec.Command("sudo", "chown", fmt.Sprintf("%d:%d", uid, gid), path)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}
