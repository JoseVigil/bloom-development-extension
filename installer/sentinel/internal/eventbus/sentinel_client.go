package eventbus

import (
	"fmt"
	"os"
	"sentinel/internal/core"
	"sync"
	"time"
)

// SentinelClient gestiona la comunicación con el Brain usando EventBus
type SentinelClient struct {
	bus         *EventBus
	handlers    map[string][]EventHandler
	handlersMu  sync.RWMutex
	logger      *core.Logger
}

// NewSentinelClient crea un nuevo cliente de Sentinel que consume un EventBus
// IMPORTANTE: Ahora recibe el logger centralizado
func NewSentinelClient(addr string, logger *core.Logger) *SentinelClient {
	bus := NewEventBus(addr, logger)
	
	sc := &SentinelClient{
		bus:      bus,
		handlers: make(map[string][]EventHandler),
		logger:   logger,
	}
	
	// Iniciar dispatcher de eventos desde el bus
	go sc.eventDispatcher()
	
	return sc
}

// Connect establece conexión con el Brain y arranca el EventBus
func (sc *SentinelClient) Connect() error {
	if err := sc.bus.Connect(); err != nil {
		return err
	}
	
	// Iniciar el loop de lectura del bus
	sc.bus.Start()
	
	return nil
}

// WaitForConnection espera a que la conexión esté activa
func (sc *SentinelClient) WaitForConnection(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	
	for time.Now().Before(deadline) {
		if sc.bus.IsConnected() {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	
	return fmt.Errorf("timeout esperando conexión")
}

// eventDispatcher consume eventos del EventBus y los despacha a los handlers registrados
// REGLA DE ORO: Un solo socket, un solo loop de lectura (en eventbus.go), múltiples consumidores
func (sc *SentinelClient) eventDispatcher() {
	for event := range sc.bus.Events() {
		sc.dispatch(event)
	}
}

// dispatch envía un evento a los handlers correspondientes
func (sc *SentinelClient) dispatch(event Event) {
	sc.handlersMu.RLock()
	defer sc.handlersMu.RUnlock()

	// Ejecutar handlers específicos del tipo de evento
	if handlers, ok := sc.handlers[event.Type]; ok {
		for _, handler := range handlers {
			go handler(event)
		}
	}

	// Ejecutar handler wildcard (*)
	if handlers, ok := sc.handlers["*"]; ok {
		for _, handler := range handlers {
			go handler(event)
		}
	}
}

// On registra un handler para un tipo de evento
func (sc *SentinelClient) On(eventType string, handler EventHandler) {
	sc.handlersMu.Lock()
	defer sc.handlersMu.Unlock()

	sc.handlers[eventType] = append(sc.handlers[eventType], handler)
}

// Send envía un evento al Brain a través del EventBus
func (sc *SentinelClient) Send(event Event) error {
	return sc.bus.Send(event)
}

// LaunchProfile envía comando de lanzamiento al Brain
func (sc *SentinelClient) LaunchProfile(profileID string) error {
	event := Event{
		Type:      "LAUNCH_PROFILE",
		ProfileID: profileID,
		Timestamp: time.Now().UnixNano(),
	}
	return sc.Send(event)
}

// StopProfile envía comando de detención al Brain
func (sc *SentinelClient) StopProfile(profileID string) error {
	event := Event{
		Type:      "STOP_PROFILE",
		ProfileID: profileID,
		Timestamp: time.Now().UnixNano(),
	}
	return sc.Send(event)
}

// RequestProfileStatus solicita el estado de un perfil
func (sc *SentinelClient) RequestProfileStatus(profileID string) error {
	event := Event{
		Type:      "REQUEST_PROFILE_STATUS",
		ProfileID: profileID,
		Timestamp: time.Now().UnixNano(),
	}
	return sc.Send(event)
}

// SubmitIntent envía una intención al Brain
func (sc *SentinelClient) SubmitIntent(profileID, intentType string, payload map[string]interface{}) error {
	event := Event{
		Type:      "SUBMIT_INTENT",
		ProfileID: profileID,
		Timestamp: time.Now().UnixNano(),
		Data: map[string]interface{}{
			"intent_type": intentType,
			"payload":     payload,
		},
	}
	return sc.Send(event)
}

// PollEvents solicita eventos históricos desde un timestamp
func (sc *SentinelClient) PollEvents(since int64) error {
	return sc.bus.PollEvents(since)
}

// SendProfileStateSync envía correcciones masivas de estado al Brain
// Implementa la Coreografía de Inicio del Prompt (Fase 3: SYNC)
func (sc *SentinelClient) SendProfileStateSync(corrections []map[string]interface{}) error {
	event := Event{
		Type:      "PROFILE_STATE_SYNC",
		Timestamp: time.Now().UnixNano(),
		Data: map[string]interface{}{
			"corrections": corrections,
			"source":      "startup_audit",
		},
	}
	
	if err := sc.Send(event); err != nil {
		return fmt.Errorf("error enviando PROFILE_STATE_SYNC: %w", err)
	}
	
	fmt.Fprintf(os.Stderr, "[SentinelClient] Sincronización de estado enviada (%d correcciones)\n", len(corrections))
	return nil
}

// IsConnected retorna si hay conexión activa con el Brain
func (sc *SentinelClient) IsConnected() bool {
	return sc.bus.IsConnected()
}

// Close cierra la conexión con el Brain
func (sc *SentinelClient) Close() error {
	return sc.bus.Close()
}