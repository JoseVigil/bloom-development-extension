// internal/transport/sentinel_client.go

package transport

import (
	"encoding/binary"
	"encoding/json"
	"math"
	"net"
	"sync"
	"time"

	"bloom-sensor/pkg/events"
)

const (
	sentinelAddress    = `\\.\pipe\bloom-sentinel` // Named pipe de Sentinel
	reconnectBaseDelay = 2 * time.Second
	reconnectMaxDelay  = 60 * time.Second
)

// Client maneja la conexión a Sentinel con reconexión automática en background.
// El runtime principal nunca bloquea esperando al cliente.
type Client struct {
	mu          sync.Mutex
	conn        net.Conn
	connected   bool
	reconnectCh chan struct{}
}

// NewClient crea un Client y arranca el loop de reconexión en background.
func NewClient() *Client {
	c := &Client{
		reconnectCh: make(chan struct{}, 1),
	}
	go c.reconnectLoop()
	// Intentar conexión inicial
	c.reconnectCh <- struct{}{}
	return c
}

// IsConnected retorna true si hay una conexión activa con Sentinel.
func (c *Client) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connected
}

// Publish serializa y envía un evento a Sentinel usando el protocolo:
// 4 bytes big-endian (longitud del payload) + JSON.
// Si falla, marca la conexión como caída y señaliza reconexión.
// Nunca bloquea más allá del write timeout.
func (c *Client) Publish(evt events.Event) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.connected || c.conn == nil {
		return net.ErrClosed
	}

	payload, err := json.Marshal(evt)
	if err != nil {
		return err
	}

	// Framing: 4 bytes big-endian + payload
	header := make([]byte, 4)
	binary.BigEndian.PutUint32(header, uint32(len(payload)))

	c.conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	if _, err := c.conn.Write(append(header, payload...)); err != nil {
		c.connected = false
		c.conn.Close()
		c.conn = nil
		// Señalizar reconexión sin bloquear
		select {
		case c.reconnectCh <- struct{}{}:
		default:
		}
		return err
	}

	return nil
}

// Close cierra la conexión activa si existe.
func (c *Client) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil {
		c.conn.Close()
		c.conn = nil
	}
	c.connected = false
}

// reconnectLoop intenta reconectarse a Sentinel con backoff exponencial.
// Corre siempre en background; nunca interfiere con el runtime principal.
func (c *Client) reconnectLoop() {
	delay := reconnectBaseDelay

	for range c.reconnectCh {
		for {
			conn, err := net.DialTimeout("tcp", sentinelAddress, 3*time.Second)
			if err == nil {
				c.mu.Lock()
				c.conn = conn
				c.connected = true
				c.mu.Unlock()
				delay = reconnectBaseDelay // reset backoff
				break
			}

			time.Sleep(delay)
			delay = time.Duration(math.Min(float64(delay*2), float64(reconnectMaxDelay)))
		}
	}
}
