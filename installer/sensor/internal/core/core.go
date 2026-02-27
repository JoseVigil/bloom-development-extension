// internal/core/core.go

package core

import (
	"context"
	"sync/atomic"

	"bloom-sensor/internal/logger"
	"bloom-sensor/internal/metrics"
	"bloom-sensor/internal/session"
	"bloom-sensor/internal/transport"
	"bloom-sensor/pkg/events"
)

// Config agrupa los parámetros de configuración de Sensor.
type Config struct {
	Debug      bool
	Channel    string // "stable" | "beta"
	ConfigPath string
	OutputJSON bool // Para comandos CLI con --json flag
}

// Core es el núcleo fisiológico de Sensor.
// No es un centro administrativo — es un runtime continuo orientado a presencia.
//
// Regla de oro: el Core nunca bloquea por dependencias externas.
// Si Sentinel no está disponible → arranca igual.
// Si la sesión no puede detectarse → arranca igual.
// Degradación elegante siempre.
type Core struct {
	// Infraestructura
	Logger *logger.Logger
	Config *Config

	// Runtime
	SentinelClient *transport.Client
	SessionManager *session.Manager
	MetricsEngine  *metrics.Engine
	Buffer         *metrics.RingBuffer

	// Estado vivo
	CurrentState *events.HumanState
	Sequence     atomic.Uint64

	// Control del ciclo de vida
	Ctx    context.Context
	Cancel context.CancelFunc
}

// NewCore construye e inicializa el Core con todos sus componentes.
// El contexto raíz se crea aquí y se propaga al engine.
func NewCore(cfg *Config) *Core {
	ctx, cancel := context.WithCancel(context.Background())
	return &Core{
		Logger:         logger.New(cfg.Debug),
		Config:         cfg,
		SentinelClient: transport.NewClient(),
		SessionManager: session.NewManager(),
		MetricsEngine:  metrics.NewEngine(),
		Buffer:         metrics.NewRingBuffer(0), // usa capacidad default (1440)
		CurrentState:   &events.HumanState{},
		Ctx:            ctx,
		Cancel:         cancel,
	}
}

// PublishHumanState publica un evento a Sentinel en una goroutine separada.
// Nunca bloquea. Si Sentinel no está disponible, el error se descarta silenciosamente.
func (c *Core) PublishHumanState(eventType string, state events.HumanState) {
	go func() {
		evt := events.NewEvent(eventType, state)
		if err := c.SentinelClient.Publish(evt); err != nil {
			c.Logger.Debug("sentinel publish skipped: %v", err)
		}
	}()
}

// Shutdown cancela el contexto raíz y cierra recursos.
func (c *Core) Shutdown() {
	c.Cancel()
	c.SentinelClient.Close()
	c.Logger.Close()
}
