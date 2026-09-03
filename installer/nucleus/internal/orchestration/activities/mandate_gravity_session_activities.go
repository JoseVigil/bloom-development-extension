// internal/orchestration/activities/mandate_gravity_session_activities.go
//
// Nuevo (cowork nodo SESSION/MANDATE de Gravity, 2026-09-02): cierra dos
// gaps registrados en
// docs/ANAYSIS/GRAVITY/SESSION/Investigacion_Gravity_SessionNode_MandateGenesis_v0_1.md
// (G.1, G.2) y en su handoff
// (Gravity_SESSION_MandateGenesis_Handoff_Investigacion_v0_1.md §5): quién
// crea el nodo Gravity MANDATE y cuándo, y cómo se modela el nodo SESSION
// — decisión ya ratificada: SESSION = una invocación completa de
// MandateExecutionWorkflow, nunca un DomainAction.
//
// Alcance deliberadamente acotado — lo que este archivo NO hace:
//
//   - No crea ORGANIZATION ni NUCLEUS. Store.CreateNode ya los bloquea por
//     diseño (store.go:62-64, ErrGovernedNodeCreation — gobernado por
//     cor+Authorization, no wireado todavía). Si el nodo no existe, estas
//     Activities fallan cerrado — nunca intentan crearlo ni rodear el
//     bloqueo.
//
//   - No crea PROJECT. No existe en todo el repo ningún concepto de
//     ProjectID estable — `Project` es siempre un nombre libre (ver
//     commands/mandate.go: "Nombre del proyecto (requerido)"), y
//     GravityNode no tiene campo de nombre para poder ubicar un PROJECT a
//     partir de un nombre. Inventar acá un esquema de slug determinístico
//     arriesgaría colisionar dos proyectos con nombres distintos que
//     normalizan igual — una decisión de gobernanza que este cowork no
//     toma en silencio. EnsureGravityMandateNodeActivity exige un
//     ProjectID ya resuelto y falla cerrado si no lo recibe o si no
//     encuentra un nodo PROJECT real con ese id. Hoy, en todo el
//     pipeline, nada produce un ProjectID real — gap explícito, señalado
//     en el checkpoint de este cowork, no resuelto acá.
//
//   - No modifica internal/gravity/resolver.go, model.go ni store.go. Los
//     paths que arma acá (.organization/{id}/.project/{id}/.mandate/{id}/
//     y .../.session/{id}/) son un espejo deliberado de la convención que
//     ya usan Store.readSpine (resolver.go:122-149) y Store.ResolveActive
//     (resolver.go:41, path de SESSION) — confirmado contra
//     resolver_test.go:20-45 (createResolutionTree), no una reinvención.
//
// Logging (turno de homologación con
// docs/TELEMETRY/BLOOM_NUCLEUS_LOGGING_SPEC.md): estas tres Activities
// corren dentro del mismo proceso continuo del worker de Temporal y ya
// escriben, vía activity.GetLogger(ctx), al stream nucleus_temporal
// existente (registrado en telemetry.json, category "nucleus", source
// "nucleus") — por la regla de la spec "mismo proceso continuo → un solo
// stream", no se registra un stream nuevo. Cada línea lleva el prefijo
// "[GRAVITY]" más los campos estructurados disponibles en cada input
// (mandate_id/session_id/project_id/turn, según cuál de los tres) para
// poder filtrar los eventos de este trabajo dentro de ese stream
// compartido sin tocar telemetry.json ni internal/core/logger.go.
package activities

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"time"

	"go.temporal.io/sdk/activity"

	authoritydecision "nucleus/internal/governance/decision"
	"nucleus/internal/gravity"
	"nucleus/internal/orchestration/mandatestate"
)

// nucleusGovernanceOrgIdentity es el subconjunto mínimo de
// governance.Blueprint/OrgIdentity (governance/blueprint.go:16-28) que
// hace falta leer acá. No se importa el paquete governance:
// governance/org_switch_guard.go:47 ya importa
// nucleus/internal/orchestration/temporal, que a su vez importa este
// paquete (orchestration/activities) — importar governance desde acá
// cerraría un ciclo. Se duplica solo la forma mínima del JSON, mismo
// criterio que ya usa este paquete para resolveNucleusRootFromMandatesRoot
// (evitar acoplar paquetes por una sola derivación de un campo).
type nucleusGovernanceOrgIdentity struct {
	OrgIdentity struct {
		OrgID string `json:"org_id"`
	} `json:"org_identity"`
}

// readOrganizationID lee .nucleus-governance.json bajo nucleusRoot y
// devuelve org_identity.org_id — la identidad real y ya existente de la
// única organización de este nucleusRoot (arquitectura single-org,
// core/org_context.go). No crea nada: ORGANIZATION es un nodo gobernado
// que estas Activities nunca producen.
func readOrganizationID(nucleusRoot string) (string, error) {
	path := filepath.Join(nucleusRoot, ".nucleus-governance.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("no pude leer %s: %w", path, err)
	}
	var doc nucleusGovernanceOrgIdentity
	if err := json.Unmarshal(raw, &doc); err != nil {
		return "", fmt.Errorf("%s inválido: %w", path, err)
	}
	if doc.OrgIdentity.OrgID == "" {
		return "", fmt.Errorf("%s no tiene org_identity.org_id", path)
	}
	return doc.OrgIdentity.OrgID, nil
}

// readOrCreateNode intenta leer el nodo en path; si no existe, lo crea vía
// store.CreateNode. Si CreateNode falla porque otro retry de Temporal ya
// lo creó en el medio (carrera real, no un error de negocio), vuelve a
// leerlo una vez más antes de rendirse. Esto es lo que hace a las
// Activities de este archivo idempotentes ante la entrega
// at-least-once de Temporal: un retry que encuentra el nodo ya creado lo
// reusa, nunca lo duplica ni falla. Nunca sobrescribe un nodo existente —
// la validación de que el nodo reusado tiene la identidad esperada
// (nodeId/parentId) la hace cada caller, porque el shape esperado es
// distinto en cada uno (MANDATE vs SESSION).
func readOrCreateNode(store *gravity.Store, path string, wanted gravity.GravityNode) (gravity.GravityNode, bool, error) {
	existing, err := store.ReadNode(path)
	if err == nil {
		return existing, false, nil
	}
	if !os.IsNotExist(err) {
		return gravity.GravityNode{}, false, err
	}
	if createErr := store.CreateNode(path, wanted); createErr != nil {
		reread, rereadErr := store.ReadNode(path)
		if rereadErr != nil {
			return gravity.GravityNode{}, false, fmt.Errorf("CreateNode falló (%v) y no pude releer %s: %w", createErr, path, rereadErr)
		}
		// CreateNode falló pero el nodo ahora existe: otro retry ganó la
		// carrera entre nuestro ReadNode y nuestro CreateNode. Idempotente,
		// no un error.
		return reread, false, nil
	}
	created, err := store.ReadNode(path)
	if err != nil {
		return gravity.GravityNode{}, false, fmt.Errorf("nodo creado en %s pero no pude releerlo: %w", path, err)
	}
	return created, true, nil
}

// ─────────────────────────────────────────────────────────────────────────
// EnsureGravityMandateNodeActivity
// ─────────────────────────────────────────────────────────────────────────

type EnsureGravityMandateNodeInput struct {
	MandatesRoot string
	MandateID    string
	// ProjectID — ver comentario de archivo: hoy sin productor real en
	// ningún caller de MandateExecutionWorkflow. Obligatorio: falla
	// cerrado si viene vacío o si no hay un nodo PROJECT real con ese id.
	ProjectID string
}

type EnsureGravityMandateNodeResult struct {
	NucleusRoot     string
	OrganizationID  string
	MandateNodePath string
	Created         bool
}

// EnsureGravityMandateNodeActivity garantiza (idempotente ante retry) que
// exista un nodo Gravity MANDATE cuyo NodeID sea exactamente
// input.MandateID — requisito mecánico de Store.buildSpine
// (resolver.go:90: busca node.NodeID == mandateID caminando .gravity/), no
// una elección de estilo.
//
// Verifica primero, de raíz hacia abajo, que ORGANIZATION y PROJECT
// existan y tengan la identidad esperada — fail-closed si no: esta
// Activity nunca crea ORGANIZATION/PROJECT (ver comentario de archivo) ni
// parchea una espina inconsistente.
func EnsureGravityMandateNodeActivity(ctx context.Context, input EnsureGravityMandateNodeInput) (EnsureGravityMandateNodeResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("[GRAVITY] EnsureGravityMandateNodeActivity started", "mandate_id", input.MandateID, "project_id", input.ProjectID)

	if input.MandatesRoot == "" || input.MandateID == "" {
		return EnsureGravityMandateNodeResult{}, fmt.Errorf("EnsureGravityMandateNodeActivity: MandatesRoot/MandateID vacíos")
	}
	if input.ProjectID == "" {
		return EnsureGravityMandateNodeResult{}, errors.New(
			"EnsureGravityMandateNodeActivity: ProjectID vacío — la provisión de un nodo PROJECT de Gravity (identidad estable, creación) queda fuera de este cowork (gap registrado); no se infiere de Project (nombre libre)",
		)
	}

	nucleusRoot := resolveNucleusRootFromMandatesRoot(input.MandatesRoot)

	orgID, err := readOrganizationID(nucleusRoot)
	if err != nil {
		return EnsureGravityMandateNodeResult{}, fmt.Errorf("EnsureGravityMandateNodeActivity: ORGANIZATION no identificable: %w", err)
	}

	store, err := gravity.NewStore(nucleusRoot)
	if err != nil {
		return EnsureGravityMandateNodeResult{}, fmt.Errorf("EnsureGravityMandateNodeActivity: %w", err)
	}

	orgPath := filepath.Join(store.Root, ".organization", orgID, "node.json")
	orgNode, err := store.ReadNode(orgPath)
	if err != nil {
		return EnsureGravityMandateNodeResult{}, fmt.Errorf(
			"EnsureGravityMandateNodeActivity: ORGANIZATION %s no existe en %s (su creación es gobernada, fuera de este cowork): %w",
			orgID, orgPath, err,
		)
	}
	if orgNode.NodeType != gravity.NodeOrganization || orgNode.NodeID != orgID {
		return EnsureGravityMandateNodeResult{}, fmt.Errorf(
			"EnsureGravityMandateNodeActivity: nodo en %s no es la ORGANIZATION %s esperada (nodeType=%s nodeId=%s)",
			orgPath, orgID, orgNode.NodeType, orgNode.NodeID,
		)
	}

	projPath := filepath.Join(filepath.Dir(orgPath), ".project", input.ProjectID, "node.json")
	projNode, err := store.ReadNode(projPath)
	projectCreated := false
	if os.IsNotExist(err) {
		observedVersion := orgNode.NodeVersion
		decision, authErr := authoritydecision.AuthorizeGravityNodeCreation(authoritydecision.OpCreateProject, input.ProjectID, &orgID, &observedVersion)
		if authErr != nil {
			logger.Error("[GRAVITY] PROJECT creation denied", "project_id", input.ProjectID, "organization_id", orgID, "error", authErr)
			return EnsureGravityMandateNodeResult{}, fmt.Errorf("EnsureGravityMandateNodeActivity: PROJECT creation denied: %w", authErr)
		}
		wantedProject := gravity.GravityNode{NodeID: input.ProjectID, NodeType: gravity.NodeProject, ParentID: &orgID, GravityPostures: []gravity.GravityPosture{}, Status: gravity.NodeActive, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano)}
		if createErr := store.CreateGovernedNode(decision, wantedProject); createErr != nil {
			projNode, err = store.ReadNode(projPath)
			if err != nil {
				logger.Error("[GRAVITY] PROJECT creation failed", "project_id", input.ProjectID, "organization_id", orgID, "error", createErr)
				return EnsureGravityMandateNodeResult{}, fmt.Errorf("EnsureGravityMandateNodeActivity: create PROJECT: %w", createErr)
			}
		} else {
			projectCreated = true
			projNode, err = store.ReadNode(projPath)
		}
	} else if err != nil {
		return EnsureGravityMandateNodeResult{}, fmt.Errorf("EnsureGravityMandateNodeActivity: read PROJECT: %w", err)
	}
	if err != nil || projNode.NodeType != gravity.NodeProject || projNode.NodeID != input.ProjectID || projNode.Status != gravity.NodeActive || projNode.ParentID == nil || *projNode.ParentID != orgID {
		logger.Error("[GRAVITY] PROJECT incompatible", "project_id", input.ProjectID, "organization_id", orgID)
		return EnsureGravityMandateNodeResult{}, fmt.Errorf(
			"EnsureGravityMandateNodeActivity: nodo en %s no es el PROJECT %s esperado bajo ORGANIZATION %s (nodeType=%s nodeId=%s parentId=%v)",
			projPath, input.ProjectID, orgID, projNode.NodeType, projNode.NodeID, projNode.ParentID,
		)
	}
	logger.Info("[GRAVITY] PROJECT ready", "project_id", input.ProjectID, "organization_id", orgID, "created", projectCreated, "parent_observed_version", orgNode.NodeVersion)

	mandatePath := filepath.Join(filepath.Dir(projPath), ".mandate", input.MandateID, "node.json")
	projectID := input.ProjectID
	wanted := gravity.GravityNode{
		NodeID:          input.MandateID,
		NodeType:        gravity.NodeMandate,
		ParentID:        &projectID,
		GravityPostures: []gravity.GravityPosture{},
		Status:          gravity.NodeActive,
		CreatedAt:       time.Now().UTC().Format(time.RFC3339Nano),
	}
	mandateNode, created, err := readOrCreateNode(store, mandatePath, wanted)
	if err != nil {
		return EnsureGravityMandateNodeResult{}, fmt.Errorf("EnsureGravityMandateNodeActivity: %w", err)
	}
	if mandateNode.NodeType != gravity.NodeMandate || mandateNode.NodeID != input.MandateID ||
		mandateNode.ParentID == nil || *mandateNode.ParentID != input.ProjectID {
		return EnsureGravityMandateNodeResult{}, fmt.Errorf(
			"EnsureGravityMandateNodeActivity: MANDATE existente en %s no coincide (nodeId=%s parentId=%v, esperaba nodeId=%s parentId=%s) — espina inconsistente",
			mandatePath, mandateNode.NodeID, mandateNode.ParentID, input.MandateID, input.ProjectID,
		)
	}

	logger.Info("[GRAVITY] EnsureGravityMandateNodeActivity completed", "mandate_id", input.MandateID, "project_id", input.ProjectID, "created", created)
	return EnsureGravityMandateNodeResult{
		NucleusRoot:     nucleusRoot,
		OrganizationID:  orgID,
		MandateNodePath: mandatePath,
		Created:         created,
	}, nil
}

// ─────────────────────────────────────────────────────────────────────────
// CreateGravitySessionActivity
// ─────────────────────────────────────────────────────────────────────────

type CreateGravitySessionInput struct {
	NucleusRoot string
	// MandateNodePath — el path exacto devuelto por
	// EnsureGravityMandateNodeActivity.MandateNodePath. Se pasa así, en
	// vez de recomputar OrganizationID/ProjectID acá, para no duplicar la
	// lectura de .nucleus-governance.json ni la validación de espina: si
	// el MANDATE ya fue garantizado, esta Activity solo necesita saber
	// dónde vive su node.json.
	MandateNodePath string
	MandateID       string
	SessionID       string
}

type CreateGravitySessionResult struct {
	SessionNodePath string
	Created         bool
}

// CreateGravitySessionActivity crea (idempotente ante retry) el nodo
// SESSION hijo del MANDATE ya garantizado. Decisión ratificada: un nodo
// SESSION = una invocación completa de MandateExecutionWorkflow — nunca un
// DomainAction (checkpoint de este cowork, §2; investigación original
// docs/ANAYSIS/GRAVITY/SESSION/..., handoff §4).
//
// Ciclo de vida: se crea "active" y nunca se cierra en este cowork —
// decisión deliberada, no omisión: no existe hoy ningún consumidor (Agent
// Loop) que dependa de un estado "cerrado" — scaffoldReal no llama a Brain
// todavía (mandate_genesis_activities.go:243-267). Queda recolectable a
// futuro; un cierre formal se puede agregar sin romper este contrato
// cuando exista un consumidor real.
//
// El path del nodo SESSION espeja exactamente Store.ResolveActive
// (resolver.go:41): filepath.Join(filepath.Dir(mandatePath), ".session",
// sessionID, "node.json") — deliberado, no una reinvención: si no
// coincide byte a byte, ResolveActive nunca la va a encontrar.
func CreateGravitySessionActivity(ctx context.Context, input CreateGravitySessionInput) (CreateGravitySessionResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("[GRAVITY] CreateGravitySessionActivity started", "mandate_id", input.MandateID, "session_id", input.SessionID)

	if input.NucleusRoot == "" || input.MandateNodePath == "" || input.MandateID == "" || input.SessionID == "" {
		return CreateGravitySessionResult{}, fmt.Errorf("CreateGravitySessionActivity: NucleusRoot/MandateNodePath/MandateID/SessionID vacíos")
	}

	store, err := gravity.NewStore(input.NucleusRoot)
	if err != nil {
		return CreateGravitySessionResult{}, fmt.Errorf("CreateGravitySessionActivity: %w", err)
	}

	mandateNode, err := store.ReadNode(input.MandateNodePath)
	if err != nil {
		return CreateGravitySessionResult{}, fmt.Errorf(
			"CreateGravitySessionActivity: no se puede crear SESSION, MANDATE padre no existe en %s: %w", input.MandateNodePath, err,
		)
	}
	if mandateNode.NodeType != gravity.NodeMandate || mandateNode.NodeID != input.MandateID {
		return CreateGravitySessionResult{}, fmt.Errorf(
			"CreateGravitySessionActivity: nodo en %s no es el MANDATE %s esperado", input.MandateNodePath, input.MandateID,
		)
	}

	sessionPath := filepath.Join(filepath.Dir(input.MandateNodePath), ".session", input.SessionID, "node.json")
	mandateID := input.MandateID
	wanted := gravity.GravityNode{
		NodeID:          input.SessionID,
		NodeType:        gravity.NodeSession,
		ParentID:        &mandateID,
		GravityPostures: []gravity.GravityPosture{},
		Status:          gravity.NodeActive,
		CreatedAt:       time.Now().UTC().Format(time.RFC3339Nano),
	}
	sessionNode, created, err := readOrCreateNode(store, sessionPath, wanted)
	if err != nil {
		return CreateGravitySessionResult{}, fmt.Errorf("CreateGravitySessionActivity: %w", err)
	}
	if sessionNode.NodeType != gravity.NodeSession || sessionNode.NodeID != input.SessionID ||
		sessionNode.ParentID == nil || *sessionNode.ParentID != input.MandateID {
		return CreateGravitySessionResult{}, fmt.Errorf(
			"CreateGravitySessionActivity: SESSION existente en %s no coincide (nodeId=%s parentId=%v, esperaba nodeId=%s parentId=%s)",
			sessionPath, sessionNode.NodeID, sessionNode.ParentID, input.SessionID, input.MandateID,
		)
	}

	logger.Info("[GRAVITY] CreateGravitySessionActivity completed", "mandate_id", input.MandateID, "session_id", input.SessionID, "created", created)
	return CreateGravitySessionResult{SessionNodePath: sessionPath, Created: created}, nil
}

// ─────────────────────────────────────────────────────────────────────────
// PersistExecutionGravityActivity
// ─────────────────────────────────────────────────────────────────────────

type PersistExecutionGravityInput struct {
	MandatesRoot string
	MandateID    string
	SessionID    string
	IntentType   string
	Turn         uint64
	// Result — el ResolveResult completo devuelto por
	// resolveActiveGravityActivity para esta corrida (mismo tipo,
	// gravity.ResolveResult = ResolveActiveGravityResult).
	Result gravity.ResolveResult
}

type PersistExecutionGravityResult struct {
	StateVersion uint64
}

// canonicalizeForCompare hace un roundtrip JSON de v y lo decodifica en un
// map[string]interface{} genérico. Necesario para comparar el registro
// recién armado (que contiene structs Go, serializados en orden de
// declaración) contra el registro ya persistido y releído desde disco
// (que mandatestate.Mutate entrega como map[string]interface{} genérico,
// con objetos anidados también genéricos) — sin este paso,
// reflect.DeepEqual siempre daría distinto aunque el contenido semántico
// sea idéntico, por la sola diferencia de tipos Go entre ambos lados.
func canonicalizeForCompare(v interface{}) (map[string]interface{}, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var generic map[string]interface{}
	if err := json.Unmarshal(raw, &generic); err != nil {
		return nil, err
	}
	return generic, nil
}

// PersistExecutionGravityActivity deja durable, en
// {mandatesRoot}/{mandateID}/mandate_state.json bajo phases.execute.gravity
// (sibling nuevo de phases.execute.actions, nunca lo pisa: SignMandateActivity
// solo lee Phases.Validate.HumanSync, ignora el resto), qué Gravity
// gobernó esta corrida — checkpoint de este cowork, §5. Mismo mecanismo
// que PersistExecutionResultActivity (mandatestate.Mutate, idempotente):
// un retry que ya encuentra el mismo resultado escrito (comparado sin el
// timestamp resolvedAt, que cambia en cada intento aunque el resultado
// sea idéntico) no reincrementa stateVersion.
func PersistExecutionGravityActivity(ctx context.Context, input PersistExecutionGravityInput) (PersistExecutionGravityResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("[GRAVITY] PersistExecutionGravityActivity started", "mandate_id", input.MandateID, "session_id", input.SessionID, "turn", input.Turn)

	if input.MandatesRoot == "" || input.MandateID == "" || input.SessionID == "" {
		return PersistExecutionGravityResult{}, fmt.Errorf("PersistExecutionGravityActivity: MandatesRoot/MandateID/SessionID vacíos")
	}

	record := map[string]interface{}{
		"sessionId":      input.SessionID,
		"intentType":     input.IntentType,
		"turn":           input.Turn,
		"resolvedAt":     time.Now().UTC().Format(time.RFC3339Nano),
		"collectedCount": len(input.Result.Collected),
		"collected":      input.Result.Collected,
	}
	candidate, err := canonicalizeForCompare(record)
	if err != nil {
		return PersistExecutionGravityResult{}, fmt.Errorf("PersistExecutionGravityActivity: no pude canonicalizar el registro: %w", err)
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

		if existing, ok := execute["gravity"].(map[string]interface{}); ok {
			existingComparable := map[string]interface{}{}
			for k, v := range existing {
				if k != "resolvedAt" {
					existingComparable[k] = v
				}
			}
			candidateComparable := map[string]interface{}{}
			for k, v := range candidate {
				if k != "resolvedAt" {
					candidateComparable[k] = v
				}
			}
			if reflect.DeepEqual(existingComparable, candidateComparable) {
				return false, nil
			}
		}
		execute["gravity"] = candidate
		return true, nil
	})
	if err != nil {
		logger.Error("[GRAVITY] PersistExecutionGravityActivity failed", "mandate_id", input.MandateID, "session_id", input.SessionID, "turn", input.Turn, "error", err)
		return PersistExecutionGravityResult{}, fmt.Errorf("PersistExecutionGravityActivity: %w", err)
	}
	logger.Info("[GRAVITY] PersistExecutionGravityActivity completed", "mandate_id", input.MandateID, "session_id", input.SessionID, "turn", input.Turn, "state_version", version)
	return PersistExecutionGravityResult{StateVersion: version}, nil
}
