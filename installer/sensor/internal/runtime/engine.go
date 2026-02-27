// internal/runtime/engine.go

package runtime

import (
	"time"

	"bloom-sensor/internal/core"
	"bloom-sensor/internal/input"
	"bloom-sensor/pkg/events"
)

func nowUTC() time.Time { return time.Now().UTC() }

const defaultTickInterval = 60 * time.Second

// Engine orquesta el loop principal de Sensor.
// Es el único componente que conoce el tick interval y coordina
// la recolección de métricas, el ring buffer y la publicación a Sentinel.
type Engine struct {
	core         *core.Core
	tickInterval time.Duration
	loop         *Loop
}

// NewEngine crea un Engine con el tick interval por defecto.
func NewEngine(c *core.Core) *Engine {
	return &Engine{
		core:         c,
		tickInterval: defaultTickInterval,
	}
}

// Run arranca el engine. Bloquea hasta que el contexto del Core sea cancelado.
// Emite HUMAN_SESSION_ACTIVE al arrancar y HUMAN_SESSION_LOCKED al detenerse.
func (e *Engine) Run() {
	c := e.core
	c.Logger.Info("engine starting — channel=%s debug=%v", c.Config.Channel, c.Config.Debug)

	// Registrar stream de log en Nucleus telemetry (no-fatal)
	// El logger ya lo hace en background desde New(), no es necesario repetirlo aquí.

	// Emitir evento de arranque
	state := e.collectState()
	c.Buffer.Push(state)
	c.PublishHumanState(events.EventHumanSessionActive, state)
	c.Logger.Info("emitted %s seq=%d energy=%.2f idle=%ds",
		events.EventHumanSessionActive, state.Sequence, state.EnergyIndex, state.IdleSeconds)

	// Crear y arrancar el loop
	e.loop = NewLoop(c.Ctx, e.tickInterval, e.onTick)
	e.loop.Run()

	// Loop terminó — emitir evento de cierre
	shutdown := e.collectState()
	c.PublishHumanState(events.EventHumanSessionLocked, shutdown)
	c.Logger.Info("emitted %s — engine stopped", events.EventHumanSessionLocked)
}

// RunOnce ejecuta un único tick y retorna. Útil para diagnóstico (--once flag).
func (e *Engine) RunOnce() events.HumanState {
	state := e.collectState()
	e.core.Buffer.Push(state)
	e.core.PublishHumanState(events.EventHumanPresent, state)
	return state
}

// onTick es llamado por el Loop en cada tick.
func (e *Engine) onTick() {
	c := e.core
	state := e.collectState()

	c.Buffer.Push(state)

	// Determinar tipo de evento según estado
	eventType := events.EventHumanPresent
	switch {
	case !state.SessionActive:
		eventType = events.EventHumanSessionLocked
	case state.IdleSeconds > 30*60:
		eventType = events.EventHumanIdle
	case state.IdleSeconds > 60*60:
		eventType = events.EventHumanAbsent
	}

	c.PublishHumanState(eventType, state)
	c.Logger.Info("tick seq=%d event=%s energy=%.2f idle=%ds",
		state.Sequence, eventType, state.EnergyIndex, state.IdleSeconds)
}

// collectState recopila todas las métricas del momento actual.
func (e *Engine) collectState() events.HumanState {
	c := e.core

	seq := c.Sequence.Add(1)
	sessionActive := c.SessionManager.IsSessionActive()
	idleSeconds := input.IdleSeconds()
	energy := c.MetricsEngine.ComputeEnergyIndex(idleSeconds, sessionActive)

	state := events.HumanState{
		Timestamp:     nowUTC(),
		SessionActive: sessionActive,
		SessionLocked: !sessionActive,
		IdleSeconds:   idleSeconds,
		EnergyIndex:   energy,
		Sequence:      seq,
	}

	// Actualizar el estado actual en el Core
	*c.CurrentState = state
	return state
}


