//go:build darwin

package session

import (
	"os/exec"
	"strings"
)

// Manager gestiona la detección del estado de sesión en macOS.
// En Windows el equivalente usa wtsapi32.dll; aquí usamos ioreg/CGSSession.
type Manager struct{}

func NewManager() *Manager { return &Manager{} }

// IsSessionActive devuelve true si la sesión macOS está activa (pantalla desbloqueada).
//
// Estrategia: consulta el IORegistry para leer CGSSessionScreenIsLocked.
// Esta clave la escribe WindowServer cuando el screensaver/lock está activo.
//
// Degradación elegante: si ioreg falla por cualquier motivo (permisos,
// sandboxing futuro, etc.) se asume sesión activa para no bloquear al sensor.
func (m *Manager) IsSessionActive() bool {
	// -n Root: nodo raíz del IORegistry
	// -d1: profundidad 1 (suficiente para leer las claves de CGSSession)
	out, err := exec.Command("ioreg", "-n", "Root", "-d1").Output()
	if err != nil {
		// No se pudo consultar — asumir activa (fail-open)
		return true
	}
	// WindowServer escribe esta clave cuando la pantalla está bloqueada
	return !strings.Contains(string(out), `"CGSSessionScreenIsLocked" = Yes`)
}

// IsSessionLocked es el inverso de IsSessionActive.
// Equivalente directo de WTSQuerySessionInformation(WTSSessionInfoEx) en Windows.
func (m *Manager) IsSessionLocked() bool {
	return !m.IsSessionActive()
}
