//go:build windows

package maintenance

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"golang.org/x/sys/windows/svc/mgr"
)

// ensureElevated checks if the process is running as administrator.
// If not, it re-launches itself with UAC elevation and exits the current process.
func ensureElevated() error {
	elevated, err := isElevated()
	if err != nil {
		return fmt.Errorf("could not check elevation status: %w", err)
	}
	if elevated {
		return nil
	}

	// Re-launch with elevation via ShellExecuteW "runas".
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("could not determine executable path: %w", err)
	}

	// Build the original args string to pass through.
	args := strings.Join(os.Args[1:], " ")

	verbPtr, _ := windows.UTF16PtrFromString("runas")
	exePtr, _ := windows.UTF16PtrFromString(exe)
	argsPtr, _ := windows.UTF16PtrFromString(args)
	cwdPtr, _ := windows.UTF16PtrFromString(".")

	err = windows.ShellExecute(0, verbPtr, exePtr, argsPtr, cwdPtr, windows.SW_NORMAL)
	if err != nil {
		return fmt.Errorf("UAC elevation failed: %w", err)
	}

	// The elevated process is now running — exit this non-elevated instance.
	os.Exit(0)
	return nil
}

func sensorStop(dst string, dryRun bool) (bool, error) {
	if dryRun {
		return false, nil
	}
	out, _ := exec.Command("tasklist", "/FI", "IMAGENAME eq bloom-sensor.exe", "/NH").CombinedOutput()
	wasActive := strings.Contains(strings.ToLower(string(out)), "bloom-sensor.exe")
	if !wasActive {
		return false, nil
	}
	if out, err := exec.Command("taskkill", "/IM", "bloom-sensor.exe", "/T", "/F").CombinedOutput(); err != nil {
		return true, fmt.Errorf("taskkill bloom-sensor.exe: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		out, _ := exec.Command("tasklist", "/FI", "IMAGENAME eq bloom-sensor.exe", "/NH").CombinedOutput()
		if !strings.Contains(strings.ToLower(string(out)), "bloom-sensor.exe") {
			return true, nil
		}
		time.Sleep(250 * time.Millisecond)
	}
	return true, fmt.Errorf("bloom-sensor.exe is still running after stop")
}

func sensorStart(dst string) error {
	cmd := exec.Command(filepath.Join(dst, "bloom-sensor.exe"), "serve")
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: windows.CREATE_NEW_PROCESS_GROUP | windows.DETACHED_PROCESS, HideWindow: true}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start bloom-sensor.exe serve: %w", err)
	}
	return cmd.Process.Release()
}

// isElevated returns true if the current process has administrator privileges.
func isElevated() (bool, error) {
	token := windows.Token(0)
	if err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY, &token); err != nil {
		return false, err
	}
	defer token.Close()

	var elevation uint32
	var size uint32
	err := windows.GetTokenInformation(token, windows.TokenElevation,
		(*byte)(unsafe.Pointer(&elevation)), uint32(unsafe.Sizeof(elevation)), &size)
	if err != nil {
		return false, err
	}

	return elevation != 0, nil
}

// controlService stops (start=false) or starts (start=true) a Windows service
// using the Service Control Manager. Waits up to 10 seconds for the
// transition.
//
// Returns (wasNoop, err): wasNoop is true when there was nothing to do
// (service not installed, already stopped when asked to stop, already
// running when asked to start) so callers can log the idempotent case
// explicitly instead of implying an action that didn't happen — same
// contract as controlService in rollout_other.go.
func controlService(name string, start bool) (bool, error) {
	m, err := mgr.Connect()
	if err != nil {
		return false, fmt.Errorf("could not connect to SCM: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(name)
	if err != nil {
		// Service not found is not an error — it may not be installed yet.
		return true, nil
	}
	defer s.Close()

	status, err := s.Query()
	if err != nil {
		return false, fmt.Errorf("could not query service: %w", err)
	}

	if start {
		if status.State == svc.Running {
			return true, nil // already running
		}
		if err := s.Start(); err != nil {
			return false, fmt.Errorf("could not start: %w", err)
		}
		return false, waitForServiceState(s, svc.Running, 10*time.Second)
	}

	// Stop
	if status.State == svc.Stopped {
		return true, nil // already stopped
	}
	if _, err := s.Control(svc.Stop); err != nil {
		return false, fmt.Errorf("could not send stop: %w", err)
	}
	if err := waitForServiceState(s, svc.Stopped, 10*time.Second); err != nil {
		return false, err
	}
	// Same socket-release race flagged for Linux/macOS: SERVICE_STOPPED
	// confirms the process exited, but the kernel can still hold the port
	// briefly afterward. Give it a beat before the caller re-binds it.
	time.Sleep(2 * time.Second)
	return false, nil
}

// waitForServiceState polls until the service reaches the desired state or times out.
func waitForServiceState(s *mgr.Service, desired svc.State, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		status, err := s.Query()
		if err != nil {
			return err
		}
		if status.State == desired {
			return nil
		}
		time.Sleep(300 * time.Millisecond)
	}
	return fmt.Errorf("timed out waiting for service state %v", desired)
}
