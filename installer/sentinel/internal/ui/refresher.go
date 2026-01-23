package ui

import (
	"encoding/json"
	"os"
	"sentinel/internal/core"
	"time"
)

func CleanTelemetry(path string) {
	go func() {
		for {
			data, err := os.ReadFile(path)
			if err != nil {
				time.Sleep(2 * time.Second)
				continue
			}

			var tel core.TelemetryData
			if err := json.Unmarshal(data, &tel); err != nil {
				// Si el JSON está mal formado temporalmente (escritura parcial), esperamos
				time.Sleep(1 * time.Second)
				continue
			}

			changed := false
			now := time.Now()

			for id, info := range tel.Streams {
				lastUpdate, _ := time.Parse(time.RFC3339, info.LastUpdate)
				if err != nil {
					continue
				}

				diff := now.Sub(lastUpdate)

				// REGLA 1: INACTIVIDAD (30 Segundos) -> Deja de mostrarse en Cockpit
				isActive := diff < 30*time.Second
				if info.Active != isActive {
					info.Active = isActive
					tel.Streams[id] = info
					changed = true
				}

				// REGLA 2: LIMPIEZA TOTAL (2 Minutos) -> Desaparece del JSON
				if diff > 2*time.Minute {
					delete(tel.Streams, id)
					changed = true
				}
			}

			if changed {
				newData, _ := json.MarshalIndent(tel, "", "  ")
				_ = os.WriteFile(path, newData, 0644)
			}
			time.Sleep(5 * time.Second)
		}
	}()
}