package startup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sentinel/internal/core"
	"time"
)

// --- ESTRUCTURAS DE ESTADO (Mantenidas para compatibilidad) ---
type ServiceStatus struct {
	Name   string `json:"name"`
	Port   int    `json:"port,omitempty"`
	Active bool   `json:"active"`
}

type SystemStatus struct {
	Timestamp           string            `json:"timestamp"`
	ExecutablesValid    bool              `json:"executables_valid"`
	OnboardingCompleted bool              `json:"onboarding_completed"`
	MasterProfile       string            `json:"master_profile,omitempty"`
	SystemMap           map[string]string `json:"system_map"`
	Services            []ServiceStatus   `json:"services"`
}

func Initialize(c *core.Core) error {
	// 1. Crear estructura de directorios base
	configDir := filepath.Join(c.Paths.AppDataDir, "config")
	dirs := []string{configDir, c.Paths.LogsDir, c.Paths.ProfilesDir}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return fmt.Errorf("error creando directorio %s: %w", d, err)
		}
	}

	// 2. Crear subcarpeta específica para startup
	startupLogDir := filepath.Join(c.Paths.LogsDir, "startup")
	if err := os.MkdirAll(startupLogDir, 0755); err != nil {
		return fmt.Errorf("error creando directorio startup: %w", err)
	}

	// Paths temporal solo para el logger de startup
	startupPaths := *c.Paths
	startupPaths.LogsDir = startupLogDir

	// Inicializar logger de Sentinel Startup (prioridad 3)
	logger, err := core.InitLogger(&startupPaths, "sentinel_startup", "▶️ SENTINEL STARTUP", 3)
	if err != nil {
		return fmt.Errorf("fallo fatal en logger startup: %w", err)
	}

	// Asignar este logger al core (reemplaza el anterior si era necesario)
	c.Logger = logger

	// Mensaje de arranque usando el nuevo logger
	c.Logger.Success("🚀 Startup: Sistema inicializado y telemetría activa.")

	// 3. PERSISTENCIA NUCLEUS (exactamente como estaba antes)
	status := LoadCurrentStatus(c)
	if status.SystemMap == nil {
		status.SystemMap = make(map[string]string)
	}
	if status.SystemMap["extension_id"] == "" || status.SystemMap["extension_id"] == "null" {
		status.SystemMap["extension_id"] = c.Config.Provisioning.ExtensionID
		status.Timestamp = time.Now().Format(time.RFC3339)
		_ = SaveSystemStatus(c, status) // ignoramos error para no romper arranque
	}

	return nil
}

// --- PERSISTENCIA (Sincronizada con nucleus.json) ---
func LoadCurrentStatus(c *core.Core) SystemStatus {
	path := filepath.Join(c.Paths.AppDataDir, "config", "nucleus.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return SystemStatus{
			SystemMap: make(map[string]string),
			Services:  []ServiceStatus{},
		}
	}
	var status SystemStatus
	json.Unmarshal(data, &status)
	return status
}

func SaveSystemStatus(c *core.Core, status SystemStatus) error {
	configDir := filepath.Join(c.Paths.AppDataDir, "config")
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return err
	}
	path := filepath.Join(configDir, "nucleus.json")
	data, err := json.MarshalIndent(status, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func UpdateActiveStatus(c *core.Core, updates map[string]string) error {
	status := LoadCurrentStatus(c)
	if status.SystemMap == nil {
		status.SystemMap = make(map[string]string)
	}
	for k, v := range updates {
		status.SystemMap[k] = v
	}
	if status.SystemMap["extension_id"] == "" || status.SystemMap["extension_id"] == "null" {
		status.SystemMap["extension_id"] = c.Config.Provisioning.ExtensionID
	}
	status.Timestamp = time.Now().Format(time.RFC3339)
	return SaveSystemStatus(c, status)
}

func FetchBrainManifest(brainPath string) (interface{}, error) {
	if _, err := os.Stat(brainPath); err != nil {
		return nil, fmt.Errorf("brain exe no encontrado")
	}
	return map[string]string{"status": "detected"}, nil
}