package eventbus

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sentinel/internal/core"
	"sync"
	"time"

	"github.com/spf13/cobra"
)

func init() {
	// ═══════════════════════════════════════════════════════════════
	// COMANDO: send
	// Categoría: BRIDGE
	// Descripción: Envía un evento directo al Brain
	// ═══════════════════════════════════════════════════════════════
	core.RegisterCommand("BRIDGE", func(c *core.Core) *cobra.Command {
		var brainAddr string
		var eventType string
		var profileID string
		var dataJSON string

		cmd := &cobra.Command{
			Use:   "send",
			Short: "Envía un evento/comando directo al Brain",
			Long: `Envía un evento o comando directamente al Brain mediante el EventBus.

Útil para testing manual o integración con scripts.

Ejemplos:
  # Lanzar un perfil
  sentinel send --type LAUNCH_PROFILE --profile-id profile_001

  # Detener un perfil
  sentinel send --type STOP_PROFILE --profile-id profile_001

  # Solicitar estado
  sentinel send --type REQUEST_PROFILE_STATUS --profile-id profile_001

  # Enviar evento con datos personalizados (JSON)
  sentinel send --type CUSTOM_EVENT --data '{"key":"value","num":42}'

  # Solicitar eventos históricos
  sentinel send --type POLL_EVENTS --data '{"since":1234567890}'`,
			Args: cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				if eventType == "" {
					c.Logger.Error("El flag --type es obligatorio")
					os.Exit(1)
				}

				// Crear paths personalizado para eventbus
				eventbusPaths := *c.Paths
				eventbusPaths.LogsDir = filepath.Join(c.Paths.LogsDir, "sentinel", "eventbus")

				// Crear logger temporal para este comando
				logger, err := core.InitLogger(
					&eventbusPaths,
					"sentinel_event_bus",
					"🚌 SENTINEL EVENT BUS",
					2,
					&core.LoggerOptions{
						Categories:  []string{"sentinel"},
						Description: "Sentinel event bus log — tracks direct event sends from CLI to Brain",
						JSONMode:    c.IsJSON,
					},
				)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[ERROR] No se pudo inicializar logger: %v\n", err)
					os.Exit(1)
				}
				defer logger.Close()

				// Crear cliente y conectar
				client := NewSentinelClient(brainAddr, logger)
				if err := client.Connect(); err != nil {
					logger.Error("Error conectando con Brain: %v", err)
					os.Exit(1)
				}
				defer client.Close()

				// Esperar conexión activa
				if err := client.WaitForConnection(5 * time.Second); err != nil {
					logger.Error("Timeout esperando conexión: %v", err)
					os.Exit(1)
				}

				// Parsear datos JSON si existen
				var data map[string]interface{}
				if dataJSON != "" {
					if err := json.Unmarshal([]byte(dataJSON), &data); err != nil {
						logger.Error("Error parseando --data JSON: %v", err)
						os.Exit(1)
					}
				}

				// Construir evento
				event := Event{
					Type:      eventType,
					ProfileID: profileID,
					Timestamp: time.Now().UnixNano(),
					Data:      data,
				}

				// Enviar evento
				logger.Info("Enviando evento '%s' al Brain...", eventType)
				if err := client.Send(event); err != nil {
					logger.Error("Error enviando evento: %v", err)
					os.Exit(1)
				}

				logger.Success("Evento enviado correctamente")

				// Esperar un momento para respuestas asíncronas
				time.Sleep(500 * time.Millisecond)
			},
		}

		cmd.Flags().StringVar(&brainAddr, "brain-addr", "127.0.0.1:5678", 
			"Dirección TCP del Brain")
		cmd.Flags().StringVarP(&eventType, "type", "t", "", 
			"Tipo de evento (LAUNCH_PROFILE, STOP_PROFILE, etc.) [REQUERIDO]")
		cmd.Flags().StringVarP(&profileID, "profile-id", "p", "", 
			"ID del perfil (opcional)")
		cmd.Flags().StringVarP(&dataJSON, "data", "d", "", 
			"Datos adicionales en formato JSON (opcional)")

		return cmd
	})

	// ═══════════════════════════════════════════════════════════════
	// COMANDO: listen
	// Categoría: BRIDGE
	// Descripción: Escucha eventos del Brain en tiempo real
	// ═══════════════════════════════════════════════════════════════
	core.RegisterCommand("BRIDGE", func(c *core.Core) *cobra.Command {
		var brainAddr string
		var eventFilter string
		var outputJSON bool

		cmd := &cobra.Command{
			Use:   "listen",
			Short: "Escucha eventos del Brain en tiempo real",
			Long: `Conecta con el Brain y escucha todos los eventos en tiempo real.

Útil para debugging, monitoreo y testing de integración.

Ejemplos:
  # Escuchar todos los eventos
  sentinel listen

  # Escuchar solo eventos de onboarding
  sentinel listen --filter ONBOARDING_

  # Escuchar eventos de un perfil específico
  sentinel listen --filter profile_001

  # Salida en JSON puro (sin formateo)
  sentinel listen --json`,
			Args: cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				// Crear paths personalizado para eventbus
				eventbusPaths := *c.Paths
				eventbusPaths.LogsDir = filepath.Join(c.Paths.LogsDir, "sentinel", "eventbus")

				// Crear logger temporal
				logger, err := core.InitLogger(
					&eventbusPaths,
					"sentinel_event_bus",
					"🚌 SENTINEL EVENT BUS",
					2,
					&core.LoggerOptions{
						Categories:  []string{"sentinel"},
						Description: "Sentinel event bus log — tracks real-time event listening from Brain",
						JSONMode:    c.IsJSON,
					},
				)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[ERROR] No se pudo inicializar logger: %v\n", err)
					os.Exit(1)
				}
				defer logger.Close()

				// Crear cliente y conectar
				client := NewSentinelClient(brainAddr, logger)
				if err := client.Connect(); err != nil {
					logger.Error("Error conectando con Brain: %v", err)
					os.Exit(1)
				}
				defer client.Close()

				// Esperar conexión activa
				if err := client.WaitForConnection(5 * time.Second); err != nil {
					logger.Error("Timeout esperando conexión: %v", err)
					os.Exit(1)
				}

				logger.Success("Conectado con Brain en %s", brainAddr)
				logger.Info("Escuchando eventos... (Ctrl+C para detener)")
				if eventFilter != "" {
					logger.Info("Filtro activo: eventos que contengan '%s'", eventFilter)
				}
				fmt.Fprintln(os.Stderr, "")

				// Registrar handler para todos los eventos
				client.On("*", func(event Event) {
					// Aplicar filtro si existe
					if eventFilter != "" {
						// Filtrar por tipo de evento o profile_id
						if !contains(event.Type, eventFilter) && event.ProfileID != eventFilter {
							return
						}
					}

					if outputJSON {
						// Salida JSON pura
						data, _ := json.Marshal(event)
						fmt.Println(string(data))
					} else {
						// Salida formateada
						timestamp := time.Unix(0, event.Timestamp).Format("15:04:05.000")
						fmt.Fprintf(os.Stderr, "[%s] %s", timestamp, event.Type)
						
						if event.ProfileID != "" {
							fmt.Fprintf(os.Stderr, " (profile: %s)", event.ProfileID)
						}
						
						if event.Status != "" {
							fmt.Fprintf(os.Stderr, " [%s]", event.Status)
						}
						
						fmt.Fprintln(os.Stderr, "")
						
						if event.Error != "" {
							fmt.Fprintf(os.Stderr, "  Error: %s\n", event.Error)
						}
						
						if len(event.Data) > 0 {
							dataJSON, _ := json.MarshalIndent(event.Data, "  ", "  ")
							fmt.Fprintf(os.Stderr, "  Data: %s\n", string(dataJSON))
						}
						
						fmt.Fprintln(os.Stderr, "")
					}
				})

				// Mantener vivo indefinidamente
				select {}
			},
		}

		cmd.Flags().StringVar(&brainAddr, "brain-addr", "127.0.0.1:5678", 
			"Dirección TCP del Brain")
		cmd.Flags().StringVarP(&eventFilter, "filter", "f", "", 
			"Filtrar eventos por tipo o profile_id (substring match)")
		cmd.Flags().BoolVar(&outputJSON, "json", false, 
			"Salida en JSON puro (sin formateo legible)")

		return cmd
	})

	// ═══════════════════════════════════════════════════════════════
	// COMANDO: poll
	// Categoría: BRIDGE
	// Descripción: Solicita eventos históricos desde un timestamp
	// ═══════════════════════════════════════════════════════════════
	core.RegisterCommand("BRIDGE", func(c *core.Core) *cobra.Command {
		var brainAddr string
		var sinceTimestamp int64
		var sinceTime string

		cmd := &cobra.Command{
			Use:   "poll",
			Short: "Solicita eventos históricos desde un timestamp",
			Long: `Solicita al Brain todos los eventos ocurridos desde un timestamp específico.

Útil para rehidratación después de una desconexión o para análisis histórico.

Ejemplos:
  # Últimos 5 minutos
  sentinel poll --since-time "5m"

  # Última hora
  sentinel poll --since-time "1h"

  # Desde timestamp específico (nanosegundos)
  sentinel poll --since 1234567890123456000

  # Desde timestamp específico (segundos Unix)
  sentinel poll --since 1234567890`,
			Args: cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				// Parsear --since-time si existe
				var finalTimestamp int64
				if sinceTime != "" {
					duration, err := time.ParseDuration(sinceTime)
					if err != nil {
						c.Logger.Error("Error parseando --since-time: %v", err)
						c.Logger.Info("Formato válido: 5m, 1h, 30s, etc.")
						os.Exit(1)
					}
					finalTimestamp = time.Now().Add(-duration).UnixNano()
				} else {
					finalTimestamp = sinceTimestamp
					// Convertir de segundos a nanosegundos si es necesario
					if finalTimestamp < 1e15 { // Probablemente en segundos
						finalTimestamp *= 1e9
					}
				}

				// Crear paths personalizado para eventbus
				eventbusPaths := *c.Paths
				eventbusPaths.LogsDir = filepath.Join(c.Paths.LogsDir, "sentinel", "eventbus")

				// Crear logger temporal
				logger, err := core.InitLogger(
					&eventbusPaths,
					"sentinel_event_bus",
					"🚌 SENTINEL EVENT BUS",
					2,
					&core.LoggerOptions{
						Categories:  []string{"sentinel"},
						Description: "Sentinel event bus log — tracks historical event polling from Brain",
						JSONMode:    c.IsJSON,
					},
				)
				if err != nil {
					fmt.Fprintf(os.Stderr, "[ERROR] No se pudo inicializar logger: %v\n", err)
					os.Exit(1)
				}
				defer logger.Close()

				// Crear cliente y conectar
				client := NewSentinelClient(brainAddr, logger)
				if err := client.Connect(); err != nil {
					logger.Error("Error conectando con Brain: %v", err)
					os.Exit(1)
				}
				defer client.Close()

				// Esperar conexión activa
				if err := client.WaitForConnection(5 * time.Second); err != nil {
					logger.Error("Timeout esperando conexión: %v", err)
					os.Exit(1)
				}

				logger.Info("Solicitando eventos desde: %s", 
					time.Unix(0, finalTimestamp).Format("2006-01-02 15:04:05"))

				// Solicitar eventos
				if err := client.PollEvents(finalTimestamp); err != nil {
					logger.Error("Error solicitando eventos: %v", err)
					os.Exit(1)
				}

				logger.Success("Solicitud enviada. Escuchando eventos...")

				// Contador de eventos recibidos
				eventCount := 0

				// Registrar handler temporal
				client.On("*", func(event Event) {
					eventCount++
					fmt.Fprintf(os.Stderr, "[%d] %s", eventCount, event.Type)
					if event.ProfileID != "" {
						fmt.Fprintf(os.Stderr, " (profile: %s)", event.ProfileID)
					}
					fmt.Fprintln(os.Stderr, "")
				})

				// Esperar 3 segundos para recibir eventos
				time.Sleep(3 * time.Second)

				if eventCount == 0 {
					logger.Info("No se recibieron eventos en el rango especificado")
				} else {
					logger.Success("Recibidos %d eventos", eventCount)
				}
			},
		}

		cmd.Flags().StringVar(&brainAddr, "brain-addr", "127.0.0.1:5678", 
			"Dirección TCP del Brain")
		cmd.Flags().Int64Var(&sinceTimestamp, "since", 0, 
			"Timestamp Unix (segundos o nanosegundos)")
		cmd.Flags().StringVar(&sinceTime, "since-time", "", 
			"Tiempo relativo (ej: 5m, 1h, 30s)")

		return cmd
	})
}

// Utilidad: contains verifica si una cadena contiene otra
func contains(haystack, needle string) bool {
	return len(needle) == 0 || 
		   (len(haystack) >= len(needle) && 
		    haystack[:len(needle)] == needle) ||
		   containsSubstring(haystack, needle)
}

func containsSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

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