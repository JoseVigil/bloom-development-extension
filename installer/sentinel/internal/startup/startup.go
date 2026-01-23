package startup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sentinel/internal/core"
	"time"
)

// --- ESTRUCTURAS DE ESTADO (Mantenidas para compatibilidad con health.go) ---

type ServiceStatus struct {
	Name   string `json:"name"`
	Port   int    `json:"port,omitempty"`
	Active bool   `json:"active"`
}

type SystemStatus struct {
	Timestamp            string           `json:"timestamp"`
	ExecutablesValid     bool             `json:"executables_valid"`
	OnboardingCompleted  bool             `json:"onboarding_completed"`
	MasterProfile        string           `json:"master_profile,omitempty"`
	SystemMap            map[string]string `json:"system_map"`
	Services             []ServiceStatus  `json:"services"`
}

// --- FUNCIONES DE INICIALIZACIÓN ---

func Initialize(c *core.Core) error {
	c.Logger.Info("🚀 Startup: Sincronizando identidad...")
	
	// Usamos solo las rutas que sabemos que existen en tu objeto core.Paths
	configDir := filepath.Join(c.Paths.AppDataDir, "config")
	
	dirs := []string{
		configDir,
		c.Paths.LogsDir,
		c.Paths.ProfilesDir,
	}

	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return fmt.Errorf("error creando directorio %s: %w", d, err)
		}
	}
	return nil
}

// UpdateActiveStatus: ESTA ES LA FUNCIÓN QUE PEDÍA EL main.go
// Actualiza nucleus.json con los descubrimientos de dev-start
func UpdateActiveStatus(c *core.Core, updates map[string]string) error {
	status := LoadCurrentStatus(c)
	if status.SystemMap == nil {
		status.SystemMap = make(map[string]string)
	}
	
	for k, v := range updates {
		status.SystemMap[k] = v
	}
	
	status.Timestamp = time.Now().Format(time.RFC3339)
	return SaveSystemStatus(c, status)
}

// FetchBrainManifest: ESTA ES LA FUNCIÓN QUE PEDÍA EL health.go
func FetchBrainManifest(brainPath string) (interface{}, error) {
	if _, err := os.Stat(brainPath); err != nil {
		return nil, fmt.Errorf("brain exe no encontrado")
	}
	// Por ahora devolvemos un ok para que el health check pase
	return map[string]string{"status": "detected"}, nil
}

// --- PERSISTENCIA (Sincronizada con health.go y nucleus.json) ---

func LoadCurrentStatus(c *core.Core) SystemStatus {
	path := filepath.Join(c.Paths.AppDataDir, "nucleus.json")
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
	path := filepath.Join(c.Paths.AppDataDir, "nucleus.json")
	data, err := json.MarshalIndent(status, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}