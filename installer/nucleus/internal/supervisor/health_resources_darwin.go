// File: internal/supervisor/health_resources_darwin.go
// Platform-specific memory check for macOS.
// Reads vm_stat for free memory and hw.memsize sysctl for total memory.
//
//go:build darwin

package supervisor

import (
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
)

// memoryThresholds returns macOS memory thresholds in MB.
// Darwin's memory compression (Compressed Memory) and unified memory architecture
// make the kernel a much better steward of RAM than Windows. Temporal on darwin
// runs comfortably with less headroom. VSCode and other dev tools regularly consume
// RAM that macOS reclaims on demand, so a strict 2000 MB threshold produces false
// PRESSURE alerts during normal dev work.
//
// The DEGRADED threshold defaults to 512 MB but can be overridden via
// BLOOM_MEMORY_THRESHOLD_MB to accommodate different dev environments.
func memoryThresholds() (degradedMB, pressureMB int64) {
	degraded := int64(512)
	if v := os.Getenv("BLOOM_MEMORY_THRESHOLD_MB"); v != "" {
		if parsed, err := strconv.ParseInt(v, 10, 64); err == nil {
			degraded = parsed
		}
	}
	return degraded, degraded / 2 // PRESSURE at half the DEGRADED threshold
}

// checkMemory reads available RAM and returns a MemoryHealth.
// Uses vm_stat (pages free + inactive) for free memory,
// and hw.memsize sysctl for total memory.
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

// darwinTotalMemoryMB returns the total physical RAM on macOS via the hw.memsize
// sysctl. Returns 0 on error — callers treat 0 as "unavailable".
func darwinTotalMemoryMB() int64 {
	s, err := syscall.Sysctl("hw.memsize")
	if err != nil {
		return 0
	}
	b := []byte(s)
	if len(b) < 8 {
		return 0
	}
	return int64(binary.LittleEndian.Uint64(b)) / 1024 / 1024
}

// readFreeMemoryMB reads available memory via vm_stat and total via hw.memsize sysctl.
func readFreeMemoryMB() (freeMB, totalMB int64, err error) {
	out, vmErr := exec.Command("vm_stat").Output()
	if vmErr != nil {
		return 0, 0, fmt.Errorf("vm_stat not available: %v", vmErr)
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
	totalMB = darwinTotalMemoryMB()
	return freeMB, totalMB, nil
}
