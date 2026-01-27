package ignition

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sentinel/internal/health"
	"strings"
	"time"
)

func (ig *Ignition) Launch(profileID string, mode string, configOverride string) (int, int, bool, map[string]interface{}, error) {
	ig.Core.Logger.Info("[IGNITION] 🚀 Iniciando secuencia soberana de lanzamiento (Modo: %s).", mode)

	profileData, err := ig.getProfileData(profileID)
	if err != nil {
		return 0, 0, false, nil, fmt.Errorf("error crítico de inventario: %v", err)
	}

	ig.SpecPath = profileData["spec_path"].(string)
	launchID := ig.generateLogicalLaunchID(profileID)
	ig.Session.LaunchID = launchID

	ig.Core.Logger.Info("[IGNITION] Realizando pre-flight check...")
	ig.preFlight(profileID)

	effectiveConfig, err := ig.prepareSessionFiles(profileID, launchID, profileData, mode, configOverride)
	if err != nil {
		return 0, 0, false, nil, fmt.Errorf("fallo en la inyección de identidad: %v", err)
	}

	ig.Core.Logger.Info("[IGNITION] Sincronizando estados con el sistema de archivos...")
	time.Sleep(800 * time.Millisecond)

	if err := ig.startBrainService(); err != nil {
		return 0, 0, false, nil, err
	}

	finalPhysicalID, err := ig.execute(profileID)
	if err != nil {
		return 0, 0, false, nil, err
	}
	_ = finalPhysicalID

	if ig.Core.IsJSON {
		return ig.Session.BrowserPID, 5678, true, effectiveConfig, nil
	}

	guardian, err := health.NewGuardian(ig.Core, profileID, launchID, ig.Session.ServicePID)
	if err == nil {
		ig.Guardians[profileID] = guardian
		guardian.Start()
		ig.Core.Logger.Info("[IGNITION] 🛡️ Guardian desplegado con éxito.")
	}

	ig.Core.Logger.Success("[IGNITION] 🔥 Sistema en línea.")
	return ig.Session.BrowserPID, 5678, true, effectiveConfig, nil
}

func (ig *Ignition) preFlight(profileID string) {
	ig.freePortQuirurgico(5678)
	lock := filepath.Join(ig.Core.Paths.ProfilesDir, profileID, "SingletonLock")
	if _, err := os.Stat(lock); err == nil {
		_ = os.Remove(lock)
		ig.Core.Logger.Info("[IGNITION] SingletonLock eliminado.")
	}
}

func (ig *Ignition) freePortQuirurgico(port int) {
	cmd := exec.Command("cmd", "/C", fmt.Sprintf("netstat -ano | findstr :%d", port))
	out, _ := cmd.Output()
	lines := strings.Split(string(out), "\r\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}
		if fields[4] != "0" && fields[4] != "" {
			_ = exec.Command("taskkill", "/F", "/PID", fields[4], "/T").Run()
		}
	}
	time.Sleep(1 * time.Second)
}