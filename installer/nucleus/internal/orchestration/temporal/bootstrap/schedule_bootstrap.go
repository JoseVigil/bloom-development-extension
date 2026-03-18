package bootstrap

import (
	"context"
	"strings"
	"time"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/temporal"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	temporalworkflows "nucleus/internal/orchestration/temporal/workflows"
)

const SystemHealthScheduleID = "nucleus-system-health-schedule"

// EnsureSystemHealthSchedule crea o actualiza el Schedule de health check.
//
// Es idempotente y tolerante a reinicios del worker:
//   - Si el schedule no existe → lo crea con el intervalo indicado.
//   - Si ya existe → lo actualiza con el nuevo intervalo (no-op si no cambió).
//   - Nunca retorna error si el schedule ya existe — el worker lo adopta.
func EnsureSystemHealthSchedule(ctx context.Context, c client.Client, intervalSeconds int) error {
	if intervalSeconds <= 0 {
		intervalSeconds = 60
	}
	interval := time.Duration(intervalSeconds) * time.Second

	spec := client.ScheduleSpec{
		Intervals: []client.ScheduleIntervalSpec{
			{Every: interval},
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
		if !isAlreadyExists(err) {
			return err
		}
		// Schedule ya existe — actualizar el intervalo para que refleje settings.json
		existing := c.ScheduleClient().GetHandle(ctx, SystemHealthScheduleID)
		return existing.Update(ctx, client.ScheduleUpdateOptions{
			DoUpdate: func(input client.ScheduleUpdateInput) (*client.ScheduleUpdate, error) {
				input.Description.Schedule.Spec = &spec
				return &client.ScheduleUpdate{Schedule: &input.Description.Schedule}, nil
			},
		})
	}

	_ = handle
	return nil
}

// isAlreadyExists detecta el error de schedule ya existente.
// Temporal puede devolver el error como gRPC AlreadyExists o como mensaje de texto.
func isAlreadyExists(err error) bool {
	if err == nil {
		return false
	}
	// Chequeo por código gRPC (más robusto)
	if s, ok := status.FromError(err); ok {
		if s.Code() == codes.AlreadyExists {
			return true
		}
	}
	// Fallback por string matching
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "already exists") ||
		strings.Contains(msg, "already_exists")
}