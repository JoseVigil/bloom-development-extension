package ignition

import (
	"os"
	"os/exec"
	"os/signal"
	"syscall"
)

func (ig *Ignition) SetupReaper() {
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)

	// Manejo de Ctrl+C o señales del sistema
	go func() {
		<-sigs
		ig.Core.Logger.Warning("\n[REAPER] Señal de cierre recibida. Ejecutando limpieza coordinada...")
		ig.KillAll()
		os.Exit(0)
	}()

	// Monitorizar stdin (si Electron cierra el proceso padre)
	go func() {
		// Leemos un byte. Si Read devuelve error o termina, el pipe se cerró.
		b := make([]byte, 1)
		_, err := os.Stdin.Read(b)
		if err != nil {
			ig.Core.Logger.Warning("[REAPER] Stdin cerrado. Aniquilando procesos...")
			ig.KillAll()
			os.Exit(0)
		}
	}()
}

func (ig *Ignition) KillAll() {
	// 1. Matar Chromium
	exec.Command("taskkill", "/F", "/IM", "chrome.exe", "/T").Run()
	
	// 2. Matar Brain Service
	exec.Command("taskkill", "/F", "/IM", "brain.exe", "/T").Run()
	
	// 3. Matar Hosts Nativos
	exec.Command("taskkill", "/F", "/IM", "bloom-host.exe", "/T").Run()
	
	// 4. Limpiar Spec temporal si existe
	if ig.SpecPath != "" {
		os.Remove(ig.SpecPath)
	}
	
	ig.Core.Logger.Success("[REAPER] Sistema purgado con éxito.")
}