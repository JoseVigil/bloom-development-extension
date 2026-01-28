package eventbus

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"
)

// SentinelClient proporciona una API de alto nivel sobre el EventBus
type SentinelClient struct {
	bus           *EventBus
	logger        *log.Logger
	eventHandlers map[string][]func(Event)
	ctx           context.Context
	cancel        context.CancelFunc
}

// NewSentinelClient crea un nuevo cliente de alto nivel
func NewSentinelClient(brainAddr string) *SentinelClient {
	ctx, cancel := context.WithCancel(context.Background())
	
	return &SentinelClient{
		bus:           NewEventBus(brainAddr),
		logger:        log.New(os.Stderr, "[SentinelClient] ", log.LstdFlags),
		eventHandlers: make(map[string][]func(Event)),
		ctx:           ctx,
		cancel:        cancel,
	}
}

// Connect establece la conexión con el Brain
func (sc *SentinelClient) Connect() error {
	if err := sc.bus.Connect(); err != nil {
		return err
	}
	
	// Iniciar el bus de eventos
	sc.bus.Start()
	
	// Iniciar el dispatcher de eventos
	go sc.eventDispatcher()
	
	return nil
}

// eventDispatcher distribuye eventos a los handlers registrados
func (sc *SentinelClient) eventDispatcher() {
	sc.logger.Printf("Iniciando dispatcher de eventos...")
	
	for {
		select {
		case <-sc.ctx.Done():
			sc.logger.Printf("Cerrando dispatcher de eventos")
			return
		case event := <-sc.bus.Events():
			// Distribuir a los handlers específicos del tipo
			if handlers, ok := sc.eventHandlers[event.Type]; ok {
				for _, handler := range handlers {
					go handler(event)
				}
			}
			
			// Distribuir a los handlers globales (tipo "*")
			if handlers, ok := sc.eventHandlers["*"]; ok {
				for _, handler := range handlers {
					go handler(event)
				}
			}
		}
	}
}

// On registra un handler para un tipo de evento específico
func (sc *SentinelClient) On(eventType string, handler func(Event)) {
	sc.eventHandlers[eventType] = append(sc.eventHandlers[eventType], handler)
}

// Send envía un evento al Brain
func (sc *SentinelClient) Send(event Event) error {
	return sc.bus.Send(event)
}

// LaunchProfile envía un comando de lanzamiento de perfil
func (sc *SentinelClient) LaunchProfile(profileID string) error {
	sc.logger.Printf("Lanzando perfil: %s", profileID)
	
	launchEvent := Event{
		Type:      "LAUNCH_PROFILE",
		ProfileID: profileID,
		Timestamp: time.Now().UnixNano(),
	}
	
	return sc.bus.Send(launchEvent)
}

// LaunchAndWaitOnboarding lanza un perfil y espera a que complete el onboarding
func (sc *SentinelClient) LaunchAndWaitOnboarding(profileID string, timeout time.Duration) error {
	sc.logger.Printf("Lanzando perfil %s y esperando onboarding...", profileID)
	
	// Canal para recibir el resultado
	resultChan := make(chan error, 1)
	
	// Registrar handler temporal para ONBOARDING_COMPLETE
	handler := func(event Event) {
		if event.ProfileID == profileID {
			if event.Type == "ONBOARDING_COMPLETE" {
				sc.logger.Printf("✓ Onboarding completado para %s", profileID)
				resultChan <- nil
			} else if event.Type == "ONBOARDING_FAILED" || event.Type == "EXTENSION_ERROR" {
				errMsg := "onboarding falló"
				if event.Error != "" {
					errMsg = event.Error
				}
				resultChan <- fmt.Errorf("%s", errMsg)
			}
		}
	}
	
	// Registrar handlers para los eventos relevantes
	sc.On("ONBOARDING_COMPLETE", handler)
	sc.On("ONBOARDING_FAILED", handler)
	sc.On("EXTENSION_ERROR", handler)
	
	// Enviar comando de lanzamiento
	if err := sc.LaunchProfile(profileID); err != nil {
		return err
	}
	
	// Esperar resultado o timeout
	select {
	case err := <-resultChan:
		return err
	case <-time.After(timeout):
		return fmt.Errorf("timeout esperando onboarding de %s", profileID)
	case <-sc.ctx.Done():
		return fmt.Errorf("operación cancelada")
	}
}

// SubmitIntent envía una intención al Brain
func (sc *SentinelClient) SubmitIntent(profileID, intentType string, data map[string]interface{}) error {
	sc.logger.Printf("Enviando intent '%s' para perfil %s", intentType, profileID)
	
	intentEvent := Event{
		Type:      "SUBMIT_INTENT",
		ProfileID: profileID,
		Timestamp: time.Now().UnixNano(),
		Data: map[string]interface{}{
			"intent_type": intentType,
			"payload":     data,
		},
	}
	
	return sc.bus.Send(intentEvent)
}

// SubmitIntentAndWait envía una intención y espera la respuesta
func (sc *SentinelClient) SubmitIntentAndWait(profileID, intentType string, data map[string]interface{}, timeout time.Duration) (Event, error) {
	sc.logger.Printf("Enviando intent '%s' y esperando respuesta...", intentType)
	
	// Canal para recibir el resultado
	resultChan := make(chan Event, 1)
	errorChan := make(chan error, 1)
	
	// Generar un ID único para correlacionar request/response
	requestID := fmt.Sprintf("%s_%d", intentType, time.Now().UnixNano())
	
	// Registrar handler temporal para la respuesta
	handler := func(event Event) {
		// Verificar si es la respuesta a nuestro request
		if event.ProfileID == profileID {
			if event.Type == "INTENT_RESPONSE" {
				if reqID, ok := event.Data["request_id"].(string); ok && reqID == requestID {
					resultChan <- event
				}
			} else if event.Type == "INTENT_ERROR" {
				if reqID, ok := event.Data["request_id"].(string); ok && reqID == requestID {
					errMsg := "error procesando intent"
					if event.Error != "" {
						errMsg = event.Error
					}
					errorChan <- fmt.Errorf("%s", errMsg)
				}
			}
		}
	}
	
	sc.On("INTENT_RESPONSE", handler)
	sc.On("INTENT_ERROR", handler)
	
	// Agregar request_id al payload
	if data == nil {
		data = make(map[string]interface{})
	}
	data["request_id"] = requestID
	
	// Enviar el intent
	if err := sc.SubmitIntent(profileID, intentType, data); err != nil {
		return Event{}, err
	}
	
	// Esperar resultado, error o timeout
	select {
	case result := <-resultChan:
		return result, nil
	case err := <-errorChan:
		return Event{}, err
	case <-time.After(timeout):
		return Event{}, fmt.Errorf("timeout esperando respuesta del intent")
	case <-sc.ctx.Done():
		return Event{}, fmt.Errorf("operación cancelada")
	}
}

// RequestProfileStatus solicita el estado actual de un perfil
func (sc *SentinelClient) RequestProfileStatus(profileID string) error {
	statusEvent := Event{
		Type:      "REQUEST_STATUS",
		ProfileID: profileID,
		Timestamp: time.Now().UnixNano(),
	}
	
	return sc.bus.Send(statusEvent)
}

// StopProfile envía un comando para detener un perfil
func (sc *SentinelClient) StopProfile(profileID string) error {
	sc.logger.Printf("Deteniendo perfil: %s", profileID)
	
	stopEvent := Event{
		Type:      "STOP_PROFILE",
		ProfileID: profileID,
		Timestamp: time.Now().UnixNano(),
	}
	
	return sc.bus.Send(stopEvent)
}

// PollEvents solicita eventos históricos
func (sc *SentinelClient) PollEvents(sinceTimestamp int64) error {
	return sc.bus.PollEvents(sinceTimestamp)
}

// IsConnected verifica si hay conexión activa con el Brain
func (sc *SentinelClient) IsConnected() bool {
	return sc.bus.IsConnected()
}

// WaitForConnection espera hasta que se establezca conexión con el Brain
func (sc *SentinelClient) WaitForConnection(timeout time.Duration) error {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	
	timeoutTimer := time.NewTimer(timeout)
	defer timeoutTimer.Stop()
	
	for {
		select {
		case <-ticker.C:
			if sc.IsConnected() {
				return nil
			}
		case <-timeoutTimer.C:
			return fmt.Errorf("timeout esperando conexión con Brain")
		case <-sc.ctx.Done():
			return fmt.Errorf("operación cancelada")
		}
	}
}

// Close cierra la conexión y limpia recursos
func (sc *SentinelClient) Close() error {
	sc.logger.Printf("Cerrando SentinelClient...")
	
	// Cancelar contexto
	sc.cancel()
	
	// Cerrar el bus
	return sc.bus.Close()
}

// GetLastEventTimestamp retorna el timestamp del último evento recibido
func (sc *SentinelClient) GetLastEventTimestamp() int64 {
	return sc.bus.lastEventTime
}