// internal/governance/alfred_server.go
package governance

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"sync"
	"time"

	"nucleus/internal/core"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/spf13/cobra"
)

// AlfredServer maneja REST y WebSocket
type AlfredServer struct {
	alfred    *Alfred
	router    *mux.Router
	upgrader  websocket.Upgrader
	clients   map[*websocket.Conn]bool
	broadcast chan WSMessage
	mu        sync.Mutex
}

// WSMessage estructura para mensajes WebSocket
type WSMessage struct {
	Type      string      `json:"type"`
	Payload   interface{} `json:"payload"`
	Timestamp int64       `json:"timestamp"`
}

// NewAlfredServer crea nuevo servidor
func NewAlfredServer(alfred *Alfred) *AlfredServer {
	server := &AlfredServer{
		alfred:   alfred,
		router:   mux.NewRouter(),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				return true // En producción, validar origen
			},
		},
		clients:   make(map[*websocket.Conn]bool),
		broadcast: make(chan WSMessage, 100),
	}

	server.setupRoutes()
	return server
}

// setupRoutes configura las rutas REST
func (s *AlfredServer) setupRoutes() {
	// REST Endpoints
	s.router.HandleFunc("/alfred/status", s.handleStatus).Methods("GET")
	s.router.HandleFunc("/alfred/verify", s.handleVerify).Methods("POST")
	s.router.HandleFunc("/alfred/integrity", s.handleIntegrity).Methods("GET")
	
	// WebSocket
	s.router.HandleFunc("/alfred/ws", s.handleWebSocket)
}

// handleStatus - GET /alfred/status
func (s *AlfredServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	status := s.alfred.GetStatus()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    status,
	})
}

// handleVerify - POST /alfred/verify
func (s *AlfredServer) handleVerify(w http.ResponseWriter, r *http.Request) {
	var intent Intent
	
	if err := json.NewDecoder(r.Body).Decode(&intent); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	result := s.alfred.VerifyIntent(intent)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    result,
	})
}

// handleIntegrity - GET /alfred/integrity
func (s *AlfredServer) handleIntegrity(w http.ResponseWriter, r *http.Request) {
	report := s.alfred.CheckIntegrity()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    report,
	})
}

// handleWebSocket maneja conexiones WebSocket
func (s *AlfredServer) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Printf("WebSocket upgrade error: %v\n", err)
		return
	}

	s.mu.Lock()
	s.clients[conn] = true
	s.mu.Unlock()

	fmt.Printf("WebSocket client connected: %s\n", conn.RemoteAddr())

	// Enviar mensaje de bienvenida
	welcomeMsg := WSMessage{
		Type: "welcome",
		Payload: map[string]string{
			"message": "Connected to Alfred Control Plane",
			"version": "1.0.0",
		},
		Timestamp: time.Now().Unix(),
	}
	conn.WriteJSON(welcomeMsg)

	// Manejar mensajes del cliente
	go s.handleClientMessages(conn)
}

// handleClientMessages procesa mensajes entrantes del cliente
func (s *AlfredServer) handleClientMessages(conn *websocket.Conn) {
	defer func() {
		s.mu.Lock()
		delete(s.clients, conn)
		s.mu.Unlock()
		conn.Close()
	}()

	for {
		var msg WSMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			fmt.Printf("WebSocket read error: %v\n", err)
			break
		}

		// Procesar mensaje según tipo
		switch msg.Type {
		case "request_signature":
			s.handleSignatureRequest(conn, msg)
		case "ping":
			conn.WriteJSON(WSMessage{
				Type:      "pong",
				Timestamp: time.Now().Unix(),
			})
		}
	}
}

// handleSignatureRequest procesa solicitudes de firma
func (s *AlfredServer) handleSignatureRequest(conn *websocket.Conn, msg WSMessage) {
	payload, ok := msg.Payload.(map[string]interface{})
	if !ok {
		conn.WriteJSON(WSMessage{
			Type: "error",
			Payload: map[string]string{
				"message": "Invalid payload format",
			},
			Timestamp: time.Now().Unix(),
		})
		return
	}

	// Verificar si el vault está desbloqueado
	status := s.alfred.GetStatus()
	if status.Locked {
		conn.WriteJSON(WSMessage{
			Type: "signature_response",
			Payload: map[string]interface{}{
				"approved": false,
				"reason":   "Vault is locked",
			},
			Timestamp: time.Now().Unix(),
		})
		return
	}

	// Simular aprobación de firma
	conn.WriteJSON(WSMessage{
		Type: "signature_response",
		Payload: map[string]interface{}{
			"approved":  true,
			"signature": "MOCK_SIGNATURE_" + fmt.Sprint(time.Now().Unix()),
			"document":  payload["document"],
		},
		Timestamp: time.Now().Unix(),
	})
}

// BroadcastMessage envía mensaje a todos los clientes conectados
func (s *AlfredServer) BroadcastMessage(msg WSMessage) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for client := range s.clients {
		err := client.WriteJSON(msg)
		if err != nil {
			fmt.Printf("Error broadcasting to client: %v\n", err)
			client.Close()
			delete(s.clients, client)
		}
	}
}

// Start inicia ambos servidores (REST y WebSocket)
func (s *AlfredServer) Start() error {
	// Iniciar broadcaster
	go s.broadcaster()

	// Iniciar servidor HTTP/WebSocket en puerto 48216
	// El WebSocket comparte el mismo puerto
	fmt.Println("Starting Alfred Authority Server...")
	fmt.Println("REST API listening on :48216")
	fmt.Println("WebSocket endpoint: ws://localhost:48216/alfred/ws")
	
	return http.ListenAndServe(":48216", s.router)
}

// broadcaster procesa mensajes del canal broadcast
func (s *AlfredServer) broadcaster() {
	for msg := range s.broadcast {
		s.BroadcastMessage(msg)
	}
}

// EmitSecurityBreach emite evento de breach por WebSocket
func (s *AlfredServer) EmitSecurityBreach(details string) {
	msg := WSMessage{
		Type: "SECURITY_BREACH",
		Payload: map[string]string{
			"severity": "CRITICAL",
			"details":  details,
		},
		Timestamp: time.Now().Unix(),
	}
	
	s.broadcast <- msg
}

// ────────────────────────────────────────────────
// CLI: nucleus alfred start
// ────────────────────────────────────────────────

func init() {
	core.RegisterCommand("GOVERNANCE", alfredStartCmd)
}

func alfredStartCmd(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "alfred start",
		Short: "Inicia el custodio administrativo y los servidores de autoridad",
		Long:  "Levanta el servidor REST (48216) y el Socket (48217). Inicia el loop de auditoría.",
		Run: func(cmd *cobra.Command, args []string) {
			// Inicializar logger custom para Alfred
			logger, err := core.InitLogger(&c.Paths, "ALFRED")
			if err != nil {
				fmt.Fprintf(os.Stderr, "[ERROR] Fallo al inicializar logger: %v\n", err)
				os.Exit(1)
			}
			defer logger.Close()

			// Verificación de autoridad
			if err := RequireAtLeast(c, "architect"); err != nil {
				logger.Error("Acceso Denegado: Este comando requiere rol mínimo Architect")
				os.Exit(1)
			}

			alfred, err := NewAlfred()
			if err != nil {
				logger.Error("Fallo al inicializar Alfred: %v", err)
				os.Exit(1)
			}

			// Iniciar loop de auditoría
			monitor := NewIntegrityMonitor(alfred, 5*time.Minute)
			monitor.Start()
			defer monitor.Stop()

			// Canal para shutdown graceful
			sigChan := make(chan os.Signal, 1)
			signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

			// Heartbeat en stderr
			go func() {
				ticker := time.NewTicker(30 * time.Second)
				defer ticker.Stop()
				for {
					select {
					case <-ticker.C:
						status := alfred.GetStatus()
						logger.Info("[ALFRED heartbeat] Locked: %v, Rules: %s...", status.Locked, status.RulesHash[:12])
					case <-sigChan:
						return
					}
				}
			}()

			logger.Info("Iniciando Alfred Authority Server...")
			logger.Info("Presione Ctrl+C para detener")

			// Ejecutar servidor (bloqueante)
			if err := alfred.StartServer(); err != nil {
				logger.Error("Servidor Alfred finalizó con error: %v", err)
				os.Exit(1)
			}
		},
	}

	return cmd
}

// RequireAtLeast verifica si el usuario tiene el nivel de permiso necesario
func RequireAtLeast(c *core.Core, role string) error {
	// Por ahora stub - aquí iría validación de jerarquía: Master > Architect > Specialist
	return nil
}

// RequireMaster verifica permiso de Master
func RequireMaster(c *core.Core) error {
	// Por ahora stub - aquí iría validación de rol Master
	return nil
}