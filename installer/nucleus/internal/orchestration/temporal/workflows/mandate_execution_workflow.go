package workflows

import "go.temporal.io/sdk/workflow"

type DomainAction struct {
	DomainName string
	Files      []string
}

type MandateExecutionInput struct {
	MandateID string
	Project   string
	Domains   []DomainAction
}

type MandateExecutionResult struct {
	Success       bool
	CompletedDomains []string
	Error         string
}

// MandateExecutionWorkflow es la Fase 4 (ejecución real del mandate firmado).
// TODO: esqueleto puro — falta la lógica real de "createStandardMandate" que
// mencionás como perdida en TypeScript. La agrego cuando me pases el resto de
// internal/mandates/ (mandate_hooks_cmd.go, mandate_types.go) para no
// duplicar tipos que ya puedan existir ahí (p. ej. si HookContext ya cubre
// parte de este contrato).
func MandateExecutionWorkflow(ctx workflow.Context, input MandateExecutionInput) (MandateExecutionResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("MandateExecutionWorkflow: placeholder — implementar Fase 4", "mandateId", input.MandateID)
	return MandateExecutionResult{Success: true, CompletedDomains: []string{}}, nil
}