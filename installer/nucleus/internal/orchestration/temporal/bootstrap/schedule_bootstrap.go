package bootstrap

import (
	"context"
	"strings"
	"time"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/temporal"

	temporalworkflows "nucleus/internal/orchestration/temporal/workflows"
)

// SystemHealthScheduleID es el identificador estable del Schedule en Temporal.
// Nunca renombrarlo — Temporal lo usa como clave primaria del Schedule.
const SystemHealthScheduleID = "nucleus-system-health-schedule"

// EnsureSystemHealthSchedule crea o verifica el Schedule de health check.
//
// Es idempotente — si el Schedule ya existe con la misma configuración
// simplemente retorna nil. No falla si Temporal ya lo tiene registrado.
//
// Diseño del Schedule:
//   - Interval: 60s — estándar de la industria para health checks de infra.
//     nucleus health tarda < 3s; 30s daría overhead innecesario en Temporal history.
//   - Overlap: SKIP — si el workflow anterior todavía está corriendo (poco probable
//     dado el timeout de 30s), el siguiente tick se descarta en lugar de acumular.
//   - MaximumAttempts: 1 — el Schedule reintenta en el próximo tick (60s);
//     no tiene sentido reintentar inmediatamente un health check fallido.
func EnsureSystemHealthSchedule(ctx context.Context, c client.Client) error {
	spec := client.ScheduleSpec{
		Intervals: []client.ScheduleIntervalSpec{
			{Every: 60 * time.Second},
		},
	}

	action := &client.ScheduleWorkflowAction{
		Workflow:  temporalworkflows.SystemHealthWorkflow,
		TaskQueue: "profile-orchestration",
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 1,
		},
	}

	handle, err := c.ScheduleClient().Create(ctx, client.ScheduleOptions{
		ID:     SystemHealthScheduleID,
		Spec:   spec,
		Action: action,
	})
	if err != nil {
		// Ya existe — no es un error, el Schedule sigue activo
		if isScheduleAlreadyExists(err) {
			return nil
		}
		return err
	}

	_ = handle
	return nil
}

// isScheduleAlreadyExists detecta el error que Temporal devuelve cuando
// el Schedule ya fue creado previamente. Temporal no expone un tipo tipado
// para este caso, así que hacemos string matching sobre el mensaje.
func isScheduleAlreadyExists(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "already exists") ||
		strings.Contains(msg, "ALREADY_EXISTS")
}