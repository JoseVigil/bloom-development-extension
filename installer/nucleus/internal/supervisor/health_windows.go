// File: internal/supervisor/health_windows.go
//go:build windows

package supervisor

import (
	"os/exec"
	"syscall"
)

// setSvelteProcAttr configures the Svelte dev server process to run detached
// from the current console on Windows. CREATE_NEW_PROCESS_GROUP ensures the
// child is not killed when the parent's console window closes or receives Ctrl+C.
func setSvelteProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP,
	}
}