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
)

// HumanState es el snapshot de presencia humana en un instante dado.
// Se serializa a JSON para el ring buffer, el log en disco y los eventos a Sentinel.
type HumanState struct {
	Timestamp      time.Time `json:"timestamp"`
	SessionActive  bool      `json:"session_active"`
	SessionLocked  bool      `json:"session_locked"`
	IdleSeconds    uint32    `json:"idle_seconds"`
	EnergyIndex    float64   `json:"energy_index"`    // [0.0 – 1.0]
	Sequence       uint64    `json:"sequence"`
}

// Event es el envelope que Sensor publica a Sentinel.
type Event struct {
	Type      string      `json:"type"`
	Source    string      `json:"source"`    // siempre "bloom-sensor"
	Timestamp time.Time   `json:"timestamp"`
	Payload   HumanState  `json:"payload"`
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
