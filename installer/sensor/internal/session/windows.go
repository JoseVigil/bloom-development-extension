// internal/session/windows.go

//go:build windows

package session

import (
	"syscall"
	"unsafe"
)

var (
	wtsapi32                    = syscall.NewLazyDLL("wtsapi32.dll")
	procWTSQuerySessionInfo     = wtsapi32.NewProc("WTSQuerySessionInformationW")
	procWTSFreeMemory           = wtsapi32.NewProc("WTSFreeMemory")
	user32                      = syscall.NewLazyDLL("user32.dll")
	procGetForegroundWindow     = user32.NewProc("GetForegroundWindow")
)

const (
	WTSCurrentServerHandle uintptr = 0
	WTSCurrentSession      uint32  = 0xFFFFFFFF
	WTSConnectState        uint32  = 8
)

// WTSConnectStateClass representa el estado de conexión de una sesión WTS.
type WTSConnectStateClass int32

const (
	WTSActive       WTSConnectStateClass = 0
	WTSConnected    WTSConnectStateClass = 1
	WTSDisconnected WTSConnectStateClass = 4
)

// Manager gestiona la detección del estado de sesión Windows.
type Manager struct{}

func NewManager() *Manager { return &Manager{} }

// IsSessionActive devuelve true si la sesión actual está activa (no bloqueada/desconectada).
// Usa WTSQuerySessionInformation para obtener el estado WTS de la sesión actual.
// Si la llamada falla, asume activa (degradación elegante).
func (m *Manager) IsSessionActive() bool {
	var buf uintptr
	var bytesReturned uint32

	ret, _, _ := procWTSQuerySessionInfo.Call(
		WTSCurrentServerHandle,
		uintptr(WTSCurrentSession),
		uintptr(WTSConnectState),
		uintptr(unsafe.Pointer(&buf)),
		uintptr(unsafe.Pointer(&bytesReturned)),
	)

	if ret == 0 {
		// Si la llamada falla, asumimos activa (degradación elegante)
		return true
	}
	defer procWTSFreeMemory.Call(buf)

	state := *(*WTSConnectStateClass)(unsafe.Pointer(buf))
	return state == WTSActive
}

// IsSessionLocked es el complemento semántico de IsSessionActive.
func (m *Manager) IsSessionLocked() bool {
	return !m.IsSessionActive()
}
