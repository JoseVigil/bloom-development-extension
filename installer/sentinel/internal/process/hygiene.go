package process

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

// ProfileStatus representa el estado de un perfil en profiles.json
type ProfileStatus struct {
	ProfileID string `json:"profile_id"`
	Status    string `json:"status"`
	PID       int    `json:"pid"`
	LaunchID  string `json:"launch_id"`
}

// ProfileRegistry representa la estructura de profiles.json
type ProfileRegistry struct {
	Profiles []ProfileStatus `json:"profiles"`
}

// HygieneReport contiene el resultado de la auditoría de inicio
type HygieneReport struct {
	TotalProfiles      int                      `json:"total_profiles"`
	OpenProfiles       int                      `json:"open_profiles"`
	OrphanedProfiles   []string                 `json:"orphaned_profiles"`
	Corrections        []map[string]interface{} `json:"corrections"`
	CorrectedCount     int                      `json:"corrected_count"`
	Errors             []string                 `json:"errors"`
	Timestamp          string                   `json:"timestamp"`
}

// StartupAudit realiza la auditoría de inicio según Prompt B
// CRÍTICO: Solo identifica y retorna problemas, NO envía correcciones
func StartupAudit(appDataDir string, brainAddr string) (*HygieneReport, error) {
	report := &HygieneReport{
		Timestamp:        time.Now().Format(time.RFC3339),
		OrphanedProfiles: make([]string, 0),
		Corrections:      make([]map[string]interface{}, 0),
		Errors:           make([]string, 0),
	}

	// 1. Leer profiles.json (Fuente de Verdad)
	profilesPath := filepath.Join(appDataDir, "config", "profiles.json")
	data, err := os.ReadFile(profilesPath)
	if err != nil {
		return report, fmt.Errorf("error leyendo profiles.json: %v", err)
	}

	var registry ProfileRegistry
	if err := json.Unmarshal(data, &registry); err != nil {
		return report, fmt.Errorf("error parseando profiles.json: %v", err)
	}

	report.TotalProfiles = len(registry.Profiles)

	// 2. Auditar perfiles con status "open"
	for _, profile := range registry.Profiles {
		if profile.Status == "open" {
			report.OpenProfiles++

			// 3. Validar si el PID existe y pertenece a BloomNucleus
			if !isValidBloomProcess(profile.PID, appDataDir) {
				// Proceso huérfano detectado
				report.OrphanedProfiles = append(report.OrphanedProfiles, profile.ProfileID)

				// 4. Preparar corrección (NO enviar aquí)
				correction := map[string]interface{}{
					"profile_id": profile.ProfileID,
					"old_status": "open",
					"new_status": "closed",
					"old_pid":    profile.PID,
					"reason":     "orphaned_pid",
				}
				report.Corrections = append(report.Corrections, correction)
				report.CorrectedCount++
			}
		}
	}

	return report, nil
}

// isValidBloomProcess verifica si un PID existe y pertenece a BloomNucleus
func isValidBloomProcess(pid int, appDataDir string) bool {
	if pid <= 0 {
		return false
	}

	if runtime.GOOS != "windows" {
		// En sistemas Unix, verificar si el proceso existe
		process, err := os.FindProcess(pid)
		if err != nil {
			return false
		}
		// Enviar señal 0 para verificar existencia sin matar
		err = process.Signal(syscall.Signal(0))
		return err == nil
	}

	// En Windows, usar tasklist para verificar existencia y ruta
	cmd := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", pid), "/FO", "CSV", "/NH")
	output, err := cmd.Output()
	if err != nil {
		return false
	}

	// Si no hay output, el proceso no existe
	if len(output) == 0 {
		return false
	}

	// Verificar que la ruta contenga BloomNucleus
	cmd = exec.Command("wmic", "process", "where", fmt.Sprintf("ProcessId=%d", pid), "get", "ExecutablePath", "/format:list")
	output, err = cmd.Output()
	if err != nil {
		return false
	}

	path := strings.TrimSpace(string(output))
	path = strings.TrimPrefix(path, "ExecutablePath=")
	
	// Normalizar ruta de appDataDir para comparación
	bloomPath := filepath.Join(appDataDir, "bin", "chrome-win")
	bloomPath = strings.ReplaceAll(strings.ToLower(bloomPath), "/", "\\")
	path = strings.ReplaceAll(strings.ToLower(path), "/", "\\")

	return strings.Contains(path, bloomPath)
}

// SafeCleanup busca y elimina procesos zombies de Chromium que no estén en sesión activa
func SafeCleanup(appDataDir string, activePIDs []int) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("SafeCleanup solo soportado en Windows actualmente")
	}

	// Crear mapa de PIDs activos para búsqueda rápida
	activePIDMap := make(map[int]bool)
	for _, pid := range activePIDs {
		activePIDMap[pid] = true
	}

	// Buscar todos los procesos chrome.exe
	cmd := exec.Command("wmic", "process", "where", "name='chrome.exe'", "get", "ProcessId,ExecutablePath", "/format:csv")
	output, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("error listando procesos chrome: %v", err)
	}

	lines := strings.Split(string(output), "\n")
	bloomPath := filepath.Join(appDataDir, "bin", "chrome-win")
	bloomPath = strings.ReplaceAll(strings.ToLower(bloomPath), "/", "\\")

	zombiesKilled := 0
	for _, line := range lines {
		if line == "" || !strings.Contains(line, "chrome.exe") {
			continue
		}

		parts := strings.Split(line, ",")
		if len(parts) < 3 {
			continue
		}

		// Extraer PID
		pidStr := strings.TrimSpace(parts[2])
		var pid int
		_, err := fmt.Sscanf(pidStr, "%d", &pid)
		if err != nil || pid <= 0 {
			continue
		}

		// Verificar si es de Bloom
		path := strings.TrimSpace(parts[1])
		path = strings.ReplaceAll(strings.ToLower(path), "/", "\\")
		
		if !strings.Contains(path, bloomPath) {
			continue // No es un proceso de Bloom
		}

		// Si NO está en la sesión activa, es un zombie
		if !activePIDMap[pid] {
			fmt.Fprintf(os.Stderr, "[HYGIENE] Zombie detectado: PID %d\n", pid)
			if err := KillProcessTree(pid); err != nil {
				fmt.Fprintf(os.Stderr, "[HYGIENE] Error matando zombie %d: %v\n", pid, err)
			} else {
				zombiesKilled++
			}
		}
	}

	if zombiesKilled > 0 {
		fmt.Fprintf(os.Stderr, "[HYGIENE] Limpieza completada: %d zombies eliminados\n", zombiesKilled)
	}

	return nil
}

// KillProcessTree mata un proceso y todo su árbol de hijos (implementación quirúrgica)
func KillProcessTree(pid int) error {
	if runtime.GOOS != "windows" {
		// En Unix, usar kill con señal SIGKILL
		process, err := os.FindProcess(pid)
		if err != nil {
			return err
		}
		return process.Kill()
	}

	// En Windows, usar taskkill con flags /F (force) y /T (tree)
	cmd := exec.Command("taskkill", "/F", "/T", "/PID", fmt.Sprintf("%d", pid))
	output, err := cmd.CombinedOutput()
	
	if err != nil {
		// Si el proceso ya no existe, no es un error
		if strings.Contains(string(output), "not found") {
			return nil
		}
		return fmt.Errorf("taskkill falló: %v - %s", err, string(output))
	}

	return nil
}

// GetBloomProcesses retorna todos los PIDs de procesos chrome.exe de Bloom
func GetBloomProcesses(appDataDir string) ([]int, error) {
	if runtime.GOOS != "windows" {
		return nil, fmt.Errorf("GetBloomProcesses solo soportado en Windows actualmente")
	}

	cmd := exec.Command("wmic", "process", "where", "name='chrome.exe'", "get", "ProcessId,ExecutablePath", "/format:csv")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("error listando procesos: %v", err)
	}

	var pids []int
	lines := strings.Split(string(output), "\n")
	bloomPath := filepath.Join(appDataDir, "bin", "chrome-win")
	bloomPath = strings.ReplaceAll(strings.ToLower(bloomPath), "/", "\\")

	for _, line := range lines {
		if line == "" || !strings.Contains(line, "chrome.exe") {
			continue
		}

		parts := strings.Split(line, ",")
		if len(parts) < 3 {
			continue
		}

		path := strings.TrimSpace(parts[1])
		pidStr := strings.TrimSpace(parts[2])
		
		path = strings.ReplaceAll(strings.ToLower(path), "/", "\\")
		
		if strings.Contains(path, bloomPath) {
			var pid int
			_, err := fmt.Sscanf(pidStr, "%d", &pid)
			if err == nil && pid > 0 {
				pids = append(pids, pid)
			}
		}
	}

	return pids, nil
}