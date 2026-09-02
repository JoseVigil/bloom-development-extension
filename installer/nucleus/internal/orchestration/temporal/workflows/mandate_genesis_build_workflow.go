// internal/orchestration/temporal/workflows/mandate_genesis_build_workflow.go
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

// GenesisValidateSignal es el payload de la señal "mandate:genesis:validate".
type GenesisValidateSignal struct {
	Approved bool                 `json:"approved"`
	Domains  []DomainConfirmation `json:"domains,omitempty"`
}

// GenesisBuildInput es el único dueño de este shape — temporal_client.go y
// mandate_watcher.go lo referencian como workflows.GenesisBuildInput, sin
// redeclararlo, para evitar el bug de "dos tipos con el mismo nombre en
// paquetes distintos" que rompía la serialización de Temporal.
//
// MandatesRoot: requerido por ScaffoldDomainActivity, SignMandateActivity,
// PersistHumanSyncActivity e IngestReceptionActivity. CORRECCIÓN sobre el
// comentario anterior ("sigue sin llegar poblado"): mandate_watcher.go
// (quien arma este struct al arrancar el workflow) ya lo puebla vía
// w.mandatesRoot — ver startGenesisWorkflow, comentario "MandatesRoot —
// CAMPO NUEVO esta sesión (Tarea 1)". El gap quedó cerrado en un turno
// anterior; este comentario había quedado desactualizado.
type GenesisBuildInput struct {
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

// GenesisPhaseOrder / GenesisPhasesWithStatusSubobject — CAMBIO (esta
// sesión): generalización pedida por el usuario. activities.AdvancePhaseActivity
// (antes mandate_genesis_phase_activities.go, ahora mandate_phase_activities.go)
// dejó de conocer esta secuencia de memoria — es agnóstica de mandateType y
// la recibe como parámetro en cada llamada. Este archivo, que sigue siendo
// el orquestador específico de Genesis/domain_expansion (sin tocar su
// lógica de negocio, per alcance confirmado con el usuario), es el dueño
// natural de definir CUÁL es esa secuencia para este tipo de mandate.
// "signed" y "completed" no tienen su propio sub-objeto en phases{} (a
// diferencia de ingest/cluster/validate, que sí lo tienen desde
// initialGenesisMandateState) — son valores de currentPhase nada más:
// "signed" refleja que signature.status ya es "signed" (persistSignatureSigned,
// mandate_genesis_sign_activity.go); "completed" refleja que
// MandateExecutionWorkflow (Fase 4) terminó con Success: true.
var GenesisPhaseOrder = []string{"ingest", "cluster", "validate", "signed", "completed"}

var GenesisPhasesWithStatusSubobject = map[string]bool{"ingest": true, "cluster": true, "validate": true}

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
	// explícitos (GenesisPhaseOrder arriba) — la activity ya no los conoce.
	if err := workflow.ExecuteActivity(ctx, activities.AdvancePhaseActivity, activities.AdvancePhaseInput{
		MandatesRoot:              input.MandatesRoot,
		MandateID:                 input.MandateID,
		Phase:                     "ingest",
		PhaseOrder:                GenesisPhaseOrder,
		PhasesWithStatusSubobject: GenesisPhasesWithStatusSubobject,
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
		PhaseOrder:                GenesisPhaseOrder,
		PhasesWithStatusSubobject: GenesisPhasesWithStatusSubobject,
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

	// ── Firmar: produce mandate.json con operational.actions[] (D-3) ──────
	var signResult activities.SignMandateResult
	if err := workflow.ExecuteActivity(ctx, activities.SignMandateActivity,
		input.MandatesRoot, input.MandateID,
	).Get(ctx, &signResult); err != nil {
		var failureResult activities.PersistSignatureFailureResult
		failureErr := workflow.ExecuteActivity(ctx, activities.PersistSignatureFailureActivity,
			activities.PersistSignatureFailureInput{
				MandatesRoot: input.MandatesRoot,
				MandateID:    input.MandateID,
				Message:      err.Error(),
				FailureType:  "SignMandateActivity",
			},
		).Get(ctx, &failureResult)
		if failureErr != nil {
			return fmt.Errorf("fase sign agotó reintentos (%v) y no pudo persistir signature=failed: %w", err, failureErr)
		}
		if publishErr := workflow.ExecuteActivity(ctx, activities.PublishMandateEventActivity,
			"mandate:genesis:error", map[string]interface{}{
				"mandateId": input.MandateID,
				"phase":     "sign",
				"error":     err.Error(),
				"resumable": true,
			},
		).Get(ctx, nil); publishErr != nil {
			return fmt.Errorf("fase sign falló (%v); signature=failed durable pero no pude publicar evento: %w", err, publishErr)
		}
		return fmt.Errorf("fase sign: %w", err)
	}
	_ = humanSyncResult

	// CAMBIO (esta sesión, Paso 2): avanza currentPhase de "validate" a
	// "signed" y marca phases.validate.status="completed". Se dispara acá,
	// después de que SignMandateActivity ya firmó con éxito (no antes,
	// dentro de PersistHumanSyncActivity) porque firmar es lo que
	// efectivamente cierra la fase validate — humanSync por sí solo es
	// solo la confirmación, no el cierre de fase.
	if err := workflow.ExecuteActivity(ctx, activities.AdvancePhaseActivity, activities.AdvancePhaseInput{
		MandatesRoot:              input.MandatesRoot,
		MandateID:                 input.MandateID,
		Phase:                     "validate",
		PhaseOrder:                GenesisPhaseOrder,
		PhasesWithStatusSubobject: GenesisPhasesWithStatusSubobject,
	}).Get(ctx, nil); err != nil {
		return fmt.Errorf("fase sign, avanzar currentPhase: %w", err)
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
			DomainID:   a.Payload.DomainID,
			ActionID:   a.ActionID,
			Files:      filesByID[a.Payload.DomainID],
			DependsOn:  deps,
		})
	}

	// IntentType — CAMPO NUEVO esta sesión (cowork nodo SESSION/MANDATE de
	// Gravity): un solo valor por corrida (decisión ratificada, checkpoint
	// §3), tomado de signResult.Actions[].IntentType — ya estampado por
	// SignMandateActivity (mandate_genesis_sign_activity.go:262) igual
	// para todas las Actions de un Mandate. Se valida esa uniformidad acá,
	// no se asume: si alguna vez dejara de serlo, esto debe fallar cerrado
	// en vez de elegir una al azar — no hay hoy un IntentType por Domain
	// (appliesTo filtra por IntentType, nunca por Domain/Gene, resolver.go:56).
	intentType := ""
	for i, a := range signResult.Actions {
		if i == 0 {
			intentType = a.IntentType
			continue
		}
		if a.IntentType != intentType {
			return fmt.Errorf(
				"mandate %s: Actions firmadas con IntentType inconsistente (%q vs %q) — no hay un único valor de Gravity IntentType para esta corrida",
				input.MandateID, intentType, a.IntentType,
			)
		}
	}
	if intentType == "" {
		return fmt.Errorf("mandate %s: signResult.Actions no trae IntentType — no puedo resolver Gravity activa sin él", input.MandateID)
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
	childFuture := workflow.ExecuteChildWorkflow(childCtx, MandateExecutionWorkflow, MandateExecutionInput{
		MandateID:    input.MandateID,
		Project:      input.Project,
		MandatesRoot: input.MandatesRoot,
		Domains:      domains,
		ProjectID:    input.ProjectID,
		IntentType:   intentType,
	})

	if err := workflow.ExecuteActivity(ctx, activities.PublishMandateEventActivity,
		"mandate:genesis:signed", map[string]interface{}{
			"mandateId":        input.MandateID,
			"domainsConfirmed": len(confirmedIDs),
			"actionsCreated":   signResult.ActionsCreated,
			"signedAt":         signResult.SignedAt,
			"workflowId":       childOpts.WorkflowID,
		},
	).Get(ctx, nil); err != nil {
		return fmt.Errorf("firma durable, publicar evento signed: %w", err)
	}

	err := childFuture.Get(ctx, &execResult)
	if err != nil {
		return fmt.Errorf("fase execute: %w", err)
	}

	// CAMBIO (esta sesión, Paso 2): currentPhase solo llega a "completed"
	// cuando MandateExecutionWorkflow (Paso 1) reporta Success:true —
	// decisión confirmada explícitamente con el usuario (no automático solo
	// porque el child workflow haya retornado sin error de Temporal;
	// recordar que MandateExecutionResult usa el patrón de soft-failure:
	// falla por contenido de Success/Error, no por error de Go). Si
	// Success:false, currentPhase se queda en "signed" — el mandate no se
	// marca completo, y el evento all_complete de abajo igual se publica
	// con el resultado real para que la UI pueda mostrar el fallo.
	if execResult.Success {
		if err := workflow.ExecuteActivity(ctx, activities.AdvancePhaseActivity, activities.AdvancePhaseInput{
			MandatesRoot:              input.MandatesRoot,
			MandateID:                 input.MandateID,
			Phase:                     "signed",
			PhaseOrder:                GenesisPhaseOrder,
			PhasesWithStatusSubobject: GenesisPhasesWithStatusSubobject,
		}).Get(ctx, nil); err != nil {
			return fmt.Errorf("fase execute, avanzar currentPhase a completed: %w", err)
		}
	}

	return workflow.ExecuteActivity(ctx, activities.PublishMandateEventActivity,
		"mandate:genesis:all_complete", map[string]interface{}{
			"mandateId": input.MandateID,
			"result":    execResult,
		},
	).Get(ctx, nil)
}
