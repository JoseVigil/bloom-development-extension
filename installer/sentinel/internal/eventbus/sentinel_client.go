package eventbus

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"sync"
	"time"
)

// SentinelClient gestiona la conexión con el Brain
type SentinelClient struct {
	addr            string
	conn            net.Conn
	connected       bool
	connMu          sync.RWMutex
	handlers        map[string][]EventHandler
	handlersMu      sync.RWMutex
	reconnecting    bool
	reconnectMu     sync.Mutex
	stopChan        chan struct{}
	eventChan       chan Event
}

// NewSentinelClient crea un nuevo cliente de Sentinel
func NewSentinelClient(addr string) *SentinelClient {
	return &SentinelClient{
		addr:      addr,
		handlers:  make(map[string][]EventHandler),
		stopChan:  make(chan struct{}),
		eventChan: make(chan Event, 100),
	}
}

// Connect establece conexión con el Brain
func (sc *SentinelClient) Connect() error {
	sc.connMu.Lock()
	defer sc.connMu.Unlock()

	conn, err := net.DialTimeout("tcp", sc.addr, 10*time.Second)
	if err != nil {
		return fmt.Errorf("conexión fallida: %w", err)
	}

	sc.conn = conn
	sc.connected = true

	// Iniciar goroutine de lectura
	go sc.readLoop()
	go sc.eventDispatcher()

	// Enviar evento de registro
	return sc.sendRegistration()
}

// WaitForConnection espera a que la conexión esté activa
func (sc *SentinelClient) WaitForConnection(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	
	for time.Now().Before(deadline) {
		sc.connMu.RLock()
		connected := sc.connected
		sc.connMu.RUnlock()
		
		if connected {
			return nil
		}
		
		time.Sleep(100 * time.Millisecond)
	}
	
	return fmt.Errorf("timeout esperando conexión")
}

// sendRegistration envía el evento REGISTER_SENTINEL
func (sc *SentinelClient) sendRegistration() error {
	event := Event{
		Type:      "REGISTER_SENTINEL",
		Timestamp: time.Now().UnixNano(),
		Data: map[string]interface{}{
			"sentinel_version": "1.0.0",
			"pid":              os.Getpid(),
			"capabilities":     []string{"process_hygiene", "tree_kill", "guardian", "stdin_commands"},
		},
	}

	return sc.Send(event)
}

// Send envía un evento al Brain
func (sc *SentinelClient) Send(event Event) error {
	sc.connMu.RLock()
	defer sc.connMu.RUnlock()

	if !sc.connected || sc.conn == nil {
		return fmt.Errorf("no hay conexión con Brain")
	}

	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("error serializando evento: %w", err)
	}

	// Agregar newline como delimitador
	data = append(data, '\n')

	_, err = sc.conn.Write(data)
	if err != nil {
		// Marcar como desconectado
		sc.connMu.RUnlock()
		sc.connMu.Lock()
		sc.connected = false
		sc.connMu.Unlock()
		sc.connMu.RLock()

		// Intentar reconexión
		go sc.reconnect()
		return fmt.Errorf("error enviando evento: %w", err)
	}

	return nil
}

// readLoop lee eventos del Brain continuamente
func (sc *SentinelClient) readLoop() {
	scanner := bufio.NewScanner(sc.conn)
	
	for scanner.Scan() {
		line := scanner.Bytes()
		
		var event Event
		if err := json.Unmarshal(line, &event); err != nil {
			fmt.Fprintf(os.Stderr, "[SentinelClient] Error parseando evento: %v\n", err)
			continue
		}

		// Enviar al canal de eventos
		select {
		case sc.eventChan <- event:
		case <-sc.stopChan:
			return
		default:
			fmt.Fprintf(os.Stderr, "[SentinelClient] Canal de eventos lleno, descartando evento\n")
		}
	}

	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "[SentinelClient] Error leyendo del Brain: %v\n", err)
	}

	// Conexión cerrada
	sc.connMu.Lock()
	sc.connected = false
	sc.connMu.Unlock()

	// Intentar reconexión
	go sc.reconnect()
}

// eventDispatcher despacha eventos a los handlers registrados
func (sc *SentinelClient) eventDispatcher() {
	for {
		select {
		case <-sc.stopChan:
			return
		case event := <-sc.eventChan:
			sc.dispatch(event)
		}
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
	event := Event{
		Type:      "POLL_EVENTS",
		Timestamp: time.Now().UnixNano(),
		Data: map[string]interface{}{
			"since": since,
		},
	}
	return sc.Send(event)
}

// reconnect intenta reconectar al Brain
func (sc *SentinelClient) reconnect() {
	sc.reconnectMu.Lock()
	if sc.reconnecting {
		sc.reconnectMu.Unlock()
		return
	}
	sc.reconnecting = true
	sc.reconnectMu.Unlock()

	defer func() {
		sc.reconnectMu.Lock()
		sc.reconnecting = false
		sc.reconnectMu.Unlock()
	}()

	fmt.Fprintf(os.Stderr, "[SentinelClient] Intentando reconexión...\n")

	maxRetries := 5
	for i := 0; i < maxRetries; i++ {
		time.Sleep(time.Duration(i+1) * 2 * time.Second)

		if err := sc.Connect(); err != nil {
			fmt.Fprintf(os.Stderr, "[SentinelClient] Reintento %d/%d fallido: %v\n", i+1, maxRetries, err)
			continue
		}

		fmt.Fprintf(os.Stderr, "[SentinelClient] Reconexión exitosa\n")
		return
	}

	fmt.Fprintf(os.Stderr, "[SentinelClient] Reconexión fallida tras %d intentos\n", maxRetries)
}

// Close cierra la conexión con el Brain
func (sc *SentinelClient) Close() error {
	close(sc.stopChan)

	sc.connMu.Lock()
	defer sc.connMu.Unlock()

	if sc.conn != nil {
		return sc.conn.Close()
	}

	return nil
}

// IsConnected retorna si hay conexión activa con el Brain
func (sc *SentinelClient) IsConnected() bool {
	sc.connMu.RLock()
	defer sc.connMu.RUnlock()
	return sc.connected
}