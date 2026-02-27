// internal/runtime/engine.go

package runtime

import (
	"fmt"
	"os"
	"time"

	"bloom-sensor/internal/cmdregistry"
	"bloom-sensor/internal/core"
	"bloom-sensor/internal/input"
	"bloom-sensor/pkg/events"
	"github.com/spf13/cobra"
)

func nowUTC() time.Time { return time.Now().UTC() }

const defaultTickInterval = 60 * time.Second

type Engine struct {
	core         *core.Core
	tickInterval time.Duration
	loop         *Loop
}

func NewEngine(c *core.Core) *Engine {
	return &Engine{
		core:         c,
		tickInterval: defaultTickInterval,
	}
}

func (e *Engine) Run() {
	c := e.core
	c.Logger.Info("engine starting — channel=%s debug=%v", c.Config.Channel, c.Config.Debug)

	state := e.collectState()
	c.Buffer.Push(state)
	c.PublishHumanState(events.EventHumanSessionActive, state)
	c.Logger.Info("emitted %s seq=%d energy=%.2f idle=%ds",
		events.EventHumanSessionActive, state.Sequence, state.EnergyIndex, state.IdleSeconds)

	e.loop = NewLoop(c.Ctx, e.tickInterval, e.onTick)
	e.loop.Run()

	shutdown := e.collectState()
	c.PublishHumanState(events.EventHumanSessionLocked, shutdown)
	c.Logger.Info("emitted %s — engine stopped", events.EventHumanSessionLocked)
}

func (e *Engine) RunOnce() events.HumanState {
	state := e.collectState()
	e.core.Buffer.Push(state)
	e.core.PublishHumanState(events.EventHumanPresent, state)
	return state
}

func (e *Engine) onTick() {
	c := e.core
	state := e.collectState()
	c.Buffer.Push(state)

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
	*c.CurrentState = state
	return state
}

// ─── Comandos ────────────────────────────────────────────────────────────────

// RegisterCommands registra los comandos de runtime en el registry global.
func RegisterCommands(c *core.Core) {
	cmdregistry.Register(func() *cobra.Command { return newRunCommand(c) })
}

func newRunCommand(c *core.Core) *cobra.Command {
	var once bool
	var foreground bool
	var diagnostic bool

	cmd := &cobra.Command{
		Use:   "run",
		Short: "Start the human presence detection loop",
		Long: `Starts the persistent presence detection engine.

The engine runs a tick loop every 60 seconds, collecting:
  - Windows session state (active / locked)
  - Idle time via GetLastInputInfo
  - energy_index [0.0–1.0] computed deterministically

On start, emits HUMAN_SESSION_ACTIVE to Sentinel.
On stop (SIGINT / context cancel), emits HUMAN_SESSION_LOCKED.

Use --once for a single diagnostic tick.
Use --foreground to keep stdout open for debugging.
Use --diagnostic to print each tick with full metric detail.`,
		Annotations: map[string]string{
			"category": "RUNTIME",
			"json_response": `{
  "status": "running",
  "pid": 1234,
  "session": "active",
  "sentinel_connected": true
}`,
		},
		Example: `bloom-sensor run
bloom-sensor run --once
bloom-sensor run --diagnostic
bloom-sensor --json run --once`,
		RunE: func(cmd *cobra.Command, args []string) error {
			engine := NewEngine(c)
			if once {
				state := engine.RunOnce()
				if c.Config.OutputJSON {
					result := map[string]interface{}{
						"status":             "running",
						"pid":                os.Getpid(),
						"session":            map[bool]string{true: "active", false: "locked"}[state.SessionActive],
						"sentinel_connected": c.SentinelClient.IsConnected(),
					}
					return cmdregistry.PrintJSON(result)
				}
				fmt.Printf("tick: energy=%.2f idle=%ds session_active=%v seq=%d\n",
					state.EnergyIndex, state.IdleSeconds, state.SessionActive, state.Sequence)
				return nil
			}
			if c.Config.OutputJSON {
				result := map[string]interface{}{
					"status":             "running",
					"pid":                os.Getpid(),
					"session":            "active",
					"sentinel_connected": c.SentinelClient.IsConnected(),
				}
				cmdregistry.PrintJSON(result) //nolint:errcheck
			}
			_ = foreground
			_ = diagnostic
			engine.Run()
			return nil
		},
	}
	cmd.Flags().BoolVar(&once, "once", false, "Execute a single tick and exit (diagnostic mode)")
	cmd.Flags().BoolVar(&foreground, "foreground", false, "Keep stdout open (useful for debugging)")
	cmd.Flags().BoolVar(&diagnostic, "diagnostic", false, "Print each tick to stdout with full metric detail")
	return cmd
}