package ignition

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

// Launch ejecuta la secuencia de lanzamiento del perfil
// Sentinel lanza, el Brain gobierna
func (ig *Ignition) Launch(profileID string, mode string, configOverride string) (int, int, bool, map[string]interface{}, error) {
	ig.Core.Logger.Info("[IGNITION] 🚀 Iniciando secuencia soberana de lanzamiento (Modo: %s)", mode)

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

	chromePID, err := ig.execute(profileID, mode, profileData)
	if err != nil {
		return 0, 0, false, nil, fmt.Errorf("fallo al ejecutar el motor: %v", err)
	}

	ig.Session.BrowserPID = chromePID

	if ig.Core.IsJSON {
		return chromePID, 9222, true, effectiveConfig, nil
	}

	ig.Core.Logger.Success("[IGNITION] 🔥 Sistema en línea (PID: %d)", chromePID)
	return chromePID, 9222, true, effectiveConfig, nil
}

// applyMissionTargetURL aplica la lógica de TargetURL según los flags de misión
func (ig *Ignition) applyMissionTargetURL(spec *IgnitionSpec, profileData map[string]interface{}) {
	heartbeat, _ := profileData["heartbeat"].(bool)
	register, _ := profileData["register"].(bool)
	service, _ := profileData["service"].(string)

	if heartbeat && !register {
		spec.TargetURL = "about:blank"
		ig.Core.Logger.Info("[IGNITION] Modo Heartbeat: about:blank")
		return
	}

	if register && service != "" {
		switch service {
		case "google,gemini":
			spec.TargetURL = "https://aistudio.google.com/app/apikey"
			ig.Core.Logger.Info("[IGNITION] Misión: Google + Gemini")
		case "github":
			spec.TargetURL = "https://github.com/login"
			ig.Core.Logger.Info("[IGNITION] Misión: GitHub")
		case "twitter":
			spec.TargetURL = "https://twitter.com/i/flow/login"
			ig.Core.Logger.Info("[IGNITION] Misión: Twitter")
		default:
			ig.Core.Logger.Info("[IGNITION] Servicio desconocido: %s", service)
		}
	}
}

// execute construye los argumentos y lanza Chromium
func (ig *Ignition) execute(profileID string, mode string, profileData map[string]interface{}) (int, error) {
	spec, err := ig.loadIgnitionSpec(profileID)
	if err != nil {
		return 0, fmt.Errorf("no se pudo cargar spec de ignition: %v", err)
	}

	ig.applyMissionTargetURL(spec, profileData)

	args := ig.buildSilentLaunchArgs(spec, mode)

	cmd := exec.Command(spec.Engine.Executable, args...)

	if runtime.GOOS == "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{
			HideWindow:    true,
			CreationFlags: 0x08000000,
		}
	}

	logDir := filepath.Join(ig.Core.Paths.AppDataDir, "logs", "chromium")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		ig.Core.Logger.Info("[WARN] No se pudo crear directorio de logs: %v", err)
	}

	logFilePath := filepath.Join(logDir, fmt.Sprintf("%s_%s.log", profileID, time.Now().Format("20060102_150405")))
	logFile, err := os.Create(logFilePath)
	if err != nil {
		ig.Core.Logger.Info("[WARN] No se pudo crear archivo de log %s: %v → salida por defecto", logFilePath, err)
	} else {
		defer logFile.Close()
		cmd.Stdout = logFile
		cmd.Stderr = logFile
	}

	if err := cmd.Start(); err != nil {
		return 0, fmt.Errorf("error al iniciar Chromium: %v", err)
	}

	time.Sleep(250 * time.Millisecond)

	pid := cmd.Process.Pid
	if pid <= 0 {
		_ = cmd.Process.Kill()
		return 0, fmt.Errorf("PID no disponible después de start")
	}

	time.Sleep(800 * time.Millisecond)
	if !ig.isProcessAlive(pid) {
		_ = cmd.Process.Kill()
		return 0, fmt.Errorf("proceso Chromium murió inmediatamente (PID %d)", pid)
	}

	ig.Core.Logger.Info("[EXECUTE] Motor Chromium iniciado → PID: %d | Log: %s", pid, logFilePath)
	return pid, nil
}

// isProcessAlive verifica si un proceso está activo
func (ig *Ignition) isProcessAlive(pid int) bool {
	if runtime.GOOS == "windows" {
		cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/NH")
		output, err := cmd.Output()
		return err == nil && len(output) > 0 && !strings.Contains(string(output), "No tasks")
	}
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	err = process.Signal(syscall.Signal(0))
	return err == nil
}

// preFlight realiza verificaciones previas al lanzamiento
func (ig *Ignition) preFlight(profileID string) {
	ig.freePortQuirurgico(9222)

	lockPath := filepath.Join(ig.Core.Paths.ProfilesDir, profileID, "SingletonLock")
	if _, err := os.Stat(lockPath); err == nil {
		if err := os.Remove(lockPath); err == nil {
			ig.Core.Logger.Info("[PRE-FLIGHT] SingletonLock eliminado")
		} else {
			ig.Core.Logger.Info("[WARN] No se pudo eliminar SingletonLock: %v", err)
		}
	}
}

// freePortQuirurgico libera el puerto especificado matando procesos que lo ocupan
func (ig *Ignition) freePortQuirurgico(port int) {
	if runtime.GOOS != "windows" {
		ig.Core.Logger.Info("[WARN] [PORT] Liberación quirúrgica de puerto solo implementada en Windows por ahora")
		return
	}

	cmd := exec.Command("cmd", "/C", fmt.Sprintf("netstat -ano | findstr :%d", port))
	out, err := cmd.Output()
	if err != nil {
		return
	}

	lines := strings.Split(string(out), "\r\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}
		pidStr := fields[4]
		if pidStr == "0" || pidStr == "" {
			continue
		}

		kill := exec.Command("taskkill", "/F", "/PID", pidStr, "/T")
		if err := kill.Run(); err == nil {
			ig.Core.Logger.Info("[PORT] Proceso %s terminado para liberar puerto %d", pidStr, port)
		}
	}

	time.Sleep(1200 * time.Millisecond)
}