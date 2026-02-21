// File: internal/orchestration/commands/sysproc_windows.go
// Windows-specific syscall attributes for detached process launch
//go:build windows

package commands

import (
	"syscall"
)

// detachSysProcAttr returns SysProcAttr that creates a new process group
// and detaches from the parent console — needed for bloom-launcher.exe serve
func detachSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{
		CreationFlags: syscall.CREATE_NEW_PROCESS_GROUP | 0x00000008, // DETACHED_PROCESS
	}
}