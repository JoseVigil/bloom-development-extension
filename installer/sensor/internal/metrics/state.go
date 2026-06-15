// internal/metrics/state.go

package metrics

import (
	"sync"
	"time"

	"bloom-sensor/pkg/events"
)

const defaultCapacity = 1440

type RingBuffer struct {
	mu       sync.RWMutex
	capacity int
	items    []events.HumanState
	head     int
	size     int
}

func NewRingBuffer(capacity int) *RingBuffer {
	if capacity <= 0 {
		capacity = defaultCapacity
	}
	return &RingBuffer{
		capacity: capacity,
		items:    make([]events.HumanState, capacity),
	}
}

func (rb *RingBuffer) Push(s events.HumanState) {
	rb.mu.Lock()
	defer rb.mu.Unlock()
	rb.items[rb.head] = s
	rb.head = (rb.head + 1) % rb.capacity
	if rb.size < rb.capacity {
		rb.size++
	}
}

func (rb *RingBuffer) Last(n int) []events.HumanState {
	rb.mu.RLock()
	defer rb.mu.RUnlock()
	if n > rb.size {
		n = rb.size
	}
	if n == 0 {
		return nil
	}
	result := make([]events.HumanState, n)
	start := (rb.head - n + rb.capacity) % rb.capacity
	for i := 0; i < n; i++ {
		result[i] = rb.items[(start+i)%rb.capacity]
	}
	return result
}

func (rb *RingBuffer) Since(d time.Duration) []events.HumanState {
	rb.mu.RLock()
	defer rb.mu.RUnlock()
	cutoff := time.Now().UTC().Add(-d)
	var result []events.HumanState
	for i := 0; i < rb.size; i++ {
		idx := (rb.head - rb.size + i + rb.capacity) % rb.capacity
		s := rb.items[idx]
		if s.Timestamp.After(cutoff) {
			result = append(result, s)
		}
	}
	return result
}

// ─── Detección de patrones cognitivos ────────────────────────────────────────

// minWindowForPattern es la cantidad mínima de snapshots necesarios para
// inferir un patrón cognitivo. Con menos muestras se retorna UNKNOWN.
const minWindowForPattern = 3

// DetectPattern analiza una ventana de snapshots y retorna el CognitiveState
// dominante inferido del comportamiento de idle y energy_index.
//
// Lógica de clasificación (en orden de precedencia):
//
//  1. Si la mayoría de samples tiene sesión inactiva → ABSENT
//  2. Si avgEnergy >= 0.80 y avgIdle < 5 min → FLOW
//  3. Si avgEnergy >= 0.55 y avgIdle < 15 min → FOCUSED
//  4. Si avgEnergy < 0.40 y avgIdle >= 10 min → FATIGUED
//  5. Si avgEnergy < 0.55 y avgIdle >= 15 min → IDLE
//  6. Cualquier otro caso → FOCUSED (fallback conservador)
//
// Sin ML, sin estado externo. Determinista y testeable.
func DetectPattern(window []events.HumanState) events.CognitiveState {
	if len(window) < minWindowForPattern {
		return events.CognitiveStateUnknown
	}

	var sumEnergy float64
	var sumIdleSeconds float64
	inactiveSamples := 0

	for _, s := range window {
		sumEnergy += s.EnergyIndex
		sumIdleSeconds += float64(s.IdleSeconds)
		if !s.SessionActive {
			inactiveSamples++
		}
	}

	n := float64(len(window))
	avgEnergy := sumEnergy / n
	avgIdleMinutes := (sumIdleSeconds / n) / 60.0

	// Mayoría inactiva → ausente
	if float64(inactiveSamples)/n > 0.5 {
		return events.CognitiveStateAbsent
	}

	switch {
	case avgEnergy >= 0.80 && avgIdleMinutes < 5.0:
		return events.CognitiveStateFlow
	case avgEnergy >= 0.55 && avgIdleMinutes < 15.0:
		return events.CognitiveStateFocused
	case avgEnergy < 0.40 && avgIdleMinutes >= 10.0:
		return events.CognitiveStateFatigued
	case avgEnergy < 0.55 && avgIdleMinutes >= 15.0:
		return events.CognitiveStateIdle
	default:
		return events.CognitiveStateFocused // fallback conservador
	}
}