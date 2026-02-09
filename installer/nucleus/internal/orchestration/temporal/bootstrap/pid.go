package bootstrap

import (
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
)

// savePID guarda el PID en un archivo
func savePID(pidFile string, pid int) error {
	return os.WriteFile(pidFile, []byte(fmt.Sprintf("%d", pid)), 0644)
}

// loadPID lee el PID desde el archivo
func loadPID(pidFile string) (int, error) {
	data, err := os.ReadFile(pidFile)
	if err != nil {
		return 0, err
	}
	
	pidStr := strings.TrimSpace(string(data))
	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		return 0, fmt.Errorf("invalid PID in file: %s", pidStr)
	}
	
	return pid, nil
}

// isProcessRunning verifica si un proceso está corriendo
func isProcessRunning(pid int) bool {
	if runtime.GOOS == "windows" {
		// En Windows, intentar abrir el proceso
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
	} else {
		// En Unix, usar kill con signal 0
		process, err := os.FindProcess(pid)
		if err != nil {
			return false
		}
		err = process.Signal(syscall.Signal(0))
		return err == nil
	}
}