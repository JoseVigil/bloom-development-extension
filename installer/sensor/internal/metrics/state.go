// internal/metrics/state.go

package metrics

import (
	"sync"
	"time"

	"bloom-sensor/pkg/events"
)

const defaultCapacity = 1440 // 24h a 1 tick por minuto

// RingBuffer almacena los últimos N snapshots de HumanState en memoria.
// Es la fuente de datos para el comando `bloom-sensor export`.
type RingBuffer struct {
	mu       sync.RWMutex
	capacity int
	items    []events.HumanState
	head     int
	size     int
}

// NewRingBuffer crea un ring buffer con capacidad dada (default si capacity <= 0).
func NewRingBuffer(capacity int) *RingBuffer {
	if capacity <= 0 {
		capacity = defaultCapacity
	}
	return &RingBuffer{
		capacity: capacity,
		items:    make([]events.HumanState, capacity),
	}
}

// Push agrega un snapshot al ring buffer. Sobreescribe el más antiguo si está lleno.
func (rb *RingBuffer) Push(s events.HumanState) {
	rb.mu.Lock()
	defer rb.mu.Unlock()

	rb.items[rb.head] = s
	rb.head = (rb.head + 1) % rb.capacity
	if rb.size < rb.capacity {
		rb.size++
	}
}

// Last retorna los últimos n snapshots en orden cronológico.
// Si n > size, retorna todos los disponibles.
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

// Since retorna todos los snapshots con Timestamp posterior a (now - d).
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
