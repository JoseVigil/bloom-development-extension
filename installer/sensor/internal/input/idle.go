// internal/input/idle.go

//go:build windows

package input

import (
	"syscall"
	"unsafe"
)

var (
	user32              = syscall.NewLazyDLL("user32.dll")
	procGetLastInputInfo = user32.NewProc("GetLastInputInfo")
	kernel32            = syscall.NewLazyDLL("kernel32.dll")
	procGetTickCount    = kernel32.NewProc("GetTickCount")
)

// LASTINPUTINFO es la estructura que espera GetLastInputInfo.
type lastInputInfo struct {
	cbSize uint32
	dwTime uint32
}

// IdleSeconds retorna los segundos transcurridos desde el último evento
// de teclado o mouse registrado por Windows.
// Si la llamada falla, retorna 0 (degradación elegante).
func IdleSeconds() uint32 {
	info := lastInputInfo{
		cbSize: uint32(unsafe.Sizeof(lastInputInfo{})),
	}

	ret, _, _ := procGetLastInputInfo.Call(uintptr(unsafe.Pointer(&info)))
	if ret == 0 {
		return 0
	}

	tickNow, _, _ := procGetTickCount.Call()
	idleMs := uint32(tickNow) - info.dwTime

	// Protección contra overflow del tick counter (se reinicia cada ~49 días)
	if idleMs > uint32(tickNow) {
		return 0
	}

	return idleMs / 1000
}
