// internal/orchestration/temporal/workflows/mandate_genesis_build_workflow.go
package workflows

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"nucleus/internal/orchestration/activities"
)

// ─────────────────────────────────────────────────────────────────────────
// CORRECCIÓN D-B1 esta sesión (reemplaza el diseño del turno anterior, no
// lo completa): Backend Design §0 dice explícito que Fase 4 (scaffold) se
// ejecuta con el MandateExecutionWorkflow que YA EXISTE para `mandate run`
// — no con una llamada directa a ScaffoldDomainActivity(Mode: real) desde
// el workflow padre. El turno anterior violaba esto: tenía un loop acá
// mismo llamando la activity dominio por dominio, y por eso
// SignMandateActivity (todo D-3/D-9) quedaba huérfana, sin nadie que la
// llame, y mandate.json nunca se escribía en la práctica.
//
// Flujo corregido:
//   1. Fase 2 (dry_run) devuelve los dominios propuestos directo en el
//      resultado de la activity (Workflow no puede leer archivos él
//      mismo — determinismo de Temporal).
//   2. Al llegar la señal de validate con Approved=true, se persiste la
//      confirmación en mandate_state.json vía PersistHumanSyncActivity —
//      el MISMO archivo y el MISMO shape que ya escribe
//      mandate_genesis_domains_cmd.go por el path CLI. Esto resuelve la
//      pregunta abierta del turno anterior ("dos vías de confirmación sin
//      reconciliar"): la señal de Temporal ahora alimenta el mismo
//      mandate_state.json, sin importar por qué vía llegó la confirmación.
//   3. Se llama SignMandateActivity, que lee ESE archivo y escribe
//      mandate.json firmado con operational.actions[] (dependsOn
//      resuelto, D-3).
//   4. El resultado de la firma (Actions, ya con dependsOn traducido) se
//      pasa al child MandateExecutionWorkflow — es ESE workflow quien,
//      cuando P4 se implemente de verdad, debe llamar
//      ScaffoldDomainActivity(Mode: real) por cada Action. No se
//      implementa esa lógica interna acá — sigue siendo P4, fuera de
//      este alcance, tal como se pidió.
// ─────────────────────────────────────────────────────────────────────────

// DomainConfirmation es un elemento confirmado por el usuario en el Human
// Sync Point. ID es el id opaco estable que trajo domain_proposal.json
// (dom_{slug}_{sufijo} — ver newDomainID en mandate_genesis_activities.go).
// DomainName es el nombre que vino en la propuesta original — necesario
// porque el id ya no es legible ni derivable del nombre. Rename es el
// nuevo nombre si el usuario lo cambió al confirmar — vacío significa "sin
// cambio".
type DomainConfirmation struct {
	ID         string   `json:"id"`
	DomainName string   `json:"domainName"`
	Rename     string   `json:"rename,omitempty"`
	Files      []string `json:"files,omitempty"`
}

// GenesisValidateSignal es el payload de la señal "mandate:genesis:validate".
type GenesisValidateSignal struct {
	Approved bool                  `json:"approved"`
	Domains  []DomainConfirmation  `json:"domains,omitempty"`
}

// GenesisBuildInput es el único dueño de este shape — temporal_client.go y
// mandate_watcher.go lo referencian como workflows.GenesisBuildInput, sin
// redeclararlo, para evitar el bug de "dos tipos con el mismo nombre en
// paquetes distintos" que rompía la serialización de Temporal.
//
// MandatesRoot: requerido por ScaffoldDomainActivity, SignMandateActivity
// y PersistHumanSyncActivity. SIGUE SIN LLEGAR POBLADO — temporal_client.go
// y mandate_watcher.go (quienes arman este struct al arrancar el workflow)
// no fueron actualizados en esta sesión porque no los tengo. Con esta
// corrección se vuelve más urgente que antes: ahora tres activities lo
// necesitan, no una.
type GenesisBuildInput struct {
	MandateID     string
	MandateType   string
	BaseGenesisID string
	Source        string
	Project       string
	MandatesRoot  string
}

// MandateGenesisBuildWorkflow orquesta: ingest → cluster → validate (Human
// Sync) → sign → execute (child workflow, Fase 4).
func MandateGenesisBuildWorkflow(ctx workflow.Context, input GenesisBuildInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("MandateGenesisBuildWorkflow arrancado", "mandateId", input.MandateID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// ── Fase 1: ingest ──────────────────────────────────────────────────
	if err := workflow.ExecuteActivity(ctx, activities.PublishMandateEventActivity,
		"mandate:phase:ingest", map[string]interface{}{"mandateId": input.MandateID},
	).Get(ctx, nil); err != nil {
		return fmt.Errorf("fase ingest: %w", err)
	}

	// ── Fase 2: cluster (dry_run — solo domain_proposal.json, NO .scaffold/) ──
	var scaffoldResult activities.ScaffoldDomainResult
	if err := workflow.ExecuteActivity(ctx, activities.ScaffoldDomainActivity, activities.ScaffoldDomainInput{
		MandateID:    input.MandateID,
		ActionID:     "cluster",
		DomainName:   input.Project,
		Mode:         activities.ScaffoldModeDryRun,
		MandatesRoot: input.MandatesRoot,
	}).Get(ctx, &scaffoldResult); err != nil {
		return fmt.Errorf("fase cluster: %w", err)
	}

	// candidateDomains para persistir en mandate_state.json más adelante —
	// traducción pura ProposedDomain -> DomainCandidateState (mismo id,
	// mismo nombre; Files no es parte de DomainCandidateState, se
	// preserva del lado de la señal más abajo en cambio; DependsOn queda
	// vacío porque no hay clustering real que lo produzca hoy).
	candidateDomains := make([]activities.DomainCandidateState, 0, len(scaffoldResult.Domains))
	for _, pd := range scaffoldResult.Domains {
		candidateDomains = append(candidateDomains, activities.DomainCandidateState{
			DomainID:             pd.ID,
			Name:                 pd.DomainName,
			CohesionScore:        pd.CohesionScore,
			SuggestedActionCount: pd.SuggestedActionCount,
		})
	}

	// ── Fase 3: validate (Human Sync Point) ──────────────────────────────
	// Espera indefinidamente una señal externa que confirme el resultado
	// del clustering antes de avanzar a la ejecución real. No lleva
	// timeout: es intencional, un humano puede tardar horas en revisar.
	var signal GenesisValidateSignal
	signalCh := workflow.GetSignalChannel(ctx, "mandate:genesis:validate")
	signalCh.Receive(ctx, &signal)

	if !signal.Approved {
		logger.Info("Human Sync rechazó el mandate", "mandateId", input.MandateID)
		return workflow.ExecuteActivity(ctx, activities.PublishMandateEventActivity,
			"mandate:genesis:rejected", map[string]interface{}{"mandateId": input.MandateID},
		).Get(ctx, nil)
	}

	if len(signal.Domains) == 0 {
		// Approved=true sin dominios es un payload inconsistente — no lo
		// tratamos como "0 dominios confirmados válido" (el rango de
		// Brain es 2–7, nunca 0 en ningún diseño visto). Falla explícito
		// en vez de seguir con una firma vacía silenciosa.
		return fmt.Errorf("mandate %s: señal de validate aprobada sin domains — payload inconsistente", input.MandateID)
	}

	// Aplicar renames sobre candidateDomains ANTES de persistir — si no se
	// hace acá, SignMandateActivity arma actionId a partir del nombre
	// viejo (cand.Name), ignorando el rename que el usuario acaba de
	// confirmar. "El rename se aplica en el mismo acto de confirm" (mismo
	// criterio que ya usa mandate_genesis_domains_cmd.go del lado CLI).
	renameByID := make(map[string]string, len(signal.Domains))
	confirmedIDs := make([]string, 0, len(signal.Domains))
	for _, d := range signal.Domains {
		confirmedIDs = append(confirmedIDs, d.ID)
		if d.Rename != "" {
			renameByID[d.ID] = d.Rename
		}
	}
	for i := range candidateDomains {
		if newName, ok := renameByID[candidateDomains[i].DomainID]; ok {
			candidateDomains[i].Name = newName
		}
	}

	// ── Persistir Human Sync en mandate_state.json (unifica CLI + señal) ──
	if err := workflow.ExecuteActivity(ctx, activities.PersistHumanSyncActivity, activities.PersistHumanSyncInput{
		MandatesRoot:       input.MandatesRoot,
		MandateID:          input.MandateID,
		CandidateDomains:   candidateDomains,
		ConfirmedDomainIds: confirmedIDs,
		// ConfirmedBy vacío por este path — ver nota D-9 en
		// PersistHumanSyncInput (mandate_genesis_sign_activity.go). No se
		// inventa un valor acá.
		ConfirmedBy: "",
	}).Get(ctx, nil); err != nil {
		return fmt.Errorf("fase validate, persistir human sync: %w", err)
	}

	// ── Firmar: produce mandate.json con operational.actions[] (D-3) ──────
	var signResult activities.SignMandateResult
	if err := workflow.ExecuteActivity(ctx, activities.SignMandateActivity,
		input.MandatesRoot, input.MandateID,
	).Get(ctx, &signResult); err != nil {
		return fmt.Errorf("fase sign: %w", err)
	}

	// Traducir Action[] (mandate.json, dependsOn en actionIds) a
	// []DomainAction (input del child, dependsOn en domainNames) — mismo
	// mapeo que ya se documentó como pendiente en mandate_execution_workflow.go,
	// ahora resuelto acá porque ya tenemos las Actions reales, no una lista
	// armada a mano.
	nameByActionID := make(map[string]string, len(signResult.Actions))
	for _, a := range signResult.Actions {
		nameByActionID[a.ActionID] = a.DomainName
	}
	filesByID := make(map[string][]string, len(signal.Domains))
	for _, d := range signal.Domains {
		filesByID[d.ID] = d.Files
	}
	domains := make([]DomainAction, 0, len(signResult.Actions))
	for _, a := range signResult.Actions {
		deps := make([]string, 0, len(a.DependsOn))
		for _, depActionID := range a.DependsOn {
			if n, ok := nameByActionID[depActionID]; ok {
				deps = append(deps, n)
			}
		}
		domains = append(domains, DomainAction{
			DomainName: a.DomainName,
			Files:      filesByID[a.Payload.DomainID],
			DependsOn:  deps,
		})
	}

	// ── execute (child workflow) ─────────────────────────────────────────
	// MandateExecutionWorkflow sigue siendo un placeholder puro (ver
	// mandate_execution_workflow.go) — este cambio ya le pasa las Actions
	// firmadas, traducidas a DomainAction con DependsOn resuelto, en vez
	// de un array armado a mano en el padre o de un loop de scaffold real
	// ejecutado acá (eso violaba D-B1, corregido en este turno). La
	// lógica interna de ejecución real (createStandardMandate,
	// ScaffoldDomainActivity(Mode: real) por Action) sigue sin
	// implementarse: es P4, fuera de este alcance.
	childOpts := workflow.ChildWorkflowOptions{
		WorkflowID: fmt.Sprintf("mandate_execution_%s", input.MandateID),
		TaskQueue:  "mandate-orchestration",
	}
	childCtx := workflow.WithChildOptions(ctx, childOpts)

	var execResult MandateExecutionResult
	err := workflow.ExecuteChildWorkflow(childCtx, MandateExecutionWorkflow, MandateExecutionInput{
		MandateID: input.MandateID,
		Project:   input.Project,
		Domains:   domains,
	}).Get(ctx, &execResult)
	if err != nil {
		return fmt.Errorf("fase execute: %w", err)
	}

	return workflow.ExecuteActivity(ctx, activities.PublishMandateEventActivity,
		"mandate:genesis:all_complete", map[string]interface{}{
			"mandateId": input.MandateID,
			"result":    execResult,
		},
	).Get(ctx, nil)
}
