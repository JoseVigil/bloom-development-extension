package ui

import (
	"encoding/json"
	"os"
	"time"
)

// CleanTelemetry orquestará la salud del archivo telemetry.json
func CleanTelemetry(path string) {
	go func() {
		for {
			data, err := os.ReadFile(path)
			if err != nil {
				// Si el archivo no existe aún, esperamos
				time.Sleep(2 * time.Second)
				continue
			}

			var tel Telemetry
			if err := json.Unmarshal(data, &tel); err != nil {
				time.Sleep(1 * time.Second)
				continue
			}

			changed := false
			now := time.Now()

			for id, info := range tel.ActiveStreams {
				lastUpdate, err := time.Parse(time.RFC3339, info.LastUpdate)
				if err != nil {
					continue
				}

				timeSinceUpdate := now.Sub(lastUpdate)

				// REGLA 1: INACTIVIDAD (30 Segundos)
				// Si no ha reportado, lo marcamos como inactivo para que la UI lo oculte
				isActive := timeSinceUpdate < 30*time.Second
				if info.Active != isActive {
					info.Active = isActive
					tel.ActiveStreams[id] = info
					changed = true
				}

				// REGLA 2: LIMPIEZA TOTAL (2 Minutos)
				// Si el proceso desapareció por completo, lo borramos del registro
				if timeSinceUpdate > 2*time.Minute {
					delete(tel.ActiveStreams, id)
					changed = true
				}
			}

			// Solo escribimos si hubo cambios para reducir el desgaste de disco
			if changed {
				newData, _ := json.MarshalIndent(tel, "", "  ")
				_ = os.WriteFile(path, newData, 0644)
			}

			time.Sleep(5 * time.Second) // Verificación cada 5 segundos
		}
	}()
}