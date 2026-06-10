// File: internal/supervisor/health_resources_linux.go
// Platform-specific memory check for Linux.
// Reads /proc/meminfo (MemAvailable — correct metric since kernel 3.14+).
//
//go:build linux

package supervisor

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// memoryThresholds returns Linux memory thresholds in MB.
// Linux does not compress memory by default and server workloads expect headroom.
func memoryThresholds() (degradedMB, pressureMB int64) {
	return 2000, 1000 // DEGRADED < 2GB, PRESSURE < 1GB
}

// checkMemory reads available RAM from /proc/meminfo and returns a MemoryHealth.
// Falls back to UNKNOWN if the read fails — never panics.
func checkMemory() MemoryHealth {
	freeMB, totalMB, err := readFreeMemoryMB()
	if err != nil {
		return MemoryHealth{
			State: "UNKNOWN",
			Error: fmt.Sprintf("memory check failed: %v", err),
		}
	}

	degradedMB, pressureMB := memoryThresholds()

	switch {
	case freeMB < pressureMB:
		return MemoryHealth{
			State:   "PRESSURE",
			FreeMB:  freeMB,
			TotalMB: totalMB,
			Message: fmt.Sprintf("Critical memory pressure — %d MB free of %d MB total (threshold: %d MB)", freeMB, totalMB, pressureMB),
		}
	case freeMB < degradedMB:
		return MemoryHealth{
			State:   "DEGRADED",
			FreeMB:  freeMB,
			TotalMB: totalMB,
			Message: fmt.Sprintf("Low memory — %d MB free of %d MB total (threshold: %d MB)", freeMB, totalMB, degradedMB),
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

// readFreeMemoryMB reads MemAvailable and MemTotal from /proc/meminfo.
func readFreeMemoryMB() (freeMB, totalMB int64, err error) {
	data, readErr := os.ReadFile("/proc/meminfo")
	if readErr != nil {
		return 0, 0, fmt.Errorf("cannot read /proc/meminfo: %v", readErr)
	}

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

	if available == 0 {
		return 0, 0, fmt.Errorf("/proc/meminfo parsed but MemAvailable not found")
	}
	return available, total, nil
}
