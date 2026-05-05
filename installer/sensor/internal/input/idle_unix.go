// internal/input/idle_unix.go

//go:build !windows

package input

// IdleSeconds retorna 0 en plataformas no-Windows.
// La detección de idle vía GetLastInputInfo es exclusiva de Windows.
func IdleSeconds() uint32 { return 0 }
