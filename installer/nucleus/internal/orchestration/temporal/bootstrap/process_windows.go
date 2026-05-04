//go:build windows

package bootstrap

import (
	"os/exec"
	"syscall"
)

// setPlatformSysProcAttr configura atributos de proceso para Windows.
func setPlatformSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP,
		HideWindow:    true,
	}
}
