// internal/metrics/energy.go

package metrics

import (
	"math"

	"bloom-sensor/pkg/events"
)

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

// ComputeFocusScore calcula el focus_score sobre una ventana de snapshots.
// Resultado siempre en [0.0, 1.0]. Retorna 0.0 si la ventana es insuficiente.
//
// El focus_score mide la consistencia de la energía en el tiempo:
// una energía alta pero volátil (interrupciones frecuentes) produce un score más bajo
// que una energía media sostenida (trabajo continuo).
//
// Fórmula: focusScore = avgEnergy * (1 - normalizedVariance)
//   - avgEnergy: promedio de energy_index en la ventana
//   - normalizedVariance: varianza de energy_index normalizada a [0,1]
//     usando el rango máximo posible (varianza de una distribución {0,1} = 0.25)
//
// Requisito mínimo: al menos 3 snapshots con sesión activa.
func (e *Engine) ComputeFocusScore(window []events.HumanState) float64 {
	// Filtrar solo samples con sesión activa
	var active []float64
	for _, s := range window {
		if s.SessionActive {
			active = append(active, s.EnergyIndex)
		}
	}

	if len(active) < 3 {
		return 0.0
	}

	// Promedio
	var sum float64
	for _, v := range active {
		sum += v
	}
	avg := sum / float64(len(active))

	// Varianza
	var varianceSum float64
	for _, v := range active {
		diff := v - avg
		varianceSum += diff * diff
	}
	variance := varianceSum / float64(len(active))

	// Normalizar varianza: el máximo teórico de varianza para valores en [0,1]
	// es 0.25 (distribución bimodal perfecta {0, 1}). Usamos eso como techo.
	const maxVariance = 0.25
	normalizedVariance := math.Min(variance/maxVariance, 1.0)

	focusScore := avg * (1.0 - normalizedVariance)
	return math.Max(0.0, math.Min(1.0, focusScore))
}
