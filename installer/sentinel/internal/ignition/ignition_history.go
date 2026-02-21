package ignition

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// ── Tipos ─────────────────────────────────────────────────────────────────────

// LaunchResult representa el resultado final de una sesión
type LaunchResult string

const (
	LaunchResultInProgress LaunchResult = "in_progress"
	LaunchResultCleanExit  LaunchResult = "clean_exit"
	LaunchResultKilled     LaunchResult = "killed"
	LaunchResultCrashed    LaunchResult = "crashed"
	LaunchResultTimeout    LaunchResult = "timeout"
)

// LaunchRecord es una línea NDJSON en el archivo diario de launches.
// El modelo es append-only: se escribe una línea al abrir (in_progress)
// y otra al cerrar (resultado final). El estado efectivo es siempre
// la última línea con ese launch_id — nunca se modifica una línea existente.
type LaunchRecord struct {
	LaunchID        string                 `json:"launch_id"`
	ProfileID       string                 `json:"profile_id"`
	Timestamp       string                 `json:"ts"`
	Event           string                 `json:"event"` // "opened" | "closed"
	Mode            string                 `json:"mode,omitempty"`
	ChromePID       int                    `json:"chrome_pid,omitempty"`
	Result          LaunchResult           `json:"result"`
	DurationSeconds int                    `json:"duration_seconds,omitempty"`
	ConfigSnapshot  map[string]interface{} `json:"config_snapshot,omitempty"`
	SessionLogPath  string                 `json:"session_log_path,omitempty"`
}

// ── Paths ─────────────────────────────────────────────────────────────────────

// profileHistoryDir devuelve la raíz del historial para un perfil.
// Estructura: AppDataDir/history/profiles/{profileID}/
func (ig *Ignition) profileHistoryDir(profileID string) string {
	return filepath.Join(ig.Core.Paths.AppDataDir, "history", "profiles", profileID)
}

// dailyLaunchesPath devuelve el archivo NDJSON del día para launches.
// Estructura: AppDataDir/history/profiles/{profileID}/launches/YYYYMMDD.ndjson
func (ig *Ignition) dailyLaunchesPath(profileID string, t time.Time) string {
	day := t.UTC().Format("20060102")
	return filepath.Join(ig.profileHistoryDir(profileID), "launches", day+".ndjson")
}

// sessionLogPath devuelve el archivo NDJSON de eventos de una sesión específica.
// Estructura: AppDataDir/history/profiles/{profileID}/sessions/{launchID}.ndjson
func (ig *Ignition) sessionLogPath(profileID, launchID string) string {
	return filepath.Join(ig.profileHistoryDir(profileID), "sessions", launchID+".ndjson")
}

// ── Escritura NDJSON (append-only) ───────────────────────────────────────────

// appendLaunchRecord serializa un LaunchRecord como línea NDJSON y hace append
// al archivo diario correspondiente. Crea el directorio si no existe.
// Es la única operación de escritura — nunca modifica líneas existentes.
func (ig *Ignition) appendLaunchRecord(profileID string, record LaunchRecord) error {
	path := ig.dailyLaunchesPath(profileID, time.Now())

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return fmt.Errorf("error creando directorio launches: %v", err)
	}

	line, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("error serializando launch record: %v", err)
	}

	f, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("error abriendo archivo diario: %v", err)
	}
	defer f.Close()

	_, err = fmt.Fprintf(f, "%s\n", line)
	return err
}

// ── API pública ───────────────────────────────────────────────────────────────

// OpenLaunchRecord registra el inicio de un lanzamiento.
// Escribe una línea con event="opened" y result="in_progress".
// Llamar justo después de execute() cuando ya tenemos el PID real.
func (ig *Ignition) OpenLaunchRecord(profileID, launchID, mode string, chromePID int, config map[string]interface{}) error {
	sessionLog := ig.sessionLogPath(profileID, launchID)

	record := LaunchRecord{
		LaunchID:       launchID,
		ProfileID:      profileID,
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
		Event:          "opened",
		Mode:           mode,
		ChromePID:      chromePID,
		Result:         LaunchResultInProgress,
		ConfigSnapshot: buildConfigSnapshot(config),
		SessionLogPath: sessionLog,
	}

	if err := ig.appendLaunchRecord(profileID, record); err != nil {
		return err
	}

	ig.Core.Logger.Info("[HISTORY] 📋 Launch abierto: %s", launchID)
	return nil
}

// CloseLaunchRecord registra el cierre de un lanzamiento.
// Escribe una nueva línea con event="closed" y el resultado final.
// No modifica la línea "opened" — el modelo es siempre append-only.
func (ig *Ignition) CloseLaunchRecord(profileID, launchID string, result LaunchResult, openedAt time.Time) error {
	now := time.Now().UTC()

	record := LaunchRecord{
		LaunchID:        launchID,
		ProfileID:       profileID,
		Timestamp:       now.Format(time.RFC3339),
		Event:           "closed",
		Result:          result,
		DurationSeconds: int(now.Sub(openedAt).Seconds()),
	}

	if err := ig.appendLaunchRecord(profileID, record); err != nil {
		return err
	}

	ig.Core.Logger.Info("[HISTORY] ✅ Launch cerrado: %s (%s, %ds)", launchID, result, record.DurationSeconds)
	return nil
}

// EnsureSessionFile crea el directorio y el archivo .ndjson vacío para la sesión.
// Devuelve el path absoluto que se inyecta en synapse.config.js para que Brain haga append.
func (ig *Ignition) EnsureSessionFile(profileID, launchID string) (string, error) {
	path := ig.sessionLogPath(profileID, launchID)

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return "", fmt.Errorf("error creando directorio sessions: %v", err)
	}

	// Crear vacío solo si no existe — no sobreescribir si ya tiene eventos
	if _, err := os.Stat(path); os.IsNotExist(err) {
		f, err := os.Create(path)
		if err != nil {
			return "", fmt.Errorf("error creando session log: %v", err)
		}
		f.Close()
	}

	ig.Core.Logger.Info("[HISTORY] 📝 Session log preparado: %s", filepath.Base(path))
	return path, nil
}

// ── Detección de crashes ──────────────────────────────────────────────────────

// DetectOrphanedLaunches escanea los archivos diarios recientes buscando launches
// con event="opened" sin un event="closed" correspondiente del mismo launch_id.
// Escribe una línea "closed" con result="crashed" por cada huérfano encontrado.
// Diseñado para llamarse en preFlight — no depende de estado en memoria.
func (ig *Ignition) DetectOrphanedLaunches(profileID string) {
	launchesDir := filepath.Join(ig.profileHistoryDir(profileID), "launches")
	entries, err := os.ReadDir(launchesDir)
	if err != nil {
		return // directorio no existe aún, primer run
	}

	// Revisar solo los últimos 3 días para no escanear indefinidamente
	cutoff := time.Now().UTC().AddDate(0, 0, -3).Format("20060102")

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		// Solo archivos .ndjson con formato YYYYMMDD
		if len(name) != 15 || name[8:] != ".ndjson" {
			continue
		}
		day := name[:8]
		if day < cutoff {
			continue
		}

		ig.resolveOrphansInFile(profileID, filepath.Join(launchesDir, name))
	}
}

// resolveOrphansInFile lee un archivo diario, identifica launches sin cierre
// y escribe las líneas "crashed" faltantes.
func (ig *Ignition) resolveOrphansInFile(profileID, filePath string) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return
	}

	// Rastrear estado por launch_id
	opened := make(map[string]LaunchRecord)
	closed := make(map[string]bool)

	for _, line := range splitLines(data) {
		if len(line) == 0 {
			continue
		}
		var rec LaunchRecord
		if err := json.Unmarshal(line, &rec); err != nil {
			continue
		}
		switch rec.Event {
		case "opened":
			opened[rec.LaunchID] = rec
		case "closed":
			closed[rec.LaunchID] = true
		}
	}

	// Escribir "crashed" para los que no tienen cierre
	for id, rec := range opened {
		if closed[id] {
			continue
		}

		openedAt, _ := time.Parse(time.RFC3339, rec.Timestamp)
		crashRecord := LaunchRecord{
			LaunchID:        id,
			ProfileID:       profileID,
			Timestamp:       time.Now().UTC().Format(time.RFC3339),
			Event:           "closed",
			Result:          LaunchResultCrashed,
			DurationSeconds: int(time.Since(openedAt).Seconds()),
		}

		line, err := json.Marshal(crashRecord)
		if err != nil {
			continue
		}

		f, err := os.OpenFile(filePath, os.O_APPEND|os.O_WRONLY, 0644)
		if err != nil {
			continue
		}
		fmt.Fprintf(f, "%s\n", line)
		f.Close()

		ig.Core.Logger.Info("[HISTORY] ⚠️  Crash detectado y registrado: %s", id)
	}
}

// ── Retención / limpieza ──────────────────────────────────────────────────────

// PruneHistory elimina archivos diarios de launches y sessions más antiguos
// que retentionDays. Opera a nivel de archivo completo — nunca modifica contenido.
func (ig *Ignition) PruneHistory(profileID string, retentionDays int) error {
	cutoff := time.Now().UTC().AddDate(0, 0, -retentionDays)
	pruned := 0

	// Pruning de archivos diarios de launches
	launchesDir := filepath.Join(ig.profileHistoryDir(profileID), "launches")
	if entries, err := os.ReadDir(launchesDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			name := entry.Name()
			if len(name) != 15 || name[8:] != ".ndjson" {
				continue
			}
			day, err := time.Parse("20060102", name[:8])
			if err != nil {
				continue
			}
			if day.Before(cutoff) {
				os.Remove(filepath.Join(launchesDir, name))
				pruned++
			}
		}
	}

	// Pruning de session logs por fecha de modificación
	sessionsDir := filepath.Join(ig.profileHistoryDir(profileID), "sessions")
	if entries, err := os.ReadDir(sessionsDir); err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				continue
			}
			info, err := entry.Info()
			if err != nil {
				continue
			}
			if info.ModTime().Before(cutoff) {
				os.Remove(filepath.Join(sessionsDir, entry.Name()))
				pruned++
			}
		}
	}

	if pruned > 0 {
		ig.Core.Logger.Info("[HISTORY] 🧹 Pruning: %d archivos eliminados (retención: %d días)", pruned, retentionDays)
	}

	return nil
}

// ── Helpers internos ──────────────────────────────────────────────────────────

// buildConfigSnapshot extrae solo los campos operativos del config efectivo.
// Evita guardar datos voluminosos en el historial.
func buildConfigSnapshot(config map[string]interface{}) map[string]interface{} {
	keys := []string{
		"role", "mode", "register", "heartbeat",
		"service", "profile_alias", "extension_id", "launchId",
	}
	snapshot := make(map[string]interface{}, len(keys))
	for _, k := range keys {
		if v, ok := config[k]; ok {
			snapshot[k] = v
		}
	}
	return snapshot
}

// splitLines divide un slice de bytes en líneas sin depender de bufio.
func splitLines(data []byte) [][]byte {
	var lines [][]byte
	start := 0
	for i, b := range data {
		if b == '\n' {
			lines = append(lines, data[start:i])
			start = i + 1
		}
	}
	if start < len(data) {
		lines = append(lines, data[start:])
	}
	return lines
}