// File: internal/supervisor/health_resources_unix.go
// Platform-specific memory check for Linux and macOS.
// Reads /proc/meminfo on Linux, vm_stat on macOS.
//
//go:build !windows

package supervisor

import (
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

const (
	memoryDegradedMB = 2000
	memoryPressureMB = 1000
)

// checkMemory reads available RAM and returns a MemoryHealth.
// On Linux uses /proc/meminfo (MemAvailable — correct metric since kernel 3.14+).
// On macOS uses vm_stat (pages free + inactive).
// Falls back to UNKNOWN if the read fails — never panics.
func checkMemory() MemoryHealth {
	freeMB, totalMB, err := readFreeMemoryMB()
	if err != nil {
		return MemoryHealth{
			State: "UNKNOWN",
			Error: fmt.Sprintf("memory check failed: %v", err),
		}
	}

	switch {
	case freeMB < memoryPressureMB:
		return MemoryHealth{
			State:   "PRESSURE",
			FreeMB:  freeMB,
			TotalMB: totalMB,
			Message: fmt.Sprintf("Critical memory pressure — %d MB free of %d MB total (threshold: %d MB)", freeMB, totalMB, memoryPressureMB),
		}
	case freeMB < memoryDegradedMB:
		return MemoryHealth{
			State:   "DEGRADED",
			FreeMB:  freeMB,
			TotalMB: totalMB,
			Message: fmt.Sprintf("Low memory — %d MB free of %d MB total (threshold: %d MB)", freeMB, totalMB, memoryDegradedMB),
		}
	default:
		return MemoryHealth{
			State:   "OK",
			FreeMB:  freeMB,
			TotalMB: totalMB,
			Message: fmt.Sprintf("%d MB free of %d MB total", freeMB, totalMB),
		}
	}
}

func readFreeMemoryMB() (freeMB, totalMB int64, err error) {
	// Linux: /proc/meminfo
	if data, readErr := os.ReadFile("/proc/meminfo"); readErr == nil {
		var available, total int64
		for _, line := range strings.Split(string(data), "\n") {
			fields := strings.Fields(line)
			if len(fields) < 2 {
				continue
			}
			val, parseErr := strconv.ParseInt(fields[1], 10, 64)
			if parseErr != nil {
				continue
			}
			switch fields[0] {
			case "MemAvailable:":
				available = val / 1024 // kB → MB
			case "MemTotal:":
				total = val / 1024
			}
		}
		if available > 0 {
			return available, total, nil
		}
	}

	// macOS: vm_stat
	out, vmErr := exec.Command("vm_stat").Output()
	if vmErr != nil {
		return 0, 0, fmt.Errorf("neither /proc/meminfo nor vm_stat available: %v", vmErr)
	}
	pageSize := int64(4096)
	var freePages int64
	for _, line := range strings.Split(string(out), "\n") {
		if strings.Contains(line, "page size of") {
			fields := strings.Fields(line)
			for i, f := range fields {
				if f == "size" && i+2 < len(fields) {
					if v, e := strconv.ParseInt(fields[i+2], 10, 64); e == nil {
						pageSize = v
					}
				}
			}
		}
		if strings.HasPrefix(line, "Pages free:") || strings.HasPrefix(line, "Pages inactive:") {
			fields := strings.Fields(line)
			if len(fields) > 0 {
				last := strings.TrimRight(fields[len(fields)-1], ".")
				if v, e := strconv.ParseInt(last, 10, 64); e == nil {
					freePages += v
				}
			}
		}
	}
	freeMB = (freePages * pageSize) / (1024 * 1024)
	return freeMB, 0, nil
}