// File: internal/orchestration/commands/sysproc_other.go
//go:build !windows

package commands

import "syscall"

// detachSysProcAttr is a no-op on non-Windows platforms
func detachSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{}
}