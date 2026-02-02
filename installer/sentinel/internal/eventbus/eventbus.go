package eventbus

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"os"
	"sentinel/internal/core"
	"sync"
	"time"
)

// Event representa un evento genérico del Brain
type Event struct {
	Type      string                 `json:"type"`
	ProfileID string                 `json:"profile_id,omitempty"`
	LaunchID  string                 `json:"launch_id,omitempty"`
	Timestamp int64                  `json:"timestamp"`
	Sequence  uint64                 `json:"sequence,omitempty"`
	Data      map[string]interface{} `json:"data,omitempty"`
	Status    string                 `json:"status,omitempty"`
	Error     string                 `json:"error,omitempty"`
}

// EventHandler es una función que maneja eventos
type EventHandler func(Event)

// EventBus gestiona la conexión TCP con el Brain y distribuye eventos
type EventBus struct {
	addr           string
	conn           net.Conn
	connMu         sync.RWMutex
	eventChan      chan Event
	stopChan       chan struct{}
	reconnectTimer *time.Timer
	ctx            context.Context
	cancel         context.CancelFunc
	logger         *core.Logger
	isConnected    bool
	lastEventTime  int64
	sequence       uint64
	sequenceMu     sync.Mutex
}

// NewEventBus crea una nueva instancia del bus de eventos
// IMPORTANTE: Ahora recibe el logger centralizado desde core
func NewEventBus(brainAddr string, logger *core.Logger) *EventBus {
	ctx, cancel := context.WithCancel(context.Background())
	
	return &EventBus{
		addr:      brainAddr,
		eventChan: make(chan Event, 100),
		stopChan:  make(chan struct{}),
		ctx:       ctx,
		cancel:    cancel,
		logger:    logger,
	}
}

// Connect establece la conexión inicial con el Brain
func (eb *EventBus) Connect() error {
	eb.logger.Info("Intentando conectar con Brain en %s...", eb.addr)
	
	conn, err := net.DialTimeout("tcp", eb.addr, 5*time.Second)
	if err != nil {
		return fmt.Errorf("no se pudo conectar con el Brain: %w", err)
	}
	
	eb.connMu.Lock()
	eb.conn = conn
	eb.isConnected = true
	eb.connMu.Unlock()
	
	eb.logger.Success("Conexión establecida con Brain")
	
	// Enviar registro inicial
	if err := eb.sendRegister(); err != nil {
		eb.logger.Warning("No se pudo enviar REGISTER: %v", err)
	}
	
	return nil
}

// sendRegister envía el mensaje REGISTER_SENTINEL al Brain
func (eb *EventBus) sendRegister() error {
	registerMsg := Event{
		Type:      "REGISTER_SENTINEL",
		Timestamp: time.Now().UnixNano(),
		Data: map[string]interface{}{
			"version":      "1.0.0",
			"hostname":     getHostname(),
			"pid":          os.Getpid(),
			"capabilities": []string{"process_hygiene", "tree_kill", "guardian", "stdin_commands"},
		},
	}
	
	return eb.Send(registerMsg)
}

// Start inicia el loop de lectura de eventos
func (eb *EventBus) Start() {
	go eb.readLoop()
	go eb.healthCheckLoop()
}

// readLoop lee continuamente del socket TCP usando protocolo 4-byte BigEndian
func (eb *EventBus) readLoop() {
	eb.logger.Info("Iniciando loop de lectura de eventos (protocolo 4-byte BigEndian)...")
	
	for {
		select {
		case <-eb.ctx.Done():
			eb.logger.Info("Cerrando loop de lectura")
			return
		default:
			event, err := eb.readEvent()
			if err != nil {
				if err == io.EOF || isConnectionError(err) {
					eb.logger.Warning("Conexión perdida con Brain: %v", err)
					eb.handleDisconnect()
					return // Salir del loop, será reiniciado por reconnect
				}
				eb.logger.Error("Error leyendo evento: %v", err)
				continue
			}
			
			// Actualizar timestamp del último evento
			eb.lastEventTime = time.Now().Unix()
			
			// Enviar el evento al canal
			select {
			case eb.eventChan <- event:
			case <-eb.ctx.Done():
				return
			default:
				eb.logger.Warning("Canal de eventos lleno, descartando evento")
			}
		}
	}
}

// readEvent lee un evento completo usando el protocolo de 4 bytes BigEndian
// CRÍTICO: Esta es la única función autorizada para leer del socket TCP
func (eb *EventBus) readEvent() (Event, error) {
	eb.connMu.RLock()
	conn := eb.conn
	eb.connMu.RUnlock()
	
	if conn == nil {
		return Event{}, fmt.Errorf("no hay conexión activa")
	}
	
	// 1. Leer header de 4 bytes (BigEndian) con el tamaño del payload
	header := make([]byte, 4)
	if _, err := io.ReadFull(conn, header); err != nil {
		return Event{}, err
	}
	
	payloadSize := binary.BigEndian.Uint32(header)
	
	// Validación de tamaño razonable (máximo 10MB)
	if payloadSize > 10*1024*1024 {
		return Event{}, fmt.Errorf("tamaño de payload sospechoso: %d bytes", payloadSize)
	}
	
	// 2. Leer el payload completo
	payload := make([]byte, payloadSize)
	if _, err := io.ReadFull(conn, payload); err != nil {
		return Event{}, err
	}
	
	// 3. Deserializar JSON
	var event Event
	if err := json.Unmarshal(payload, &event); err != nil {
		return Event{}, fmt.Errorf("error deserializando evento: %w", err)
	}
	
	return event, nil
}

// Send envía un mensaje al Brain usando el protocolo de 4 bytes BigEndian
// CRÍTICO: Esta es la única función autorizada para escribir al socket TCP
func (eb *EventBus) Send(event Event) error {
	eb.connMu.Lock() // Lock de escritura para evitar writes concurrentes
	defer eb.connMu.Unlock()
	
	if eb.conn == nil {
		return fmt.Errorf("no hay conexión activa con el Brain")
	}
	
	// Agregar secuencia si no la tiene
	if event.Sequence == 0 {
		eb.sequenceMu.Lock()
		eb.sequence++
		event.Sequence = eb.sequence
		eb.sequenceMu.Unlock()
	}
	
	// Agregar timestamp si no lo tiene
	if event.Timestamp == 0 {
		event.Timestamp = time.Now().UnixNano()
	}
	
	// 1. Serializar a JSON
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("error serializando evento: %w", err)
	}
	
	// 2. Crear header con tamaño (4 bytes BigEndian)
	header := make([]byte, 4)
	binary.BigEndian.PutUint32(header, uint32(len(payload)))
	
	// 3. Enviar header + payload atómicamente
	if _, err := eb.conn.Write(header); err != nil {
		return fmt.Errorf("error enviando header: %w", err)
	}
	
	if _, err := eb.conn.Write(payload); err != nil {
		return fmt.Errorf("error enviando payload: %w", err)
	}
	
	return nil
}

// Events retorna el canal de eventos para que otros componentes lo consuman
func (eb *EventBus) Events() <-chan Event {
	return eb.eventChan
}

// handleDisconnect maneja la desconexión y activa el proceso de reconexión
func (eb *EventBus) handleDisconnect() {
	eb.connMu.Lock()
	eb.isConnected = false
	if eb.conn != nil {
		eb.conn.Close()
		eb.conn = nil
	}
	eb.connMu.Unlock()
	
	eb.logger.Warning("Activando reconexión con backoff exponencial...")
	eb.scheduleReconnect(2 * time.Second)
}

// scheduleReconnect programa un intento de reconexión
func (eb *EventBus) scheduleReconnect(delay time.Duration) {
	if eb.reconnectTimer != nil {
		eb.reconnectTimer.Stop()
	}
	
	eb.reconnectTimer = time.AfterFunc(delay, func() {
		eb.logger.Info("Intentando reconectar...")
		
		if err := eb.Connect(); err != nil {
			eb.logger.Error("Reconexión fallida: %v", err)
			
			// Backoff exponencial: duplicar el delay hasta un máximo de 60 segundos
			nextDelay := delay * 2
			if nextDelay > 60*time.Second {
				nextDelay = 60 * time.Second
			}
			
			eb.scheduleReconnect(nextDelay)
			return
		}
		
		eb.logger.Success("Reconexión exitosa")
		// Reiniciar el loop de lectura
		go eb.readLoop()
	})
}

// healthCheckLoop verifica periódicamente la salud de la conexión
func (eb *EventBus) healthCheckLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-eb.ctx.Done():
			return
		case <-ticker.C:
			eb.connMu.RLock()
			isConn := eb.isConnected
			eb.connMu.RUnlock()
			
			if !isConn {
				continue
			}
			
			// Enviar PING al Brain
			pingEvent := Event{
				Type:      "PING",
				Timestamp: time.Now().UnixNano(),
			}
			
			if err := eb.Send(pingEvent); err != nil {
				eb.logger.Error("Health check falló: %v", err)
				eb.handleDisconnect()
			}
		}
	}
}

// PollEvents solicita eventos históricos desde un timestamp
func (eb *EventBus) PollEvents(sinceTimestamp int64) error {
	pollEvent := Event{
		Type:      "POLL_EVENTS",
		Timestamp: time.Now().UnixNano(),
		Data: map[string]interface{}{
			"since": sinceTimestamp,
		},
	}
	
	return eb.Send(pollEvent)
}

// IsConnected retorna el estado de la conexión
func (eb *EventBus) IsConnected() bool {
	eb.connMu.RLock()
	defer eb.connMu.RUnlock()
	return eb.isConnected
}

// Close cierra la conexión y limpia recursos
func (eb *EventBus) Close() error {
	eb.logger.Info("Cerrando EventBus...")
	
	// Cancelar contexto para detener goroutines
	eb.cancel()
	
	// Detener timer de reconexión si existe
	if eb.reconnectTimer != nil {
		eb.reconnectTimer.Stop()
	}
	
	// Cerrar conexión
	eb.connMu.Lock()
	if eb.conn != nil {
		eb.conn.Close()
		eb.conn = nil
	}
	eb.isConnected = false
	eb.connMu.Unlock()
	
	// Cerrar canales
	close(eb.stopChan)
	
	eb.logger.Success("EventBus cerrado correctamente")
	return nil
}

// Utilidades

func isConnectionError(err error) bool {
	if err == nil {
		return false
	}
	
	// Verificar si es un error de red
	_, isNetErr := err.(net.Error)
	return isNetErr
}

func getHostname() string {
	hostname, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return hostname
}