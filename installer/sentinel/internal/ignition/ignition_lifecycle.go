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

	"sentinel/internal/core"
	"sentinel/internal/eventbus"
)

// Launch ejecuta la secuencia de lanzamiento del perfil.
// Sentinel lanza, el Brain gobierna.
// INVARIANTE: cuando IsJSON=true, SIEMPRE imprime JSON válido en stdout,
// tanto en éxito como en error. Nunca sale en silencio con exit 1.
func (ig *Ignition) Launch(profileID string, mode string, configOverride string) (int, int, bool, map[string]interface{}, error) {
	ig.Core.Logger.Info("[IGNITION] 🚀 Iniciando secuencia soberana de lanzamiento (Modo: %s)", mode)

	profileData, err := ig.getProfileData(profileID)
	if err != nil {
		return 0, 0, false, nil, fmt.Errorf("error crítico de inventario: %v", err)
	}

	specPathRaw, ok := profileData["spec_path"]
	if !ok {
		return 0, 0, false, nil, fmt.Errorf("campo spec_path ausente en profileData para perfil %s", profileID)
	}
	specPath, ok := specPathRaw.(string)
	if !ok || specPath == "" {
		return 0, 0, false, nil, fmt.Errorf("campo spec_path inválido en profileData para perfil %s", profileID)
	}
	ig.SpecPath = specPath

	// generateLogicalLaunchID NO incrementa el contador todavía.
	// El incremento ocurre en commitLaunchCount() tras éxito real.
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
	ig.Session.LaunchedAt = time.Now().UTC()

	// Confirmar el incremento de launch_count SOLO tras éxito real del launch.
	// Esto evita que los retries del worker Temporal corrompan el contador.
	if commitErr := ig.commitLaunchCount(profileID, launchID); commitErr != nil {
		ig.Core.Logger.Info("[WARN] No se pudo persistir launch_count: %v", commitErr)
	}

	// ── HISTORY: abrir registro y preparar session log ────────────────────────
	if err := ig.OpenLaunchRecord(profileID, launchID, mode, chromePID, effectiveConfig); err != nil {
		ig.Core.Logger.Info("[WARN] No se pudo abrir launch record: %v", err)
	}
	if sessionFile, err := ig.EnsureSessionFile(profileID, launchID); err == nil {
		effectiveConfig["session_log_path"] = sessionFile
	} else {
		ig.Core.Logger.Info("[WARN] No se pudo preparar session log: %v", err)
	}
	// ─────────────────────────────────────────────────────────────────────────

	ig.Core.Logger.Success("[IGNITION] 🔥 Sistema en línea (PID: %d)", chromePID)
	return chromePID, 9222, true, effectiveConfig, nil
}

// applyMissionTargetURL aplica la lógica de TargetURL según los flags de misión
func (ig *Ignition) applyMissionTargetURL(spec *IgnitionSpec, profileData map[string]interface{}) {
	heartbeat, _ := profileData["heartbeat"].(bool)
	register, _  := profileData["register"].(bool)
	service, _   := profileData["service"].(string)

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

// execute delega el lanzamiento a Brain via EventBus y retorna el PID real de Chrome.
func (ig *Ignition) execute(profileID string, mode string, profileData map[string]interface{}) (int, error) {
	ig.Core.Logger.Info("[EXECUTE] Delegando lanzamiento a Brain via EventBus...")

	// ── 1. Validar SpecPath ───────────────────────────────────────────────────
	if ig.SpecPath == "" {
		return 0, fmt.Errorf(
			"SpecPath vacío para perfil %s — getProfileData() debe ejecutarse antes de execute()",
			profileID,
		)
	}

	// ── 2. Pre-inicializar bloom-host ─────────────────────────────────────────
	if err := ig.initBloomHost(profileID, ig.Session.LaunchID); err != nil {
		return 0, fmt.Errorf("fallo en inicialización de bloom-host: %v", err)
	}

	// ── 3. Conectar con Brain ─────────────────────────────────────────────────
	const brainAddr = "127.0.0.1:5678"

	client := eventbus.NewSentinelClient(brainAddr, ig.Core.Logger)
	if err := client.Connect(); err != nil {
		return 0, fmt.Errorf(
			"no se pudo conectar con Brain en %s: %v — verificar que Brain esté corriendo como servicio",
			brainAddr, err,
		)
	}
	defer client.Close()

	if err := client.WaitForConnection(5 * time.Second); err != nil {
		return 0, fmt.Errorf("timeout conectando con Brain: %v", err)
	}

	ig.Core.Logger.Info("[EXECUTE] Conectado con Brain. Enviando LAUNCH_PROFILE...")

	// ── 4. LaunchProfileSync ──────────────────────────────────────────────────
	const launchTimeout = 120 * time.Second

	chromePID, err := client.LaunchProfileSync(
		profileID,
		ig.Session.LaunchID,
		ig.SpecPath,
		mode,
		launchTimeout,
	)
	if err != nil {
		return 0, fmt.Errorf("fallo en LaunchProfileSync: %v", err)
	}

	if chromePID <= 0 {
		return 0, fmt.Errorf("Brain retornó PID inválido: %d", chromePID)
	}

	// ── 5. Verificar proceso vivo ─────────────────────────────────────────────
	time.Sleep(500 * time.Millisecond)
	if !ig.isProcessAlive(chromePID) {
		return 0, fmt.Errorf(
			"proceso Chromium murió inmediatamente después del launch (PID %d) — "+
				"revisar logs de bloom-launcher y chromium",
			chromePID,
		)
	}

	ig.Core.Logger.Info("[EXECUTE] ✅ Chrome lanzado via Brain → bloom-launcher → Session 1 (PID: %d)", chromePID)

	// ── 6. Registrar streams de telemetría ────────────────────────────────────
	shortID := profileID
	if len(profileID) > 8 {
		shortID = profileID[:8]
	}

	profileLogPath := filepath.Join(
		ig.Core.Paths.AppDataDir, "logs", "sentinel", "profiles",
		fmt.Sprintf("sentinel_%s_%s.log", profileID, time.Now().Format("20060102")),
	)
	core.RegisterExternalStream(ig.Core.Paths,
		"sentinel_profile_"+shortID,
		"SENTINEL PROFILE ("+shortID+")",
		profileLogPath,
		2,
		&core.LoggerOptions{
			Categories:  []string{"synapse"},
			Description: "Per-profile Sentinel log — tracks browser profile lifecycle for the profile launched by this Synapse session",
		},
	)

	logDir := filepath.Join(ig.Core.Paths.AppDataDir, "logs", "chromium")
	_ = os.MkdirAll(logDir, 0755)
	logFilePath := filepath.Join(logDir, fmt.Sprintf("%s_%s.log", profileID, time.Now().Format("20060102_150405")))

	core.RegisterExternalStream(ig.Core.Paths,
		"chromium_debug_"+shortID,
		"CHROMIUM DEBUG ("+shortID+")",
		logFilePath,
		3,
		&core.LoggerOptions{
			Categories:  []string{"synapse"},
			Description: "Chromium debug log for profile " + shortID + " — low-level browser internals generated as a consequence of the Synapse-initiated launch",
		},
	)

	return chromePID, nil
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

	ig.DetectOrphanedLaunches(profileID)
	if err := ig.PruneHistory(profileID, 30); err != nil {
		ig.Core.Logger.Info("[WARN] No se pudo ejecutar pruning de history: %v", err)
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