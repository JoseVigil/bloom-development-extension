//go:build !windows

package bootstrap

import (
	"os/exec"
	"syscall"
)

// setPlatformSysProcAttr configura atributos de proceso para Unix/Darwin.
// Setpgid crea un nuevo grupo de procesos, equivalente a CREATE_NEW_PROCESS_GROUP en Windows.
func setPlatformSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setpgid: true,
	}
}
