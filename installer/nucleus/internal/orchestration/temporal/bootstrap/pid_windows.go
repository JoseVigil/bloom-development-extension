//go:build windows

package bootstrap

import (
	"syscall"
)

// isProcessRunning verifica si un proceso está corriendo
func isProcessRunning(pid int) bool {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	openProcess := kernel32.NewProc("OpenProcess")

	handle, _, _ := openProcess.Call(
		uintptr(0x1000), // PROCESS_QUERY_LIMITED_INFORMATION
		uintptr(0),
		uintptr(pid))

	if handle == 0 {
		return false
	}

	closeHandle := kernel32.NewProc("CloseHandle")
	closeHandle.Call(handle)
	return true
}
