// File: internal/supervisor/health_unix.go
//go:build !windows

package supervisor

import (
	"os/exec"
	"syscall"
)

// setSvelteProcAttr configures the Svelte dev server process to run in a new
// process group on Unix systems so it is not killed when the parent process exits.
func setSvelteProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}
}