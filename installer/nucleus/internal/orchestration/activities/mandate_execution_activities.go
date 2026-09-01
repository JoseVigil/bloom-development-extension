// internal/orchestration/activities/mandate_execution_activities.go
//
// CAMBIO (esta sesión): Paso 1 del plan de consolidación del action graph
// (Mandate_Genesis_ActionGraph_Plan_Ejecucion_v1.md). Archivo nuevo,
// deliberadamente separado de mandate_genesis_sign_activity.go — ese
// archivo no se toca en este paso (mandate.json inmutable tras firma,
// R-1). PersistExecutionResultActivity persiste el resultado de ejecutar
// una Action (Fase 4) en mandate_state.json, nunca en mandate.json.
//
// CAMBIO (esta sesión): logging homologado con la telemetría de Nucleus.
// PersistExecutionResultActivity ahora toma context.Context y usa
// activity.GetLogger(ctx) — mismo patrón que internal/mandates/mandate_activities.go
// (logger.Info "<Activity> started"/"completed" con pares clave-valor). No
// hace falta registrar un stream de telemetría nuevo: activity.GetLogger
// enruta a través del logger que el worker de Temporal ya tiene configurado
// (core.InitTemporalLogger, wireado una sola vez en temporal_client.go),
// que ya escribe al stream "nucleus_temporal" existente — no hay ningún
// output persistente nuevo que registrar vía `nucleus telemetry register`
// (BLOOM_NUCLEUS_LOGGING_SPEC.md: eso aplica a streams/archivos NUEVOS, no
// a líneas de log dentro de un stream ya registrado). El resto de las
// activities de la familia Genesis en este mismo paquete (ScaffoldDomainActivity,
// IngestReceptionActivity, SignMandateActivity, etc.) no toman ctx ni
// loguean — eso es un gap preexistente, fuera de alcance de esta sesión.
package activities

import (
	"context"
	"fmt"
	"path/filepath"
	"reflect"

	"go.temporal.io/sdk/activity"

	"nucleus/internal/orchestration/mandatestate"
)

// PersistExecutionResultInput es el input de PersistExecutionResultActivity.
// ActionID identifica la Action (mandate.json); si viene vacío (fixtures de
// test que no lo poblaron) se usa DomainName como fallback para la clave —
// ver executionResultKey.
type PersistExecutionResultInput struct {
	MandatesRoot string
	MandateID    string
	ActionID     string
	DomainName   string
	ResultRef    string
	Status       string // "completed" | "failed"
	Error        string
}

type PersistExecutionResultResult struct {
	StateVersion uint64
}

func executionResultKey(input PersistExecutionResultInput) string {
	if input.ActionID != "" {
		return input.ActionID
	}
	return input.DomainName
}

// PersistExecutionResultActivity deja durable, en
// {mandatesRoot}/{mandateID}/mandate_state.json, el resultado de ejecutar
// una Action de Fase 4 — bajo phases.execute.actions[actionId]. Reusa
// mandatestate.Mutate (mismo mecanismo que PersistHumanSyncActivity /
// PersistSignatureFailureActivity), así que queda serializado contra
// escrituras concurrentes y versionado igual que el resto de
// mandate_state.json. Idempotente: un retry de Temporal que ya encuentra
// el mismo resultado escrito no vuelve a incrementar stateVersion.
func PersistExecutionResultActivity(ctx context.Context, input PersistExecutionResultInput) (PersistExecutionResultResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("PersistExecutionResultActivity started",
		"mandate_id", input.MandateID,
		"action_id", input.ActionID,
		"domain_name", input.DomainName,
		"status", input.Status,
	)

	if input.MandatesRoot == "" || input.MandateID == "" {
		return PersistExecutionResultResult{}, fmt.Errorf("PersistExecutionResultActivity: MandatesRoot/MandateID vacíos")
	}
	key := executionResultKey(input)
	if key == "" {
		return PersistExecutionResultResult{}, fmt.Errorf("PersistExecutionResultActivity: ActionID y DomainName vacíos, no hay clave para persistir")
	}

	path := filepath.Join(input.MandatesRoot, input.MandateID, "mandate_state.json")
	version, err := mandatestate.Mutate(path, func(state map[string]interface{}) (bool, error) {
		phases, _ := state["phases"].(map[string]interface{})
		if phases == nil {
			phases = map[string]interface{}{}
			state["phases"] = phases
		}
		execute, _ := phases["execute"].(map[string]interface{})
		if execute == nil {
			execute = map[string]interface{}{}
			phases["execute"] = execute
		}
		actionsRecord, _ := execute["actions"].(map[string]interface{})
		if actionsRecord == nil {
			actionsRecord = map[string]interface{}{}
			execute["actions"] = actionsRecord
		}

		record := map[string]interface{}{
			"domainName": input.DomainName,
			"status":     input.Status,
		}
		if input.ResultRef != "" {
			record["resultRef"] = input.ResultRef
		}
		if input.Error != "" {
			record["error"] = input.Error
		}

		if existing, ok := actionsRecord[key]; ok && reflect.DeepEqual(existing, record) {
			return false, nil
		}
		actionsRecord[key] = record
		return true, nil
	})
	if err != nil {
		logger.Error("PersistExecutionResultActivity failed",
			"mandate_id", input.MandateID,
			"key", key,
			"error", err,
		)
		return PersistExecutionResultResult{}, fmt.Errorf("PersistExecutionResultActivity: %w", err)
	}
	logger.Info("PersistExecutionResultActivity completed",
		"mandate_id", input.MandateID,
		"key", key,
		"state_version", version,
	)
	return PersistExecutionResultResult{StateVersion: version}, nil
}
