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

// controlService stops (start=false) or starts (start=true) the Nucleus
// service on Linux and macOS. Both platforms run Nucleus as a user-level
// service (no root required to control it), matching the existing manual
// workflow:
//
//	systemctl --user stop com.bloom.nucleus.service   # linux
//	launchctl stop com.bloom.nucleus                  # darwin
//
// name is the platform-specific service identifier resolved by
// nucleusServiceName() in rollout.go (systemd --user unit on Linux, launchd
// label on macOS). Errors here are returned to the caller — unlike sudoChown,
// failing to stop/start the service is treated as fatal for the bootstrap
// component, since copying a new bundle.js is pointless if the old process
// keeps serving it.
func controlService(name string, start bool) error {
	switch runtime.GOOS {
	case "linux":
		return systemctlUserControl(name, start)
	case "darwin":
		return launchctlControl(name, start)
	default:
		return fmt.Errorf("controlService: unsupported OS %s", runtime.GOOS)
	}
}

// systemctlUserControl stops or starts a systemd --user unit on Linux.
func systemctlUserControl(name string, start bool) error {
	action := "stop"
	if start {
		action = "start"
	}
	cmd := exec.Command("systemctl", "--user", action, name)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("systemctl --user %s %s: %w", action, name, err)
	}
	return nil
}

// launchctlControl stops or starts a launchd job on macOS via its label.
// Assumes the job is already loaded/bootstrapped as a LaunchAgent (the
// installer's responsibility) — this only toggles running state, mirroring
// systemctl stop/start rather than unload/load.
func launchctlControl(name string, start bool) error {
	action := "stop"
	if start {
		action = "start"
	}
	cmd := exec.Command("launchctl", action, name)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("launchctl %s %s: %w", action, name, err)
	}
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
