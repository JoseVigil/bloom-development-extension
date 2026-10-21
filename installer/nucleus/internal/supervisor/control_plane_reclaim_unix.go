//go:build !windows

package supervisor

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// controlPlanePorts are the listeners owned by the Control Plane (bundle.js):
// HTTP API and WebSocket.
var controlPlanePorts = []int{48215, 4124}

// reclaimControlPlanePort runs right before bootControlPlane spawns bundle.js.
//
// FIX (orphaned Control Plane, Darwin 2026-10-19): bootControlPlane used to
// spawn unconditionally. When an older `node bundle.js` was still listening
// on :48215/:4124, the new child crashed with EADDRINUSE — but its PID had
// already overwritten run/control_plane_api.pid, so Shutdown (pidfile-based)
// lost track of the real listener forever. That orphan survived every
// service stop/unload and blocked `metamorph rollout --only nucleus`.
//
// Now: if a Control Plane port is held by the exact managed runtime running
// the exact installed bundle (`<bin>/node/node … <bin>/bootstrap/bundle.js`),
// it belongs to this installation — terminate it (SIGTERM, then SIGKILL) and
// wait for the ports to free before spawning. If a port is held by anything
// else, refuse to spawn and say who holds it, instead of launching a child
// that is guaranteed to crash and corrupt the pidfile.
//
// Without lsof (minimal Linux images) this is a no-op, i.e. old behavior.
func reclaimControlPlanePort(nodePath, bundleScript string) error {
	for _, port := range controlPlanePorts {
		pids, err := cpListenerPIDs(port)
		if err != nil {
			return err
		}
		for _, pid := range pids {
			if pid == os.Getpid() {
				continue
			}
			cmdline, cmdErr := cpProcessCommand(pid)
			if cmdErr != nil {
				continue // exited between lsof and ps
			}
			if !isManagedControlPlaneCommand(cmdline, nodePath, bundleScript) {
				return fmt.Errorf("Control Plane port %d is held by foreign PID %d (%q); not starting a second Control Plane", port, pid, cmdline)
			}
			fmt.Fprintf(os.Stderr, "[WARN] orphaned Control Plane (PID %d) still listening on :%d — terminating before boot\n", pid, port)
			if err := cpTerminateVerified(pid, nodePath, bundleScript); err != nil {
				return err
			}
		}
	}

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		busy := false
		for _, port := range controlPlanePorts {
			if pids, _ := cpListenerPIDs(port); len(pids) > 0 {
				busy = true
			}
		}
		if !busy {
			return nil
		}
		time.Sleep(200 * time.Millisecond)
	}
	return fmt.Errorf("Control Plane ports %v still in use after reclaiming the orphaned Control Plane", controlPlanePorts)
}

func cpListenerPIDs(port int) ([]int, error) {
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

func cpProcessCommand(pid int) (string, error) {
	out, err := exec.Command("ps", "-o", "command=", "-p", strconv.Itoa(pid)).Output()
	if err != nil {
		return "", err
	}
	cmdline := strings.TrimSpace(string(out))
	if cmdline == "" {
		return "", fmt.Errorf("PID %d not found", pid)
	}
	return cmdline, nil
}

func isManagedControlPlaneCommand(cmdline, nodePath, bundleScript string) bool {
	cmdline = strings.TrimSpace(cmdline)
	if !strings.HasPrefix(cmdline, nodePath+" ") {
		return false
	}
	args := " " + strings.TrimSpace(strings.TrimPrefix(cmdline, nodePath)) + " "
	return strings.Contains(args, " "+bundleScript+" ")
}

// cpTerminateVerified re-checks identity before each signal so a reused PID
// is never killed.
func cpTerminateVerified(pid int, nodePath, bundleScript string) error {
	stillOurs := func() bool {
		cmdline, err := cpProcessCommand(pid)
		return err == nil && isManagedControlPlaneCommand(cmdline, nodePath, bundleScript)
	}
	gone := func(timeout time.Duration) bool {
		deadline := time.Now().Add(timeout)
		for time.Now().Before(deadline) {
			if err := syscall.Kill(pid, 0); errors.Is(err, syscall.ESRCH) {
				return true
			}
			time.Sleep(200 * time.Millisecond)
		}
		return false
	}

	if !stillOurs() {
		return nil
	}
	if err := syscall.Kill(pid, syscall.SIGTERM); err != nil && !errors.Is(err, syscall.ESRCH) {
		return fmt.Errorf("SIGTERM to orphaned Control Plane PID %d: %w", pid, err)
	}
	if gone(10 * time.Second) {
		return nil
	}
	if !stillOurs() {
		return nil
	}
	if err := syscall.Kill(pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
		return fmt.Errorf("SIGKILL to orphaned Control Plane PID %d: %w", pid, err)
	}
	if gone(3 * time.Second) {
		return nil
	}
	return fmt.Errorf("orphaned Control Plane PID %d did not exit after SIGKILL", pid)
}
