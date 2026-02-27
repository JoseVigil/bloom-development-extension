// internal/metrics/energy.go

package metrics

import "math"

// Engine calcula métricas de presencia humana.
type Engine struct{}

func NewEngine() *Engine { return &Engine{} }

// ComputeEnergyIndex calcula el energy_index de forma determinista.
// Resultado siempre en [0.0, 1.0]. Sin ML, sin estado externo.
//
// Parámetros:
//   - idleSeconds: segundos desde el último input del usuario
//   - sessionActive: true si la sesión de Windows está activa (no bloqueada)
//
// Lógica:
//   - Si la sesión está bloqueada → energy = 0.0
//   - Si idle > 30 min → decae linealmente hasta 0 a los 60 min
//   - Si idle < 30 min → varía entre 1.0 (0s idle) y 0.5 (30 min idle)
func (e *Engine) ComputeEnergyIndex(idleSeconds uint32, sessionActive bool) float64 {
	if !sessionActive {
		return 0.0
	}

	idleMinutes := float64(idleSeconds) / 60.0

	const (
		idleActiveThreshold = 30.0 // minutos hasta donde la energía decae suavemente
		idleAbsentThreshold = 60.0 // minutos a partir de los cuales la energía es 0
	)

	var energy float64
	switch {
	case idleMinutes >= idleAbsentThreshold:
		energy = 0.0
	case idleMinutes >= idleActiveThreshold:
		// Decaimiento lineal de 0.5 a 0.0 entre 30min y 60min
		ratio := (idleMinutes - idleActiveThreshold) / (idleAbsentThreshold - idleActiveThreshold)
		energy = 0.5 * (1.0 - ratio)
	default:
		// Decaimiento suave de 1.0 a 0.5 entre 0s y 30min
		ratio := idleMinutes / idleActiveThreshold
		energy = 1.0 - (0.5 * ratio)
	}

	return math.Max(0.0, math.Min(1.0, energy))
}
