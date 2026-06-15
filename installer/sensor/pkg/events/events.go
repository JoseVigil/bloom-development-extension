// pkg/events/events.go

package events

import "time"

// Tipos de eventos emitidos por Sensor hacia Sentinel.
const (
	EventHumanSessionActive = "HUMAN_SESSION_ACTIVE"
	EventHumanSessionLocked = "HUMAN_SESSION_LOCKED"
	EventHumanPresent       = "HUMAN_PRESENT"
	EventHumanIdle          = "HUMAN_IDLE"
	EventHumanAbsent        = "HUMAN_ABSENT"

	// Evento cognitivo: emitido cuando el estado cognitivo cambia entre ticks.
	EventCognitiveStateChanged = "COGNITIVE_STATE_CHANGED"
)

// CognitiveState representa el estado cognitivo inferido del humano.
// Se deriva del patrón de idle + energy_index en una ventana de tiempo.
type CognitiveState string

const (
	CognitiveStateFlow      CognitiveState = "FLOW"       // Alta energía, bajo idle sostenido
	CognitiveStateFocused   CognitiveState = "FOCUSED"     // Energía media-alta, idle moderado
	CognitiveStateFatigued  CognitiveState = "FATIGUED"    // Energía decayendo, idle creciente
	CognitiveStateIdle      CognitiveState = "IDLE"        // Idle alto pero sesión activa
	CognitiveStateAbsent    CognitiveState = "ABSENT"      // Sin presencia detectable
	CognitiveStateUnknown   CognitiveState = "UNKNOWN"     // Ventana insuficiente para inferir
)

// HumanState es el snapshot de presencia humana en un instante dado.
// Se serializa a JSON para el ring buffer, el log en disco y los eventos a Sentinel.
type HumanState struct {
	Timestamp      time.Time      `json:"timestamp"`
	SessionActive  bool           `json:"session_active"`
	SessionLocked  bool           `json:"session_locked"`
	IdleSeconds    uint32         `json:"idle_seconds"`
	EnergyIndex    float64        `json:"energy_index"`    // [0.0 – 1.0]
	FocusScore     float64        `json:"focus_score"`     // [0.0 – 1.0], 0 si ventana insuficiente
	CognitiveState CognitiveState `json:"cognitive_state"` // estado inferido del patrón
	Sequence       uint64         `json:"sequence"`
}

// Event es el envelope que Sensor publica a Sentinel.
type Event struct {
	Type      string     `json:"type"`
	Source    string     `json:"source"`    // siempre "bloom-sensor"
	Timestamp time.Time  `json:"timestamp"`
	Payload   HumanState `json:"payload"`
}

// NewEvent construye un Event listo para publicar.
func NewEvent(eventType string, state HumanState) Event {
	return Event{
		Type:      eventType,
		Source:    "bloom-sensor",
		Timestamp: state.Timestamp,
		Payload:   state,
	}
}

// CognitiveStateChangedEvent es el payload del evento COGNITIVE_STATE_CHANGED.
// Se publica a Sentinel cuando el estado cognitivo cambia entre dos ticks consecutivos.
type CognitiveStateChangedEvent struct {
	Timestamp  time.Time      `json:"timestamp"`
	Source     string         `json:"source"`      // siempre "bloom-sensor"
	Previous   CognitiveState `json:"previous"`
	Current    CognitiveState `json:"current"`
	FocusScore float64        `json:"focus_score"`
	EnergyIndex float64       `json:"energy_index"`
	Sequence   uint64         `json:"sequence"`
}

// HumanCognitiveUnit representa la carga cognitiva acumulada durante una ventana de tiempo.
// Análogo a una "unidad de trabajo cognitivo" — cuánto procesamiento humano real ocurrió.
// Se computa sobre un conjunto de snapshots del ring buffer.
type HumanCognitiveUnit struct {
	MandateID        string         `json:"mandate_id"`
	ComputedAt       time.Time      `json:"computed_at"`
	WindowStart      time.Time      `json:"window_start"`
	WindowEnd        time.Time      `json:"window_end"`
	Samples          int            `json:"samples"`
	AvgEnergyIndex   float64        `json:"avg_energy_index"`
	AvgFocusScore    float64        `json:"avg_focus_score"`
	HCUValue         float64        `json:"hcu_value"`         // [0.0 – 1.0] carga cognitiva normalizada
	DominantState    CognitiveState `json:"dominant_state"`    // estado más frecuente en la ventana
	FlowMinutes      int            `json:"flow_minutes"`      // minutos en estado FLOW
	FocusedMinutes   int            `json:"focused_minutes"`   // minutos en estado FOCUSED
	FatiguedMinutes  int            `json:"fatigued_minutes"`  // minutos en estado FATIGUED
	NucleusPath      string         `json:"nucleus_path,omitempty"` // path usado para correlación
}
