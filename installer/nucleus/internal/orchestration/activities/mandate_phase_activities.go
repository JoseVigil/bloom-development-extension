// internal/orchestration/activities/mandate_phase_activities.go
//
// CAMBIO (esta sesión): generalización pedida por el usuario — este archivo
// nació como mandate_genesis_phase_activities.go (Paso 2 del plan de
// consolidación del action graph, Mandate_Genesis_ActionGraph_Plan_Ejecucion_v1.md)
// con la secuencia de fases de Genesis/domain_expansion hardcodeada
// (genesisPhaseOrder). El roadmap v3.3 (docs/MANDATE/Mandate_Genesis_Truth_Matrix_and_Execution_Roadmap_v1.md,
// Decisión 1) recomienda justamente esto: reparar Genesis verticalmente CON
// una interfaz de executor reusable, sin construir todavía el motor
// genérico completo (Etapa 5, Action/ActionPayload — eso sigue fuera de
// alcance, ex-Paso 3). AdvancePhaseActivity ahora no sabe nada de
// "Genesis": el caller le pasa su propia secuencia de fases (PhaseOrder) y
// qué fases de esa secuencia tienen su propio sub-objeto en phases{}
// (PhasesWithStatusSubobject). El caso concreto de hoy (Genesis/
// domain_expansion) define esos dos valores en mandate_genesis_build_workflow.go
// (GenesisPhaseOrder / GenesisPhasesWithStatusSubobject) — cualquier otro
// tipo de mandate futuro define los suyos sin tocar este archivo.
//
// AdvancePhaseActivity sigue siendo el único escritor de
// currentPhase/phases.*.status después de la creación del mandate — sin
// importar qué tipo de mandate lo llame.
//
// CAMBIO (esta sesión): logging homologado con la telemetría de Nucleus.
// AdvancePhaseActivity ahora toma context.Context y usa activity.GetLogger(ctx)
// — mismo patrón que internal/mandates/mandate_activities.go. Sin stream de
// telemetría nuevo: enruta al stream "nucleus_temporal" ya registrado por
// core.InitTemporalLogger (ver mandate_execution_activities.go para el
// razonamiento completo).
package activities

import (
	"context"
	"fmt"
	"path/filepath"

	"go.temporal.io/sdk/activity"

	"nucleus/internal/orchestration/mandatestate"
)

// AdvancePhaseInput.Phase es la fase que ACABA de completarse, no la que
// arranca — Phase: "ingest" con PhaseOrder ["ingest","cluster",...] avanza
// currentPhase de "ingest" a "cluster" y marca phases.ingest.status =
// "completed" en la misma escritura atómica (si "ingest" está en
// PhasesWithStatusSubobject).
//
// PhaseOrder es la secuencia canónica y completa de currentPhase para el
// tipo de mandate que llama — esta activity no la conoce de antemano, la
// recibe siempre como parte del input.
//
// PhasesWithStatusSubobject marca qué fases de PhaseOrder tienen su propio
// sub-objeto en phases{} con su status:"completed" propio — no todas las
// fases de una secuencia lo tienen necesariamente (Genesis: "signed" y
// "completed" son solo valores de currentPhase, sin phases.signed{} ni
// phases.completed{}).
type AdvancePhaseInput struct {
	MandatesRoot              string
	MandateID                 string
	Phase                     string
	PhaseOrder                []string
	PhasesWithStatusSubobject map[string]bool
}

type AdvancePhaseResult struct {
	StateVersion uint64
}

func nextPhase(order []string, completedPhase string) (string, error) {
	for i, p := range order {
		if p == completedPhase {
			if i+1 >= len(order) {
				return "", fmt.Errorf("AdvancePhaseActivity: %q ya es la última fase de la secuencia %v", completedPhase, order)
			}
			return order[i+1], nil
		}
	}
	return "", fmt.Errorf("AdvancePhaseActivity: fase desconocida %q (secuencia válida: %v)", completedPhase, order)
}

// AdvancePhaseActivity avanza currentPhase un paso hacia adelante dentro de
// input.PhaseOrder (mandatestate.ValidateForwardOnly rechaza saltos y
// retrocesos, mismo criterio que ya usa signature.status) y, cuando la fase
// que completó está en input.PhasesWithStatusSubobject, marca
// phases.<phase>.status = "completed" en la misma escritura atómica vía
// mandatestate.Mutate. Idempotente: un retry de Temporal que ya encuentra
// currentPhase == next no vuelve a incrementar stateVersion.
func AdvancePhaseActivity(ctx context.Context, input AdvancePhaseInput) (AdvancePhaseResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("AdvancePhaseActivity started",
		"mandate_id", input.MandateID,
		"phase", input.Phase,
	)

	if input.MandatesRoot == "" || input.MandateID == "" {
		return AdvancePhaseResult{}, fmt.Errorf("AdvancePhaseActivity: MandatesRoot/MandateID vacíos")
	}
	if len(input.PhaseOrder) == 0 {
		return AdvancePhaseResult{}, fmt.Errorf("AdvancePhaseActivity: PhaseOrder vacío — el caller debe declarar su propia secuencia de fases")
	}
	next, err := nextPhase(input.PhaseOrder, input.Phase)
	if err != nil {
		return AdvancePhaseResult{}, err
	}

	path := filepath.Join(input.MandatesRoot, input.MandateID, "mandate_state.json")
	version, err := mandatestate.Mutate(path, func(state map[string]interface{}) (bool, error) {
		current, _ := state["currentPhase"].(string)
		if current == next {
			return false, nil
		}
		if err := mandatestate.ValidateForwardOnly(input.PhaseOrder, current, next); err != nil {
			return false, err
		}
		state["currentPhase"] = next

		if input.PhasesWithStatusSubobject[input.Phase] {
			phases, _ := state["phases"].(map[string]interface{})
			if phases == nil {
				phases = map[string]interface{}{}
				state["phases"] = phases
			}
			phaseRecord, _ := phases[input.Phase].(map[string]interface{})
			if phaseRecord == nil {
				phaseRecord = map[string]interface{}{}
			}
			phaseRecord["status"] = "completed"
			phases[input.Phase] = phaseRecord
		}
		return true, nil
	})
	if err != nil {
		logger.Error("AdvancePhaseActivity failed",
			"mandate_id", input.MandateID,
			"phase", input.Phase,
			"error", err,
		)
		return AdvancePhaseResult{}, fmt.Errorf("AdvancePhaseActivity: %w", err)
	}
	logger.Info("AdvancePhaseActivity completed",
		"mandate_id", input.MandateID,
		"phase", input.Phase,
		"next_phase", next,
		"state_version", version,
	)
	return AdvancePhaseResult{StateVersion: version}, nil
}
