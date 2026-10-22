//go:build !windows

package maintenance

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"metamorph/internal/core"
)

func checkUninstallReplaceable(path string) error {
	return fmt.Errorf("uninstall rollout is only supported on Windows")
}

func deployRuntime(src, dst string) error {
	_, err := copyDir(src, dst)
	return err
}

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

// stopOwnedNucleusProcesses removes a Control Plane left behind by an older
// Nucleus generation on macOS/Linux — the Unix counterpart of the Windows
// implementation in rollout_windows.go, with the same ownership rule.
//
// EVIDENCE (Darwin, 2026-10-19 — this used to be a no-op "without equivalent
// evidence"): with launchctlControl already using unload/load, the Nucleus
// master stopped cleanly and was NOT respawned by KeepAlive, yet port 48215
// stayed in use for the whole nucleusPortReleaseTimeout window. The
// listener was an orphaned `node bundle.js` from an earlier generation:
//   - every new generation's bootControlPlane logged
//     "listen EADDRINUSE 127.0.0.1:48215" (and :4124) and crashed;
//   - that crashed child's PID overwrote run/control_plane_api.pid, so
//     Supervisor.Shutdown (pidfile-based) only ever targeted the dead PID,
//     and the real listener was untracked forever;
//   - nucleusPostDeploy's health check then passed instantly against the
//     orphan, which is why "Control Plane healthy" appeared with no delay.
//
// Ownership: a process is never terminated merely because it owns 48215 or
// is called "node". Its command line must be exactly the installed managed
// runtime running the installed bundle:
//
//	<base>/bin/node/node <base>/bin/bootstrap/bundle.js
//
// (what bootControlPlane in installer/nucleus/internal/supervisor/service.go
// spawns). Anything else on 48215 is reported and left alone; rollout then
// fails with that explicit reason instead of a generic port timeout.
//
// If lsof is unavailable (minimal Linux images), this degrades to the old
// behavior (no-op) and waitForPortFree reports the busy port as before.
func stopOwnedNucleusProcesses(basePath string) error {
	expectedNode := filepath.Join(basePath, "bin", "node", "node")
	expectedBundle := filepath.Join(basePath, "bin", "bootstrap", "bundle.js")

	pids, err := unixListenerPIDs(48215)
	if err != nil {
		return err
	}
	for _, pid := range pids {
		cmdline, cmdErr := unixProcessCommand(pid)
		if cmdErr != nil {
			continue // exited between lsof and ps
		}
		if !isOwnedNucleusNodeCommand(cmdline, expectedNode, expectedBundle) {
			return fmt.Errorf("port 48215 is owned by unverified PID %d (%q); expected %s %s — refusing termination",
				pid, cmdline, expectedNode, expectedBundle)
		}
		fmt.Fprintf(os.Stderr, "   ⚠️  orphaned Bloom Control Plane still listening on :48215 (PID %d) — terminating\n", pid)
		if err := terminateVerifiedUnixPID(pid, expectedNode, expectedBundle, 10*time.Second); err != nil {
			return err
		}
	}
	return nil
}

// unixListenerPIDs returns the PIDs listening on a local TCP port, via
// `lsof -nP -t -iTCP:<port> -sTCP:LISTEN`. lsof exits 1 with no output when
// nothing matches; that is "no listener", not an error.
func unixListenerPIDs(port int) ([]int, error) {
	lsof, err := exec.LookPath("lsof")
	if err != nil {
		if _, statErr := os.Stat("/usr/sbin/lsof"); statErr != nil {
			return nil, nil
		}
		lsof = "/usr/sbin/lsof"
	}
	out, err := exec.Command(lsof, "-nP", "-t", fmt.Sprintf("-iTCP:%d", port), "-sTCP:LISTEN").Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && exitErr.ExitCode() == 1 && strings.TrimSpace(string(out)) == "" {
			return nil, nil
		}
		return nil, fmt.Errorf("lsof on port %d: %w", port, err)
	}
	seen := map[int]bool{}
	var pids []int
	for _, field := range strings.Fields(string(out)) {
		pid, convErr := strconv.Atoi(field)
		if convErr != nil || pid <= 1 || seen[pid] {
			continue
		}
		seen[pid] = true
		pids = append(pids, pid)
	}
	return pids, nil
}

// unixProcessCommand returns the full command line of pid (`ps -o command=`,
// supported by both BSD ps on macOS and procps on Linux).
func unixProcessCommand(pid int) (string, error) {
	out, err := exec.Command("ps", "-o", "command=", "-p", strconv.Itoa(pid)).Output()
	if err != nil {
		return "", fmt.Errorf("ps for PID %d: %w", pid, err)
	}
	cmdline := strings.TrimSpace(string(out))
	if cmdline == "" {
		return "", fmt.Errorf("PID %d not found", pid)
	}
	return cmdline, nil
}

// isOwnedNucleusNodeCommand reports whether cmdline is the installed managed
// Node runtime (exact absolute argv[0]) running the installed bundle.js as a
// whole argument.
func isOwnedNucleusNodeCommand(cmdline, expectedNode, expectedBundle string) bool {
	cmdline = strings.TrimSpace(cmdline)
	if !strings.HasPrefix(cmdline, expectedNode+" ") {
		return false
	}
	args := " " + strings.TrimSpace(strings.TrimPrefix(cmdline, expectedNode)) + " "
	return strings.Contains(args, " "+expectedBundle+" ")
}

// terminateVerifiedUnixPID re-verifies identity right before each signal
// (closing the PID-reuse window between discovery and termination), sends
// SIGTERM, waits up to timeout, then SIGKILL. A PID that disappears or turns
// into a different process mid-way counts as already gone.
func terminateVerifiedUnixPID(pid int, expectedNode, expectedBundle string, timeout time.Duration) error {
	stillOurs := func() bool {
		cmdline, err := unixProcessCommand(pid)
		return err == nil && isOwnedNucleusNodeCommand(cmdline, expectedNode, expectedBundle)
	}

	if !stillOurs() {
		return nil
	}
	if err := syscall.Kill(pid, syscall.SIGTERM); err != nil {
		if errors.Is(err, syscall.ESRCH) {
			return nil
		}
		return fmt.Errorf("SIGTERM to verified Bloom Control Plane PID %d: %w", pid, err)
	}
	if waitUnixPIDExit(pid, timeout) {
		return nil
	}

	if !stillOurs() {
		return nil
	}
	if err := syscall.Kill(pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
		return fmt.Errorf("SIGKILL to verified Bloom Control Plane PID %d: %w", pid, err)
	}
	if waitUnixPIDExit(pid, 3*time.Second) {
		return nil
	}
	return fmt.Errorf("verified Bloom Control Plane PID %d did not exit after SIGKILL", pid)
}

func waitUnixPIDExit(pid int, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if err := syscall.Kill(pid, 0); errors.Is(err, syscall.ESRCH) {
			return true
		}
		time.Sleep(200 * time.Millisecond)
	}
	return false
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

// launchctlPlistPath resolves the LaunchAgent plist path for a label,
// assuming the installer's own convention: one file per label under
// ~/Library/LaunchAgents, named <label>.plist (confirmed for
// com.bloom.nucleus — ~/Library/LaunchAgents/com.bloom.nucleus.plist).
func launchctlPlistPath(label string) (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("launchctl: could not determine home directory: %w", err)
	}
	return filepath.Join(home, "Library", "LaunchAgents", label+".plist"), nil
}

// launchctlControl stops or starts a launchd job on macOS via its label.
//
// FIX (`metamorph rollout --only nucleus` never seeing port 48215 go free,
// confirmed on Darwin): this used to send plain `launchctl stop <label>` /
// `launchctl start <label>`. `stop` asks the running job to terminate, but
// it does NOT remove the job from launchd's supervision — and
// com.bloom.nucleus.plist (confirmed by cat'ing it) has KeepAlive set to
// true, specifically so the service survives a crash on its own. That same
// KeepAlive means launchd respawns the job again right after `stop` kills
// it (throttled by ThrottleInterval, 15s in that plist), so the port the
// rollout is waiting to see freed never actually stays free — no matter
// how long nucleusPreDeploy's waitForPortFree timeout is raised (confirmed:
// raising it from 10s to 30s changed nothing, it just took longer to fail).
//
// For a KeepAlive job, "stop and stay stopped until I say otherwise" is
// what unloading does, not stopping: `launchctl unload` removes the job
// from launchd's active list entirely, so nothing restarts it until `load`
// puts it back. That's the correct verb pair here, matching the actual
// intent of PreDeploy/PostDeploy (take the service fully down to replace
// its binary, then bring it back) — not toggling a running/stopped flag on
// a job launchd is actively keeping alive underneath that flag.
func launchctlControl(name string, start bool) (bool, error) {
	plistPath, err := launchctlPlistPath(name)
	if err != nil {
		return false, err
	}

	if !start {
		if running, checkErr := launchctlIsLoaded(name); checkErr == nil && !running {
			return true, nil
		}

		cmd := exec.Command("launchctl", "unload", plistPath)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		if err := cmd.Run(); err != nil {
			return false, fmt.Errorf("launchctl unload %s: %w", plistPath, err)
		}
		// Same socket-release race as systemctl above — unload does
		// actually remove the job (no KeepAlive respawn to fight this
		// time), but the kernel can still take a moment to release the
		// socket after the process exits.
		time.Sleep(2 * time.Second)
		return false, nil
	}

	cmd := exec.Command("launchctl", "load", plistPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return false, fmt.Errorf("launchctl load %s: %w", plistPath, err)
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
// Not currently called anywhere: kept only because it predates this pass and
// removing it isn't this change's job. Metamorph never invokes sudo itself
// (see ensureElevated) -- if you're reaching for this, that's a sign the
// caller should instead do what applySandboxSetuid in rollout.go does: act
// only within normal-user privileges and tell the human what to run by hand.
func sudoChown(path string, uid, gid int) error {
	cmd := exec.Command("sudo", "chown", fmt.Sprintf("%d:%d", uid, gid), path)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

// sandboxAlreadyFixed reports whether sandbox is already owned by root
// with the setuid bit set, so applySandboxSetuid can skip the pkexec
// round-trip (and its dialog) on the common case (nothing changed since
// the last fix). Lives here because syscall.Stat_t only exists on Unix.
func sandboxAlreadyFixed(sandbox string) bool {
	info, err := os.Stat(sandbox)
	if err != nil {
		return false
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok {
		return false
	}
	return stat.Uid == 0 && stat.Gid == 0 && info.Mode().Perm() == 0o755 && info.Mode()&os.ModeSetuid != 0
}
