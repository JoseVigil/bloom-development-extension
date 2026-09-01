package workflows

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"nucleus/internal/orchestration/activities"
)

// CAMBIO (esta sesión): Paso 1 del plan de consolidación del action graph
// (Mandate_Genesis_ActionGraph_Plan_Ejecucion_v1.md) — MandateExecutionWorkflow
// deja de ser el placeholder puro que era. Alcance deliberadamente acotado:
// solo este archivo y mandate_genesis_build_workflow.go (para pasar
// ActionID/DomainID/MandatesRoot, ver abajo). NO se tocó
// mandate_genesis_sign_activity.go ni el shape de Action — mandate.json
// sigue siendo inmutable tras firma (R-1); los resultados de ejecución se
// persisten en mandate_state.json vía una Activity nueva
// (PersistExecutionResultActivity), nunca reescribiendo mandate.json.
type DomainAction struct {
	DomainName string
	// DomainID — CAMPO NUEVO esta sesión: Action.Payload.DomainID (el id
	// estable dom_{slug}_{sufijo}), copiado en mandate_genesis_build_workflow.go
	// al armar []DomainAction desde signResult.Actions. No se usaba antes
	// porque nada consumía DomainAction todavía.
	DomainID string
	// ActionID — CAMPO NUEVO esta sesión: Action.ActionID (UUIDv5
	// determinístico de mandate.json), copiado en el mismo lugar. Necesario
	// para invocar ScaffoldDomainActivity (que lo pide para correlación de
	// eventos) y para tener una clave estable al persistir resultados por
	// Action en mandate_state.json — DomainName solo no alcanza si dos
	// dominios comparten nombre.
	ActionID string
	Files    []string
	// D-3 (CERRADO sesión anterior): DomainName de otras Actions de las que
	// esta depende, ya resueltas por nombre de dominio. Vacío/nil = sin
	// dependencias.
	DependsOn []string
}

type MandateExecutionInput struct {
	MandateID string
	Project   string
	// MandatesRoot — CAMPO NUEVO esta sesión: requerido por
	// ScaffoldDomainActivity y PersistExecutionResultActivity para ubicar
	// {mandatesRoot}/{mandateID}/. mandate_genesis_build_workflow.go ya lo
	// tiene (input.MandatesRoot) y ahora lo pasa acá.
	MandatesRoot string
	Domains      []DomainAction
}

type MandateExecutionResult struct {
	Success bool
	// CompletedDomains — ahora refleja los dominios que realmente
	// terminaron el scaffold real, no un array vacío fijo.
	CompletedDomains []string
	// Error — poblado en fallo (dependencia irresoluble, scaffold real
	// fallido, o fallo al persistir el resultado). El workflow no propaga
	// esto como error de Go: MandateGenesisBuildWorkflow ya publica
	// execResult completo en el evento mandate:genesis:all_complete sin
	// importar su contenido (ver childFuture.Get en el padre) — el mismo
	// contrato soft-failure que ya sugería este campo antes de esta sesión.
	Error string
}

// topologicalLayers agrupa domains en capas ejecutables: cada capa son los
// dominios cuyas dependencias ya quedaron resueltas por capas anteriores.
// Con ≤7 dominios y sin ciclos por construcción (DependsOn se resuelve solo
// hacia dominios ya confirmados en la misma firma, nunca hacia sí mismos ni
// hacia afuera del batch), un Kahn simple alcanza — no hace falta un motor
// de grafos genérico para este volumen.
func topologicalLayers(domains []DomainAction) ([][]DomainAction, error) {
	byName := make(map[string]DomainAction, len(domains))
	inDegree := make(map[string]int, len(domains))
	dependents := make(map[string][]string, len(domains))
	for _, d := range domains {
		byName[d.DomainName] = d
		if _, ok := inDegree[d.DomainName]; !ok {
			inDegree[d.DomainName] = 0
		}
	}
	for _, d := range domains {
		for _, dep := range d.DependsOn {
			if _, ok := byName[dep]; !ok {
				// Dependencia hacia un dominio fuera de este batch de
				// Actions (ya resuelto en una ejecución previa, o fuera de
				// alcance) — no bloquea el orden de lo que sí tenemos acá.
				continue
			}
			inDegree[d.DomainName]++
			dependents[dep] = append(dependents[dep], d.DomainName)
		}
	}

	var ready []string
	for name, deg := range inDegree {
		if deg == 0 {
			ready = append(ready, name)
		}
	}

	var layers [][]DomainAction
	remaining := len(domains)
	for remaining > 0 {
		if len(ready) == 0 {
			return nil, fmt.Errorf("topologicalLayers: ciclo detectado o dependencia irresoluble (%d dominio(s) sin poder ordenar)", remaining)
		}
		layer := make([]DomainAction, 0, len(ready))
		var next []string
		for _, name := range ready {
			layer = append(layer, byName[name])
			remaining--
			for _, dependent := range dependents[name] {
				inDegree[dependent]--
				if inDegree[dependent] == 0 {
					next = append(next, dependent)
				}
			}
		}
		layers = append(layers, layer)
		ready = next
	}
	return layers, nil
}

// MandateExecutionWorkflow es la Fase 4 (ejecución real del mandate
// firmado). Ejecuta cada DomainAction respetando DependsOn: dominios sin
// dependencias entre sí, dentro de la misma capa, arrancan en paralelo
// (mismo criterio "parallel" que ya documentaba OperationalBlock.Workflow.Type
// en mandate_genesis_sign_activity.go); capas sucesivas esperan a que la
// anterior termine.
//
// Por cada dominio: invoca ScaffoldDomainActivity(Mode: real) y, con el
// resultado (éxito o fallo), invoca PersistExecutionResultActivity para
// dejarlo durable en mandate_state.json (phases.execute.actions[actionId])
// antes de seguir con la próxima capa. mandate.json NO se toca — sigue
// inmutable tras firma (R-1).
//
// Si un dominio falla, no se arrancan las capas siguientes (sus
// dependientes no tendrían sentido de ejecutar) — se devuelve
// Success: false con lo que sí completó hasta ahí en CompletedDomains.
func MandateExecutionWorkflow(ctx workflow.Context, input MandateExecutionInput) (MandateExecutionResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("MandateExecutionWorkflow: ejecución real arrancando", "mandateId", input.MandateID, "domains", len(input.Domains))

	// ActivityOptions no se hereda del padre a través del límite de child
	// workflow — hay que declararlo de nuevo acá, mismo criterio
	// (StartToCloseTimeout + reintentos) que ya usa MandateGenesisBuildWorkflow.
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	})

	layers, err := topologicalLayers(input.Domains)
	if err != nil {
		logger.Error("MandateExecutionWorkflow: no se pudo ordenar el action graph", "mandateId", input.MandateID, "error", err)
		return MandateExecutionResult{Success: false, CompletedDomains: []string{}, Error: err.Error()}, nil
	}

	completed := make([]string, 0, len(input.Domains))
	for _, layer := range layers {
		type inFlightScaffold struct {
			domain DomainAction
			future workflow.Future
		}

		inFlight := make([]inFlightScaffold, 0, len(layer))
		for _, domain := range layer {
			future := workflow.ExecuteActivity(ctx, activities.ScaffoldDomainActivity, activities.ScaffoldDomainInput{
				MandateID:    input.MandateID,
				ActionID:     domain.ActionID,
				DomainName:   domain.DomainName,
				Files:        domain.Files,
				Mode:         activities.ScaffoldModeReal,
				MandatesRoot: input.MandatesRoot,
			})
			inFlight = append(inFlight, inFlightScaffold{domain: domain, future: future})
		}

		for _, pending := range inFlight {
			domain := pending.domain
			var scaffoldResult activities.ScaffoldDomainResult
			scaffoldErr := pending.future.Get(ctx, &scaffoldResult)

			persistInput := activities.PersistExecutionResultInput{
				MandatesRoot: input.MandatesRoot,
				MandateID:    input.MandateID,
				ActionID:     domain.ActionID,
				DomainName:   domain.DomainName,
			}
			if scaffoldErr != nil {
				persistInput.Status = "failed"
				persistInput.Error = scaffoldErr.Error()
			} else {
				persistInput.Status = "completed"
				persistInput.ResultRef = scaffoldResult.ResultRef
			}

			if persistErr := workflow.ExecuteActivity(ctx, activities.PersistExecutionResultActivity, persistInput).Get(ctx, nil); persistErr != nil {
				if scaffoldErr != nil {
					return MandateExecutionResult{Success: false, CompletedDomains: completed, Error: fmt.Sprintf("dominio %s falló scaffold (%v) y no pude persistir el fallo: %v", domain.DomainName, scaffoldErr, persistErr)}, nil
				}
				return MandateExecutionResult{Success: false, CompletedDomains: completed, Error: fmt.Sprintf("dominio %s completó scaffold pero no pude persistir el resultado: %v", domain.DomainName, persistErr)}, nil
			}

			if scaffoldErr != nil {
				logger.Error("MandateExecutionWorkflow: dominio falló, no se arrancan capas dependientes", "mandateId", input.MandateID, "domain", domain.DomainName, "error", scaffoldErr)
				return MandateExecutionResult{Success: false, CompletedDomains: completed, Error: fmt.Sprintf("dominio %s: %v", domain.DomainName, scaffoldErr)}, nil
			}

			completed = append(completed, domain.DomainName)
		}
	}

	logger.Info("MandateExecutionWorkflow: ejecución real completa", "mandateId", input.MandateID, "completedDomains", len(completed))
	return MandateExecutionResult{Success: true, CompletedDomains: completed}, nil
}
