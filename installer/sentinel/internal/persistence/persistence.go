package persistence

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sentinel/internal/core"
	"sentinel/internal/startup" 
)

// Actualizamos la función para que use el struct SystemStatus (el nuevo estándar)
func SaveNucleusState(c *core.Core, status *startup.SystemStatus) error {
	// 1. Definir la ruta usando el objeto core (más seguro)
	configDir := filepath.Join(c.Paths.AppDataDir, "config")
	
	// 2. Asegurar que existe la carpeta
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return err
	}

	// 3. Serializar el NUEVO objeto SystemStatus
	data, err := json.MarshalIndent(status, "", "  ")
	if err != nil {
		return err
	}

	// 4. Guardar en nucleus.json
	return os.WriteFile(filepath.Join(configDir, "nucleus.json"), data, 0644)
}