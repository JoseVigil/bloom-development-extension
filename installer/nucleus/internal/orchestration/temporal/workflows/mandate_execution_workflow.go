package workflows

import "go.temporal.io/sdk/workflow"

// CAMBIO (esta sesión): D-3 cerrado. Se agrega DependsOn — ver nota en el
// campo. No se toca nada más de este archivo: MandateExecutionWorkflow
// sigue siendo el placeholder puro que ya era (P4 fuera de alcance de
// D-3/D-9, ver discrepancia ya documentada en el contrato §3.4.1).
type DomainAction struct {
	DomainName string
	Files      []string
	// D-3 (CERRADO esta sesión): DomainName de otras Actions de las que
	// esta depende, ya resueltas desde DomainCandidate.dependsOn
	// (domainId) a nombre de dominio por signMandateActivity al firmar
	// (ver mandate_genesis_activities.go). Vacío/nil = sin dependencias,
	// se ejecuta en paralelo con el resto — comportamiento histórico sin
	// cambios.
	//
	// MandateExecutionWorkflow (abajo) todavía NO lee este campo — sigue
	// siendo un placeholder que ignora su input. El día que deje de
	// serlo, debe esperar a que cada domainName en DependsOn complete
	// antes de arrancar el scaffold de esta Action. No se implementa esa
	// espera acá porque tocaría la lógica real de Fase 4, que es un
	// problema distinto (P4) al que D-3/D-9 resuelven.
	DependsOn []string
}

type MandateExecutionInput struct {
	MandateID string
	Project   string
	Domains   []DomainAction
}

type MandateExecutionResult struct {
	Success           bool
	CompletedDomains  []string
	Error             string
}

// MandateExecutionWorkflow es la Fase 4 (ejecución real del mandate firmado).
// TODO: esqueleto puro — falta la lógica real de "createStandardMandate" que
// mencionás como perdida en TypeScript. La agrego cuando me pases el resto de
// internal/mandates/ (mandate_hooks_cmd.go) para no
// duplicar tipos que ya puedan existir ahí (p. ej. si HookContext ya cubre
// parte de este contrato).
func MandateExecutionWorkflow(ctx workflow.Context, input MandateExecutionInput) (MandateExecutionResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("MandateExecutionWorkflow: placeholder — implementar Fase 4", "mandateId", input.MandateID)
	return MandateExecutionResult{Success: true, CompletedDomains: []string{}}, nil
}
