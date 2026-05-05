//go:build windows

package maintenance

import (
	"fmt"
	"os"
	"strings"
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
// using the Service Control Manager. Waits up to 10 seconds for the transition.
func controlService(name string, start bool) error {
	m, err := mgr.Connect()
	if err != nil {
		return fmt.Errorf("could not connect to SCM: %w", err)
	}
	defer m.Disconnect()

	s, err := m.OpenService(name)
	if err != nil {
		// Service not found is not an error — it may not be installed yet.
		return nil
	}
	defer s.Close()

	status, err := s.Query()
	if err != nil {
		return fmt.Errorf("could not query service: %w", err)
	}

	if start {
		if status.State == svc.Running {
			return nil // already running
		}
		if err := s.Start(); err != nil {
			return fmt.Errorf("could not start: %w", err)
		}
		return waitForServiceState(s, svc.Running, 10*time.Second)
	}

	// Stop
	if status.State == svc.Stopped {
		return nil // already stopped
	}
	if _, err := s.Control(svc.Stop); err != nil {
		return fmt.Errorf("could not send stop: %w", err)
	}
	return waitForServiceState(s, svc.Stopped, 10*time.Second)
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
