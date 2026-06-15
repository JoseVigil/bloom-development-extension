// internal/core/core.go

package core

import (
	"context"
	"fmt"
	"sync/atomic"
	"time"

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

// PublishCognitiveStateChanged publica un evento de cambio de estado cognitivo
// a Sentinel en una goroutine separada. Nunca bloquea.
func (c *Core) PublishCognitiveStateChanged(evt events.CognitiveStateChangedEvent) {
	go func() {
		if err := c.SentinelClient.PublishCognitiveState(evt); err != nil {
			c.Logger.Debug("sentinel cognitive publish skipped: %v", err)
		}
	}()
}

// ComputeMandateHCU computa la HumanCognitiveUnit para un mandato dado,
// usando todos los snapshots disponibles en el ring buffer.
//
// Si nucleusPath != "" se usa como anotación de contexto (correlación con Nucleus).
// La función no lee archivos externos — nucleusPath es metadata, no una lectura.
//
// Retorna error si no hay suficientes snapshots para computar (< 3 muestras activas).
func (c *Core) ComputeMandateHCU(mandateID string, nucleusPath string) (*events.HumanCognitiveUnit, error) {
	snapshots := c.Buffer.Last(1440) // ventana máxima: 24h
	if len(snapshots) == 0 {
		return nil, fmt.Errorf("ring buffer vacío — no hay snapshots para computar HCU")
	}

	// Contar activos antes de calcular focus
	activeCount := 0
	for _, s := range snapshots {
		if s.SessionActive {
			activeCount++
		}
	}
	if activeCount < 3 {
		return nil, fmt.Errorf("snapshots activos insuficientes (%d) — se requieren al menos 3", activeCount)
	}

	// Métricas base
	var sumEnergy float64
	flowMins, focusedMins, fatiguedMins := 0, 0, 0
	stateCounts := make(map[events.CognitiveState]int)

	for _, s := range snapshots {
		sumEnergy += s.EnergyIndex
		stateCounts[s.CognitiveState]++
		switch s.CognitiveState {
		case events.CognitiveStateFlow:
			flowMins++
		case events.CognitiveStateFocused:
			focusedMins++
		case events.CognitiveStateFatigued:
			fatiguedMins++
		}
	}

	avgEnergy := sumEnergy / float64(len(snapshots))
	focusScore := c.MetricsEngine.ComputeFocusScore(snapshots)

	// Estado dominante
	var dominantState events.CognitiveState
	var dominantCount int
	for state, count := range stateCounts {
		if count > dominantCount {
			dominantCount = count
			dominantState = state
		}
	}
	if dominantState == "" {
		dominantState = events.CognitiveStateUnknown
	}

	// HCU = combinación ponderada: 60% focus, 40% energy
	hcuValue := (focusScore * 0.6) + (avgEnergy * 0.4)

	windowStart := snapshots[0].Timestamp
	windowEnd := snapshots[len(snapshots)-1].Timestamp

	return &events.HumanCognitiveUnit{
		MandateID:       mandateID,
		ComputedAt:      time.Now().UTC(),
		WindowStart:     windowStart,
		WindowEnd:       windowEnd,
		Samples:         len(snapshots),
		AvgEnergyIndex:  avgEnergy,
		AvgFocusScore:   focusScore,
		HCUValue:        hcuValue,
		DominantState:   dominantState,
		FlowMinutes:     flowMins,
		FocusedMinutes:  focusedMins,
		FatiguedMinutes: fatiguedMins,
		NucleusPath:     nucleusPath,
	}, nil
}

// Shutdown cancela el contexto raíz y cierra recursos.
func (c *Core) Shutdown() {
	c.Cancel()
	c.SentinelClient.Close()
	c.Logger.Close()
}
