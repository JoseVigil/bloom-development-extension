package core

// telemetry.go
//
// ARQUITECTURA: Sentinel NO escribe telemetry.json directamente.
// El único escritor autorizado es Nucleus CLI via `nucleus telemetry register`.
//
// Este archivo expone únicamente los tipos de datos necesarios para
// deserializar telemetry.json de forma read-only (p.ej. para el dashboard).
// Toda escritura ocurre a través de RegisterTelemetryStream en logger_helpers.go.

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// StreamInfo representa una entrada en active_streams de telemetry.json.
// Solo se usa para lectura — nunca para escritura directa.
type StreamInfo struct {
    Label      string `json:"label"`
    Path       string `json:"path"`
    Priority   int    `json:"priority"`
    LastUpdate string `json:"last_update"`
    Active     bool   `json:"active"`  
}
// TelemetryData es la estructura raíz de telemetry.json.
type TelemetryData struct {
	Streams map[string]StreamInfo `json:"active_streams"`
}

// ReadTelemetry lee telemetry.json de forma read-only.
// Retorna un TelemetryData vacío si el archivo no existe o no es legible.
// NUNCA escribe ni lockea el archivo.
func ReadTelemetry(telemetryDir string) TelemetryData {
	path := filepath.Join(telemetryDir, "telemetry.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return TelemetryData{Streams: make(map[string]StreamInfo)}
	}
	var td TelemetryData
	if err := json.Unmarshal(data, &td); err != nil {
		return TelemetryData{Streams: make(map[string]StreamInfo)}
	}
	if td.Streams == nil {
		td.Streams = make(map[string]StreamInfo)
	}
	return td
}