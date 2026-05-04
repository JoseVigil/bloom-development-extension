package bootstrap

import (
	"fmt"
	"os"
	"strconv"
	"strings"
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
