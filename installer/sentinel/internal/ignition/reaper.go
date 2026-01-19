package ignition

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
)

func (ig *Ignition) SetupReaper() {
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigs
		ig.KillAll()
		os.Exit(0)
	}()

	go func() {
		b := make([]byte, 1)
		os.Stdin.Read(b)
		ig.KillAll()
		os.Exit(0)
	}()
}

func (ig *Ignition) KillAll() {
	ig.Core.Logger.Warning("[REAPER] Ejecutando purga de sesión %s", ig.Session.LaunchID)

	// 1. Matar el Browser PID detectado por el JSON de Python
	if ig.Session.BrowserPID > 0 {
		ig.Core.Logger.Info("[REAPER] Terminando Browser (PID %d)...", ig.Session.BrowserPID)
		exec.Command("taskkill", "/F", "/PID", fmt.Sprintf("%d", ig.Session.BrowserPID), "/T").Run()
	}

	// 2. Matar el Service PID (Brain.exe)
	if ig.Session.ServicePID > 0 {
		exec.Command("taskkill", "/F", "/PID", fmt.Sprintf("%d", ig.Session.ServicePID), "/T").Run()
	}

	ig.Core.Logger.Success("[REAPER] Limpieza quirúrgica completada.")
}