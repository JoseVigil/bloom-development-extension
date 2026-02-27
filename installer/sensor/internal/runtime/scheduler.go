// internal/runtime/scheduler.go

package runtime

import (
	"context"
	"time"
)

// Task representa una tarea periódica con su intervalo.
type Task struct {
	Name     string
	Interval time.Duration
	Fn       func()
}

// Scheduler ejecuta tareas periódicas independientes del tick principal.
// Útil para emisiones con frecuencias distintas (ej: heartbeat cada 5min).
type Scheduler struct {
	ctx   context.Context
	tasks []Task
}

// NewScheduler crea un Scheduler ligado al contexto dado.
func NewScheduler(ctx context.Context) *Scheduler {
	return &Scheduler{ctx: ctx}
}

// Add registra una tarea periódica.
func (s *Scheduler) Add(name string, interval time.Duration, fn func()) {
	s.tasks = append(s.tasks, Task{Name: name, Interval: interval, Fn: fn})
}

// Start arranca todas las tareas en goroutines independientes.
// Retorna inmediatamente. Las goroutines se detienen cuando el contexto se cancela.
func (s *Scheduler) Start() {
	for _, task := range s.tasks {
		t := task // captura para la goroutine
		go func() {
			ticker := time.NewTicker(t.Interval)
			defer ticker.Stop()
			for {
				select {
				case <-s.ctx.Done():
					return
				case <-ticker.C:
					t.Fn()
				}
			}
		}()
	}
}
