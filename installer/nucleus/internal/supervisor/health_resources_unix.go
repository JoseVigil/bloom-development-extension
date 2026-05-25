// File: internal/supervisor/health_resources_unix.go
// Platform-specific memory check for Linux and macOS.
// Reads /proc/meminfo on Linux, vm_stat on macOS.
//
//go:build !windows

package supervisor

import (
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
)

// memoryThresholds returns platform-appropriate memory thresholds in MB.
//
// Windows: high thresholds — Temporal's VirtualAlloc is aggressive and crashes
// under low memory. 2000/1000 MB are the safe minimums observed in production.
//
// macOS: lower thresholds — darwin's memory compression (Compressed Memory) and
// unified memory architecture make the kernel a much better steward of RAM than
// Windows. Temporal on darwin runs comfortably with less headroom. VSCode and
// other dev tools regularly consume RAM that macOS reclaims on demand, so a
// strict 2000 MB threshold produces false PRESSURE alerts during normal dev work.
//
// On darwin the DEGRADED threshold defaults to 512 MB but can be overridden via
// BLOOM_MEMORY_THRESHOLD_MB to accommodate different dev environments.
//
// Linux: conservative thresholds, same as Windows — Linux does not compress
// memory by default and server workloads expect headroom.
func memoryThresholds() (degradedMB, pressureMB int64) {
	if runtime.GOOS == "darwin" {
		degraded := int64(512)
		if v := os.Getenv("BLOOM_MEMORY_THRESHOLD_MB"); v != "" {
			if parsed, err := strconv.ParseInt(v, 10, 64); err == nil {
				degraded = parsed
			}
		}
		return degraded, degraded / 2 // PRESSURE at half the DEGRADED threshold
	}
	return 2000, 1000 // linux: DEGRADED < 2GB, PRESSURE < 1GB
}

// checkMemory reads available RAM and returns a MemoryHealth.
// On Linux uses /proc/meminfo (MemAvailable — correct metric since kernel 3.14+).
// On macOS uses vm_stat (pages free + inactive) for free memory,
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

	// macOS: vm_stat for free memory + hw.memsize sysctl for total.
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
	totalMB = darwinTotalMemoryMB()
	return freeMB, totalMB, nil
}
