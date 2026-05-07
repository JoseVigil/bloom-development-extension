// internal/session/unix.go

//go:build !windows && !darwin

package session

// Manager gestiona la detección del estado de sesión.
// En plataformas no-Windows/no-darwin, asume sesión siempre activa.
type Manager struct{}

func NewManager() *Manager { return &Manager{} }

// IsSessionActive siempre retorna true en plataformas no-Windows.
func (m *Manager) IsSessionActive() bool { return true }

// IsSessionLocked siempre retorna false en plataformas no-Windows.
func (m *Manager) IsSessionLocked() bool { return false }
