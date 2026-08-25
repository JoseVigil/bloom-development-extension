//go:build !windows

package maintenance

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"metamorph/internal/core"
)

// Unix can rename a directory entry while its executable remains mapped.
// Returning nil leaves the existing synchronous copyDir path authoritative.
func scheduleMetamorphSelfRollout(
	c *core.Core,
	repoRoot, src, dst string,
) (*rolloutHandoff, error) {
	return nil, nil
}

func runMetamorphRelay(c *core.Core, requestPath string) error {
	return fmt.Errorf("Metamorph self-rollout relay is Windows-only")
}

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
//
// Returns (wasNoop, err): wasNoop is true when there was nothing to do
// (already stopped when asked to stop, already running when asked to start)
// so callers can log "nothing to stop/start" instead of implying an action
// that didn't actually happen — the idempotency-visibility gap flagged
// against build-all.py's logging.
func controlService(name string, start bool) (bool, error) {
	switch runtime.GOOS {
	case "linux":
		return systemctlUserControl(name, start)
	case "darwin":
		return launchctlControl(name, start)
	default:
		return false, fmt.Errorf("controlService: unsupported OS %s", runtime.GOOS)
	}
}

// stopOwnedNucleusProcesses is intentionally a no-op on macOS/Linux. The
// demonstrated orphan belongs to the Windows NSSM/SCM lifecycle. systemd and
// launchd retain their existing service-stop semantics; broadening process
// discovery on Unix without equivalent evidence would weaken ownership safety.
func stopOwnedNucleusProcesses(basePath string) error {
	return nil
}

func sensorStop(dst string, dryRun bool) (bool, error) {
	if dryRun {
		return false, nil
	}
	name := serviceNameFor(runtime.GOOS, "sensor")
	wasNoop, err := controlService(name, false)
	return !wasNoop, err
}

func sensorStart(dst string) error {
	_, err := controlService(serviceNameFor(runtime.GOOS, "sensor"), true)
	return err
}

// systemctlUserControl stops or starts a systemd --user unit on Linux.
func systemctlUserControl(name string, start bool) (bool, error) {
	action := "stop"
	if start {
		action = "start"
	}

	if !start {
		// Idempotency check: if the unit is already inactive, skip the stop
		// call entirely and let the caller log "nothing to stop" instead of
		// "stopping..." followed by a command that did nothing. A check
		// error here (systemctl unavailable, unit unknown) is not fatal —
		// fall through to the unconditional stop below, same as before.
		if active, checkErr := systemctlUserIsActive(name); checkErr == nil && !active {
			return true, nil
		}
	}

	cmd := exec.Command("systemctl", "--user", action, name)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return false, fmt.Errorf("systemctl --user %s %s: %w", action, name, err)
	}

	if !start {
		// Race condition confirmed in build-all.py: the kernel can take a
		// moment to release the socket after systemd reports the unit
		// stopped, even though the process no longer shows up in process
		// listings. Give it a beat before the caller tries to bind the same
		// port again (e.g. the health check in bootstrapPostDeploy/
		// nucleusPostDeploy right after this).
		time.Sleep(2 * time.Second)
	}

	return false, nil
}

// systemctlUserIsActive reports whether a systemd --user unit is currently
// active. `systemctl --user is-active` exits non-zero for anything other
// than "active" (inactive, failed, or not loaded at all) — all of those are
// treated as "nothing to stop" here, since that's the only distinction the
// caller needs.
func systemctlUserIsActive(name string) (bool, error) {
	out, err := exec.Command("systemctl", "--user", "is-active", name).Output()
	if err != nil {
		return false, nil
	}
	return strings.TrimSpace(string(out)) == "active", nil
}

// launchctlControl stops or starts a launchd job on macOS via its label.
// Assumes the job is already loaded/bootstrapped as a LaunchAgent (the
// installer's responsibility) — this only toggles running state, mirroring
// systemctl stop/start rather than unload/load.
func launchctlControl(name string, start bool) (bool, error) {
	action := "stop"
	if start {
		action = "start"
	}

	if !start {
		if running, checkErr := launchctlIsLoaded(name); checkErr == nil && !running {
			return true, nil
		}
	}

	cmd := exec.Command("launchctl", action, name)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return false, fmt.Errorf("launchctl %s %s: %w", action, name, err)
	}

	if !start {
		// Same socket-release race as systemctl above.
		time.Sleep(2 * time.Second)
	}

	return false, nil
}

// launchctlIsLoaded is a best-effort check: `launchctl list <label>` exits
// non-zero when launchd doesn't know about the label at all, which reliably
// means there's nothing to stop. A zero exit only confirms the label is
// loaded — not that it's currently running — so this can under-report a
// no-op (log "stopping" for a loaded-but-idle job) but will never wrongly
// skip a stop that was actually needed.
func launchctlIsLoaded(name string) (bool, error) {
	if err := exec.Command("launchctl", "list", name).Run(); err != nil {
		return false, nil
	}
	return true, nil
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
