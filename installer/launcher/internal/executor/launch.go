// internal/executor/launch.go
// Ejecutor real — hace el Popen de chrome.exe en Session 1 (sesión interactiva)
// Este es el único propósito del proceso: tener acceso al display del usuario

package executor

import (
	"fmt"
	"os/exec"
	"runtime"
	"syscall"

	"bloom-launcher/internal/pipe"
)

// HandleLaunch recibe la request de Brain y ejecuta Chrome en la sesión actual
func HandleLaunch(req pipe.LaunchRequest) pipe.LaunchResponse {
	if len(req.Args) == 0 {
		return pipe.LaunchResponse{
			Success: false,
			Error:   "args vacíos — se requiere al menos chrome.exe",
		}
	}

	exe := req.Args[0]
	args := req.Args[1:]

	cmd := exec.Command(exe, args...)

	// Desacoplar completamente del proceso padre
	// Chrome no hereda stdin/stdout/stderr de bloom-launcher
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Stdin = nil

	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			// DETACHED_PROCESS (0x00000008) — no hereda consola
			// CREATE_NEW_PROCESS_GROUP (0x00000200) — grupo propio
			// NO creationflags de Session 0 — hereda la sesión de bloom-launcher (Session 1)
			CreationFlags: 0x00000008 | 0x00000200,
		}
	}

	if err := cmd.Start(); err != nil {
		return pipe.LaunchResponse{
			Success: false,
			Error:   fmt.Sprintf("Popen falló: %v", err),
		}
	}

	// Desacoplar el proceso — bloom-launcher no espera a que Chrome termine
	go cmd.Wait()

	return pipe.LaunchResponse{
		Success: true,
		PID:     cmd.Process.Pid,
	}
}
