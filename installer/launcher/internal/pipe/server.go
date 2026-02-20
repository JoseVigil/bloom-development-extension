// internal/pipe/server.go

package pipe

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"sync"

	"bloom-launcher/internal/logger"

	"github.com/Microsoft/go-winio"
)

const PipeName = `\\.\pipe\bloom-launcher`

// LaunchRequest es el mensaje JSON que el cliente envía por el pipe.
type LaunchRequest struct {
	Command string   `json:"command"`
	Args    []string `json:"args,omitempty"`
}

// LaunchResponse es la respuesta JSON que el servidor devuelve.
type LaunchResponse struct {
	OK      bool   `json:"ok"`
	Success bool   `json:"success"`
	PID     int    `json:"pid,omitempty"`
	Error   string `json:"error,omitempty"`
}

// HandlerFunc es la firma que debe cumplir el handler de lanzamiento.
type HandlerFunc func(req LaunchRequest) LaunchResponse

// Server gestiona el named pipe y despacha las conexiones.
type Server struct {
	handler  HandlerFunc
	log      *logger.Logger
	listener net.Listener
	mu       sync.Mutex
	closed   bool
}

// NewServer crea el listener del named pipe.
// Devuelve error si ya hay otro proceso escuchando en el mismo pipe.
func NewServer(handler HandlerFunc, log *logger.Logger) (*Server, error) {
	cfg := &winio.PipeConfig{
		// Permisos: el dueño puede leer/escribir; usuarios del mismo logon también.
		SecurityDescriptor: "D:P(A;;GA;;;OW)(A;;GA;;;LS)(A;;GRGW;;;WD)",
	}

	listener, err := winio.ListenPipe(PipeName, cfg)
	if err != nil {
		return nil, fmt.Errorf("no se pudo abrir el named pipe %s: %w", PipeName, err)
	}

	return &Server{
		handler:  handler,
		log:      log,
		listener: listener,
	}, nil
}

// IsRunning comprueba si ya hay un servidor activo intentando conectar.
func IsRunning() bool {
	conn, err := winio.DialPipe(PipeName, nil)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// Listen acepta conexiones en bucle hasta que se llame Close().
func (s *Server) Listen() error {
	s.log.Info("Named pipe server activo en %s", PipeName)

	for {
		conn, err := s.listener.Accept()
		if err != nil {
			s.mu.Lock()
			isClosed := s.closed
			s.mu.Unlock()
			if isClosed {
				return nil // cierre limpio
			}
			s.log.Warn("Error aceptando conexión: %v", err)
			continue
		}
		go s.handleConn(conn)
	}
}

// Close detiene el servidor cerrando el listener.
func (s *Server) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.closed = true
	if s.listener != nil {
		s.listener.Close()
	}
}

func (s *Server) handleConn(conn net.Conn) {
	defer conn.Close()

	data, err := io.ReadAll(conn)
	if err != nil {
		s.log.Warn("Error leyendo del pipe: %v", err)
		return
	}

	var req LaunchRequest
	if err := json.Unmarshal(data, &req); err != nil {
		s.log.Warn("JSON inválido recibido: %v", err)
		writeResponse(conn, LaunchResponse{OK: false, Success: false, Error: "invalid JSON"})
		return
	}

	s.log.Info("Solicitud recibida: command=%q args=%v", req.Command, req.Args)

	resp := s.handler(req)

	writeResponse(conn, resp)
}

func writeResponse(conn net.Conn, resp LaunchResponse) {
	data, _ := json.Marshal(resp)
	conn.Write(data)
}