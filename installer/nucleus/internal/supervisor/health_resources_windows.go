// File: internal/supervisor/health_resources_windows.go
// Platform-specific memory check for Windows.
// Uses GlobalMemoryStatusEx via syscall — no CGO, no external dependencies.
//
//go:build windows

package supervisor

import (
	"fmt"
	"syscall"
	"unsafe"
)

// Thresholds for memory pressure classification.
// Hardcoded by design — not configurable until stabilization phase is complete.
const (
	memoryDegradedMB = 2000 // < 2GB → DEGRADED ⚠️  risk of Temporal VirtualAlloc crash
	memoryPressureMB = 1000 // < 1GB → PRESSURE 🔴 crash imminent
)

// memoryStatusEx mirrors the MEMORYSTATUSEX Windows struct.
// dwLength must be set to sizeof(MEMORYSTATUSEX) before calling GlobalMemoryStatusEx.
type memoryStatusEx struct {
	dwLength                uint32
	dwMemoryLoad            uint32
	ullTotalPhys            uint64
	ullAvailPhys            uint64
	ullTotalPageFile        uint64
	ullAvailPageFile        uint64
	ullTotalVirtual         uint64
	ullAvailVirtual         uint64
	ullAvailExtendedVirtual uint64
}

// checkMemory reads available physical RAM via GlobalMemoryStatusEx and returns
// a MemoryHealth with state OK / DEGRADED / PRESSURE / UNKNOWN.
//
// This function never panics — if the syscall fails it returns UNKNOWN with
// the error described. Memory pressure does NOT fail the health check; it is
// an observability signal, not a fixable component.
func checkMemory() MemoryHealth {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	globalMemoryStatusEx := kernel32.NewProc("GlobalMemoryStatusEx")

	var ms memoryStatusEx
	ms.dwLength = uint32(unsafe.Sizeof(ms))

	ret, _, err := globalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&ms)))
	if ret == 0 {
		return MemoryHealth{
			State: "UNKNOWN",
			Error: fmt.Sprintf("GlobalMemoryStatusEx failed: %v", err),
		}
	}

	freeMB  := int64(ms.ullAvailPhys) / (1024 * 1024)
	totalMB := int64(ms.ullTotalPhys) / (1024 * 1024)

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