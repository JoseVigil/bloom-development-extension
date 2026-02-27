// internal/runtime/loop.go

package runtime

import (
	"context"
	"time"
)

// Loop implementa el tick loop principal de Sensor.
// Usa context.Context para garantizar shutdown limpio.
// El Engine nunca entra en un for sin select + ctx.Done().
type Loop struct {
	ctx      context.Context
	interval time.Duration
	onTick   func()
}

// NewLoop crea un Loop con el intervalo y callback dados.
func NewLoop(ctx context.Context, interval time.Duration, onTick func()) *Loop {
	return &Loop{
		ctx:      ctx,
		interval: interval,
		onTick:   onTick,
	}
}

// Run ejecuta el loop hasta que el contexto sea cancelado.
// Bloquea al llamador — debe correrse en la goroutine principal del engine.
func (l *Loop) Run() {
	ticker := time.NewTicker(l.interval)
	defer ticker.Stop()

	for {
		select {
		case <-l.ctx.Done():
			return
		case <-ticker.C:
			l.onTick()
		}
	}
}
