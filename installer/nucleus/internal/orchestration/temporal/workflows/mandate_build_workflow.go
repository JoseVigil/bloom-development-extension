// internal/orchestration/temporal/workflows/mandate_build_workflow.go
package workflows

import (
	"fmt"
	"path/filepath"
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

// MandateValidateSignal es el payload de la señal "mandate:build:validate".
type MandateValidateSignal struct {
	Approved bool                 `json:"approved"`
	Domains  []DomainConfirmation `json:"domains,omitempty"`
}

// MandateBuildInput es el único dueño de este shape — temporal_client.go y
// mandate_watcher.go lo referencian como workflows.MandateBuildInput, sin
// redeclararlo, para evitar el bug de "dos tipos con el mismo nombre en
// paquetes distintos" que rompía la serialización de Temporal.
//
// MandatesRoot: requerido por ScaffoldDomainActivity, SignMandateActivity,
// PersistHumanSyncActivity e IngestReceptionActivity. CORRECCIÓN sobre el
// comentario anterior ("sigue sin llegar poblado"): mandate_watcher.go
// (quien arma este struct al arrancar el workflow) ya lo puebla vía
// w.mandatesRoot — ver startBuildWorkflow, comentario "MandatesRoot —
// CAMPO NUEVO esta sesión (Tarea 1)". El gap quedó cerrado en un turno
// anterior; este comentario había quedado desactualizado.
type MandateBuildInput struct {
	MandateID     string
	MandateType   string
	BaseGenesisID string
	Source        string
	Project       string
	MandatesRoot  string
	// ProjectID — CAMPO NUEVO esta sesión (cowork nodo SESSION/MANDATE de
	// Gravity): ver MandateExecutionInput.ProjectID en
	// mandate_execution_workflow.go para la justificación completa. HOY
	// sin ningún productor real — ni mandate_watcher.go ni
	// temporal_client.go lo asignan al construir este input — llega vacío
	// en toda ejecución real hasta que un cowork futuro resuelva la
	// provisión de un ProjectID estable de Gravity. Declarado acá para que
	// el campo exista y quede listo para esa integración, sin inventar un
	// valor hoy.
	ProjectID string
}

// BuildPhaseOrder / BuildPhasesWithStatusSubobject — CAMBIO (esta
// sesión): generalización pedida por el usuario. activities.AdvancePhaseActivity
// (antes mandate_genesis_phase_activities.go, ahora mandate_phase_activities.go)
// dejó de conocer esta secuencia de memoria — es agnóstica de mandateType y
// la recibe como parámetro en cada llamada. Este archivo, que sigue siendo
// el orquestador específico de Genesis/domain_expansion (sin tocar su
// lógica de negocio, per alcance confirmado con el usuario), es el dueño
// natural de definir CUÁL es esa secuencia para este tipo de mandate.
// "signed" y "completed" no tienen su propio sub-objeto en phases{} (a
// diferencia de ingest/cluster/validate, que sí lo tienen desde
// initialBuildMandateState) — son valores de currentPhase nada más:
// "signed" refleja que signature.status ya es "signed" (persistSignatureSigned,
// mandate_genesis_sign_activity.go); "completed" refleja que
// MandateExecutionWorkflow (Fase 4) terminó con Success: true.
var BuildPhaseOrder = []string{"ingest", "cluster", "validate", "signed", "completed"}

var BuildPhasesWithStatusSubobject = map[string]bool{"ingest": true, "cluster": true, "validate": true}

// MandateBuildWorkflow orquesta: ingest → cluster → validate (Human
// Sync) → sign → execute (child workflow, Fase 4).
func MandateBuildWorkflow(ctx workflow.Context, input MandateBuildInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("MandateBuildWorkflow arrancado", "mandateId", input.MandateID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// ── Fase 1: ingest (.reception/ de un intent 'ing' real — ver
	// IngestReceptionActivity, mandate_genesis_activities.go) ─────────────
	// CAMBIO esta sesión: antes acá solo se publicaba el pulso
	// "mandate:phase:ingest" sin ningún trabajo real detrás (confirmado en
	// BLOOM_BISP_Session_Decisions_v1_1.md:330). El pulso se preserva
	// exactamente igual (mismo evento, mismo mandateId, misma posición en
	// la secuencia) — la UI de /genesis lo espera como marcador de fase
	// única sin progreso incremental — pero ahora se dispara DESPUÉS del
	// trabajo real, no en su lugar.
	var receptionResult activities.IngestReceptionResult
	if err := workflow.ExecuteActivity(ctx, activities.IngestReceptionActivity, activities.IngestReceptionInput{
		MandateID:    input.MandateID,
		MandateType:  input.MandateType,
		Project:      input.Project,
		MandatesRoot: input.MandatesRoot,
	}).Get(ctx, &receptionResult); err != nil {
		return fmt.Errorf("fase ingest: %w", err)
	}

	if err := workflow.ExecuteActivity(ctx, activities.PublishMandateEventActivity,
		"mandate:phase:ingest", map[string]interface{}{
			"mandateId": input.MandateID,
			// intentId/filesReceived — campos nuevos, aditivos: consumidores
			// existentes que solo leen mandateId no se rompen.
			"intentId":      receptionResult.IntentID,
			"filesReceived": receptionResult.FilesCount,
		},
	).Get(ctx, nil); err != nil {
		return fmt.Errorf("fase ingest, publicar evento: %w", err)
	}

	// CAMBIO (esta sesión, Paso 2 — activities.AdvancePhaseActivity,
	// internal/orchestration/activities/mandate_phase_activities.go): avanza
	// currentPhase de "ingest" a "cluster" y marca phases.ingest.status=
	// "completed" en la misma escritura atómica. Único escritor de
	// currentPhase/phases.*.status a partir de acá — ver comentario del
	// archivo para el porqué. PhaseOrder/PhasesWithStatusSubobject se pasan
	// explícitos (BuildPhaseOrder arriba) — la activity ya no los conoce.
	if err := workflow.ExecuteActivity(ctx, activities.AdvancePhaseActivity, activities.AdvancePhaseInput{
		MandatesRoot:              input.MandatesRoot,
		MandateID:                 input.MandateID,
		Phase:                     "ingest",
		PhaseOrder:                BuildPhaseOrder,
		PhasesWithStatusSubobject: BuildPhasesWithStatusSubobject,
	}).Get(ctx, nil); err != nil {
		return fmt.Errorf("fase ingest, avanzar currentPhase: %w", err)
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

	// CAMBIO (esta sesión, Paso 2): avanza currentPhase de "cluster" a
	// "validate" y marca phases.cluster.status="completed".
	if err := workflow.ExecuteActivity(ctx, activities.AdvancePhaseActivity, activities.AdvancePhaseInput{
		MandatesRoot:              input.MandatesRoot,
		MandateID:                 input.MandateID,
		Phase:                     "cluster",
		PhaseOrder:                BuildPhaseOrder,
		PhasesWithStatusSubobject: BuildPhasesWithStatusSubobject,
	}).Get(ctx, nil); err != nil {
		return fmt.Errorf("fase cluster, avanzar currentPhase: %w", err)
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
	var signal MandateValidateSignal
	signalCh := workflow.GetSignalChannel(ctx, "mandate:build:validate")
	signalCh.Receive(ctx, &signal)

	if !signal.Approved {
		logger.Info("Human Sync rechazó el mandate", "mandateId", input.MandateID)
		return workflow.ExecuteActivity(ctx, activities.PublishMandateEventActivity,
			"mandate:build:rejected", map[string]interface{}{"mandateId": input.MandateID},
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
	confirmedIDs := make([]string, 0, len(signal.Domains))
	for _, d := range signal.Domains {
		if d.Rename != "" || len(d.Files) != 0 {
			return fmt.Errorf("mandate %s: la señal no puede cambiar el dominio ni añadir Files al plan confirmado", input.MandateID)
		}
		confirmedIDs = append(confirmedIDs, d.ID)
	}

	// ── Persistir Human Sync en mandate_state.json (unifica CLI + señal) ──
	var humanSyncResult activities.PersistHumanSyncResult
	mandateDir := filepath.Join(input.MandatesRoot, input.MandateID)
	bloomRoot := filepath.Dir(filepath.Dir(input.MandatesRoot))
	receptionPath := filepath.Join(bloomRoot, ".intents", ".ing", receptionResult.FolderName, ".reception")
	receptionRef, relErr := filepath.Rel(mandateDir, receptionPath)
	if relErr != nil || filepath.IsAbs(receptionRef) {
		return fmt.Errorf("no pude construir artifact reception relativo para intent %s: %v", receptionResult.IntentID, relErr)
	}
	if err := workflow.ExecuteActivity(ctx, activities.PersistHumanSyncActivity, activities.PersistHumanSyncInput{
		MandatesRoot:       input.MandatesRoot,
		MandateID:          input.MandateID,
		CandidateDomains:   candidateDomains,
		ConfirmedDomainIds: confirmedIDs,
		// ConfirmedBy vacío por este path — ver nota D-9 en
		// PersistHumanSyncInput (mandate_genesis_sign_activity.go). No se
		// inventa un valor acá.
		ConfirmedBy:       "",
		IntentID:          receptionResult.IntentID,
		ReceptionRef:      filepath.ToSlash(receptionRef),
		DomainProposalRef: scaffoldResult.ResultRef,
	}).Get(ctx, &humanSyncResult); err != nil {
		return fmt.Errorf("fase validate, persistir human sync: %w", err)
	}
	// Signals only wake the workflow. The activity rereads and verifies the
	// persisted signed contract and Authority-backed act receipt.
	var approvalDigest string
	workflow.GetSignalChannel(ctx, "mandate:build:approve").Receive(ctx, &approvalDigest)
	var approved activities.MandateActVerificationResult
	if err := workflow.ExecuteActivity(ctx, "MandateActVerificationActivity", activities.MandateActVerificationInput{MandatesRoot: input.MandatesRoot, MandateID: input.MandateID, Operation: "approve", ExpectedDigest: approvalDigest}).Get(ctx, &approved); err != nil {
		return fmt.Errorf("approval verification: %w", err)
	}
	if err := workflow.ExecuteActivity(ctx, activities.AdvancePhaseActivity, activities.AdvancePhaseInput{MandatesRoot: input.MandatesRoot, MandateID: input.MandateID, Phase: "validate", PhaseOrder: BuildPhaseOrder, PhasesWithStatusSubobject: BuildPhasesWithStatusSubobject}).Get(ctx, nil); err != nil {
		return fmt.Errorf("approved phase transition: %w", err)
	}
	var activationDigest string
	workflow.GetSignalChannel(ctx, "mandate:build:activate").Receive(ctx, &activationDigest)
	var activated activities.MandateActVerificationResult
	if err := workflow.ExecuteActivity(ctx, "MandateActVerificationActivity", activities.MandateActVerificationInput{MandatesRoot: input.MandatesRoot, MandateID: input.MandateID, Operation: "activate", ExpectedDigest: activationDigest}).Get(ctx, &activated); err != nil {
		return fmt.Errorf("activation verification: %w", err)
	}
	if approved.ContractDigest != activated.ContractDigest {
		return fmt.Errorf("Mandate digest changed between approval and activation")
	}
	childCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{WorkflowID: "mandate_execution_" + input.MandateID})
	var result MandateExecutionResult
	if err := workflow.ExecuteChildWorkflow(childCtx, MandateExecutionWorkflow, MandateExecutionInput{MandateID: input.MandateID, MandatesRoot: input.MandatesRoot}).Get(childCtx, &result); err != nil {
		return fmt.Errorf("Mandate execution: %w", err)
	}
	if !result.Success || !result.Fulfilled {
		return fmt.Errorf("Mandate execution did not fulfill objective: %s", result.Error)
	}
	if err := workflow.ExecuteActivity(ctx, activities.AdvancePhaseActivity, activities.AdvancePhaseInput{MandatesRoot: input.MandatesRoot, MandateID: input.MandateID, Phase: "signed", PhaseOrder: BuildPhaseOrder, PhasesWithStatusSubobject: BuildPhasesWithStatusSubobject}).Get(ctx, nil); err != nil {
		return fmt.Errorf("fulfilled phase transition: %w", err)
	}
	return workflow.ExecuteActivity(ctx, activities.PublishMandateEventActivity, "mandate:build:all_complete", map[string]interface{}{"mandateId": input.MandateID, "contractDigest": activated.ContractDigest, "fulfilled": true}).Get(ctx, nil)
}
