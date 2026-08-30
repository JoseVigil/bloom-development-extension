// internal/orchestration/watchers/mandate_watcher.go
package watchers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"go.temporal.io/api/serviceerror"
	"go.temporal.io/sdk/client"

	"nucleus/internal/core"
	"nucleus/internal/orchestration/temporal/workflows"
)

// MandateState espeja la forma embebida que escriben tanto
// create-mandate.handler.ts (API) como createGenesisMandate (mandate.go,
// CLI) desde la unificación acordada — gen_state.json queda deprecado,
// mandate_state.json es la única fuente de verdad para el ciclo pre-firma.
//
// NOTA: el handler TS original solo escribía {status, currentPhase, phases}
// — sin mandateId/mandateType/project/source. Se agregaron esos campos en
// ambos lados (Go y TS) en este mismo turno porque el watcher los necesita
// para armar GenesisBuildInput. Si alguien vuelve a tocar el handler TS sin
// saber esto, va a romper el watcher silenciosamente — dejar este comentario
// como advertencia.
type MandateState struct {
	MandateID     string `json:"mandateId"`
	MandateType   string `json:"mandateType"`
	BaseGenesisID string `json:"baseGenesisId,omitempty"`
	Source        string `json:"source"`
	Project       string `json:"project"`
	Status        string `json:"status"`
	CurrentPhase  string `json:"currentPhase"`
	StateVersion  int64  `json:"stateVersion"`
	UpdatedAt     string `json:"updatedAt"`
	Signature     struct {
		Status    string `json:"status"`
		PendingAt string `json:"pendingAt,omitempty"`
	} `json:"signature"`
	Reconciliation struct {
		Status string `json:"status,omitempty"`
		Reason string `json:"reason,omitempty"`
	} `json:"reconciliation,omitempty"`
	Phases struct {
		Ingest  PhaseRecord `json:"ingest"`
		Cluster PhaseRecord `json:"cluster"`
	} `json:"phases"`
}

// PhaseRecord — mínimo necesario para que el watcher decida si una fase
// terminó. El schema completo (con startedAt/completedAt/failureReason,
// etc.) vive del lado que escribe el archivo; acá solo leemos lo que
// necesitamos para decidir transición, siguiendo el mismo principio de
// mínima superficie que ya usaba GenState.
type PhaseRecord struct {
	Status string `json:"status"` // "pending" | "in_progress" | "completed" | "failed"
}

// mandateProgress es el registro en memoria de la última fase que el
// watcher ya procesó para un mandateId — necesario porque fsnotify solo
// avisa "el archivo cambió", no "qué campo cambió". Sin este registro,
// cada escritura del archivo (incluida la que hace el propio Nucleus al
// avanzar de fase) dispararía una señal duplicada.
//
// Vive solo en memoria: si Nucleus reinicia a mitad de un genesis, se
// reconstruye desde el estado en disco en watchExistingMandateDirs() — el
// peor caso es reprocesar el mismo fingerprint al reindexar, que
// markIfChanged ya filtra.
type mandateProgress struct {
	mu   sync.Mutex
	seen map[string]string // mandateId -> "currentPhase:ingestStatus:clusterStatus"
}

func newMandateProgress() *mandateProgress {
	return &mandateProgress{seen: make(map[string]string)}
}

func (p *mandateProgress) fingerprint(ms MandateState) string {
	return ms.CurrentPhase + ":" + ms.Phases.Ingest.Status + ":" + ms.Phases.Cluster.Status
}

// markIfChanged devuelve true si el fingerprint es distinto al último
// visto para este mandateId (y lo actualiza). Primera vez que se ve un
// mandateId siempre devuelve true.
func (p *mandateProgress) markIfChanged(ms MandateState) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	fp := p.fingerprint(ms)
	if p.seen[ms.MandateID] == fp {
		return false
	}
	p.seen[ms.MandateID] = fp
	return true
}

// CAMBIO esta sesión: se eliminaron signalIngestComplete/signalClusterComplete
// y sendPhaseSignal (más abajo, ya no existe). Confirmado contra el cuerpo
// real de MandateGenesisBuildWorkflow: Fase 1 y Fase 2 corren secuenciales
// vía ExecuteActivity(...).Get(...), sin ningún GetSignalChannel/Receive
// antes de Fase 3 — esas dos señales no tenían destinatario, eran no-ops.
// Se sacan como dead code en vez de agregarles setHandler porque hoy no hay
// necesidad de negocio real de pausar ahí (Fase 2 es dry_run instantáneo,
// sin clustering real todavía). Si Fase 2 deja de ser instantánea en el
// futuro, ahí sí valdría la pena reabrir esto.

type MandateWatcher struct {
	mandatesRoot string
	tc           GenesisTemporalClient
	watcher      *fsnotify.Watcher
	progress     *mandateProgress
	logger       *core.Logger
}

// GenesisTemporalClient is the narrow Temporal contract needed by the watcher.
// Keeping it here lets worker start own both components without an import cycle.
type GenesisTemporalClient interface {
	StartMandateGenesisBuildWorkflow(context.Context, string, workflows.GenesisBuildInput) (client.WorkflowRun, error)
	IsWorkflowRunning(context.Context, string) (bool, error)
	GetWorkflowExecutionState(context.Context, string) (WorkflowExecutionState, error)
}

type WorkflowExecutionState string

const (
	WorkflowExecutionRunning    WorkflowExecutionState = "running"
	WorkflowExecutionCompleted  WorkflowExecutionState = "completed"
	WorkflowExecutionFailed     WorkflowExecutionState = "failed"
	WorkflowExecutionCanceled   WorkflowExecutionState = "canceled"
	WorkflowExecutionTerminated WorkflowExecutionState = "terminated"
	WorkflowExecutionTimedOut   WorkflowExecutionState = "timed_out"
	WorkflowExecutionNotFound   WorkflowExecutionState = "not_found"
	WorkflowExecutionUnknown    WorkflowExecutionState = "unknown"
)

// unsignedMandateGracePeriod evita confundir un dispatch reciente con un
// huérfano. Se cuenta desde pendingAt cuando existe y, para el estado inicial,
// desde updatedAt de stateVersion=1. Es constante nombrada para poder ajustar
// la política sin reabrir el diseño.
const unsignedMandateGracePeriod = 15 * time.Minute

const reconciliationScanInterval = unsignedMandateGracePeriod / 3

type reconciliationAction string

const (
	reconciliationNoop     reconciliationAction = ""
	reconciliationUnknown  reconciliationAction = "unknown"
	reconciliationRequired reconciliationAction = "required"
	reconciliationFailed   reconciliationAction = "failed"
	reconciliationClear    reconciliationAction = "clear"
)

type genesisDuplicateDisposition string

const (
	genesisDuplicateActive       genesisDuplicateDisposition = "active"
	genesisDuplicateHistorical   genesisDuplicateDisposition = "historical"
	genesisDuplicateUnclassified genesisDuplicateDisposition = "unclassified"
)

func classifyGenesisDuplicate(running bool, statusErr error) genesisDuplicateDisposition {
	if statusErr != nil {
		return genesisDuplicateUnclassified
	}
	if running {
		return genesisDuplicateActive
	}
	return genesisDuplicateHistorical
}

// NewMandateWatcher construye el watcher e inicializa su logger propio
// (categoría MANDATE, ver core.InitLogger / mandate_logger.go). Esto hace
// que todo lo que antes iba solo a stdout/stderr via log.Printf ahora
// también persista en logs/nucleus/mandate/nucleus_mandate_YYYYMMDD.log
// y quede registrado en telemetry.json — InitLogger hace ambas cosas en
// una sola llamada, no hace falta invocar telemetry register aparte.
func NewMandateWatcher(mandatesRoot string, tc GenesisTemporalClient, paths *core.Paths, jsonMode bool) (*MandateWatcher, error) {
	logger, err := core.InitLogger(paths, "MANDATE", jsonMode)
	if err != nil {
		return nil, fmt.Errorf("no pude inicializar logger de mandate: %w", err)
	}
	return &MandateWatcher{
		mandatesRoot: mandatesRoot,
		tc:           tc,
		progress:     newMandateProgress(),
		logger:       logger,
	}, nil
}

// Start arranca el vigilante de cambios en el filesystem y bloquea hasta que ctx se cancele.
// Usa fsnotify para detectar creación/escritura de mandate_state.json y
// dispara/señaliza workflows de Temporal según la fase.
// Debe correr en su propia goroutine — ver wiring en internal/supervisor/service.go.
func (w *MandateWatcher) Start(ctx context.Context) error {
	if err := os.MkdirAll(w.mandatesRoot, 0755); err != nil {
		return fmt.Errorf("no pude crear .mandates en %s: %w", w.mandatesRoot, err)
	}

	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("no pude iniciar fsnotify: %w", err)
	}
	w.watcher = fsw

	if err := w.watchExistingMandateDirs(); err != nil {
		w.logger.Warning("[mandate_watcher] warning al indexar dirs existentes: %v", err)
	}
	if err := fsw.Add(w.mandatesRoot); err != nil {
		fsw.Close()
		return fmt.Errorf("no pude observar %s: %w", w.mandatesRoot, err)
	}

	w.logger.Info("[mandate_watcher] vigilando %s", w.mandatesRoot)
	if err := w.reconcileUnsignedMandates(ctx, time.Now()); err != nil {
		w.logger.Warning("[mandate_watcher] reconciliación inicial incompleta: %v", err)
	}
	ticker := time.NewTicker(reconciliationScanInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			fsw.Close()
			w.logger.Close()
			return ctx.Err()
		case event, ok := <-fsw.Events:
			if !ok {
				return nil
			}
			w.handleEvent(ctx, event)
		case err, ok := <-fsw.Errors:
			if !ok {
				return nil
			}
			w.logger.Error("[mandate_watcher] error fsnotify: %v", err)
		case now := <-ticker.C:
			if err := w.reconcileUnsignedMandates(ctx, now); err != nil {
				w.logger.Warning("[mandate_watcher] reconciliación periódica incompleta: %v", err)
			}
		}
	}
}

// watchExistingMandateDirs agrega al watcher las subcarpetas de mandate que
// ya existían al arrancar (creadas mientras el servicio estaba caído).
func (w *MandateWatcher) watchExistingMandateDirs() error {
	entries, err := os.ReadDir(w.mandatesRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(w.mandatesRoot, e.Name())
		if err := w.watcher.Add(dir); err != nil {
			w.logger.Warning("[mandate_watcher] no pude observar %s: %v", dir, err)
			continue
		}
		statePath := filepath.Join(dir, "mandate_state.json")
		if _, err := os.Stat(statePath); err == nil {
			w.onMandateStateWritten(context.Background(), statePath)
		}
	}
	return nil
}

func (w *MandateWatcher) handleEvent(ctx context.Context, event fsnotify.Event) {
	// Nueva subcarpeta de mandate → empezar a observarla también.
	if event.Op&fsnotify.Create == fsnotify.Create {
		if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
			if err := w.watcher.Add(event.Name); err != nil {
				w.logger.Warning("[mandate_watcher] no pude observar nueva carpeta %s: %v", event.Name, err)
			}
			return
		}
	}

	// mandate_state.json es la única fuente de verdad desde la unificación —
	// gen_state.json ya no se escribe ni se vigila.
	if !strings.HasSuffix(event.Name, "mandate_state.json") {
		return
	}
	if event.Op&(fsnotify.Create|fsnotify.Write) == 0 {
		return
	}
	w.onMandateStateWritten(ctx, event.Name)
}

// onMandateStateWritten es el handler principal. Se dispara en cada
// creación/escritura de mandate_state.json (venga del CLI o de la API —
// ambos escriben el mismo archivo desde la unificación) y en cada avance
// de fase que Nucleus/Brain persistan ahí mismo. Decide, según el
// contenido, si hay que:
//   - arrancar MandateGenesisBuildWorkflow (primera vez que se ve el
//     mandateId), o
//   - no hacer nada (la escritura no cambió nada relevante — por ejemplo,
//     un touch sin cambio de contenido, un evento duplicado de fsnotify, o
//     una transición de fase que el propio workflow ya maneja internamente
//     sin necesitar que este watcher la señalice — ver nota arriba sobre
//     signalIngestComplete/signalClusterComplete, eliminadas esta sesión).
//
// Solo aplica a mandateType genesis/domain_expansion — mandate_state.json
// de un standard firmado tiene otra forma y no debería llegar acá, pero
// igual se valida por las dudas.
func (w *MandateWatcher) onMandateStateWritten(ctx context.Context, path string) {
	raw, err := os.ReadFile(path)
	if err != nil {
		w.logger.Error("[mandate_watcher] no pude leer %s: %v", path, err)
		return
	}

	var ms MandateState
	if err := json.Unmarshal(raw, &ms); err != nil {
		w.logger.Error("[mandate_watcher] mandate_state.json inválido en %s: %v", path, err)
		return
	}

	// El mandateId puede no estar embebido en archivos viejos escritos antes
	// de este cambio (o si algún escritor todavía no fue actualizado) — como
	// fallback lo derivamos del nombre de carpeta, que siempre es el UUID.
	if ms.MandateID == "" {
		ms.MandateID = filepath.Base(filepath.Dir(path))
		w.logger.Warning("[mandate_watcher] mandate_state.json sin mandateId embebido en %s — usando nombre de carpeta (%s) como fallback", path, ms.MandateID)
	}

	if ms.MandateType != "genesis" && ms.MandateType != "domain_expansion" {
		// No es un genesis en curso (podría ser un standard, o un archivo
		// todavía sin mandateType si algún escritor viejo no fue migrado).
		// No es este watcher quien procesa eso.
		return
	}

	// Rama aditiva: observa estados pre-firma, pero no reemplaza ni altera la
	// clasificación de dispatch duplicado que vive en startGenesisWorkflow.
	if err := w.reconcileUnsignedMandate(ctx, path, ms, time.Now()); err != nil {
		w.logger.Warning("[mandate_watcher] no pude reconciliar %s: %v", ms.MandateID, err)
	}

	// La reconciliación puede haber detectado que el Workflow ya terminó y
	// persistido signature.status=failed + unsigned_after_terminal_workflow.
	// Releer antes de decidir el dispatch evita continuar con la copia stale
	// que se deserializó al entrar a este handler y arrancar otro Run en el
	// mismo ciclo. En reinicios posteriores el mismo guard también excluye el
	// estado terminal ya durable, aunque Temporal haya perdido su historial.
	if reconciledRaw, readErr := os.ReadFile(path); readErr != nil {
		w.logger.Warning("[mandate_watcher] no pude releer %s después de reconciliar: %v", ms.MandateID, readErr)
		return
	} else {
		var reconciled MandateState
		if unmarshalErr := json.Unmarshal(reconciledRaw, &reconciled); unmarshalErr != nil {
			w.logger.Warning("[mandate_watcher] estado inválido después de reconciliar %s: %v", ms.MandateID, unmarshalErr)
			return
		}
		if reconciled.MandateID == "" {
			reconciled.MandateID = ms.MandateID
		}
		ms = reconciled
	}

	if ms.Signature.Status == "failed" && ms.Reconciliation.Reason == "unsigned_after_terminal_workflow" {
		w.logger.Info("[mandate_watcher] workflow terminal ya reconciliado para %s, dispatch omitido", ms.MandateID)
		return
	}

	if !w.progress.markIfChanged(ms) {
		return // ya procesamos este mismo fingerprint, evita duplicados
	}

	switch {
	case ms.Status == "building" && ms.CurrentPhase == "ingest" && ms.Phases.Ingest.Status == "pending":
		w.startGenesisWorkflow(ctx, ms)

	default:
		// Cualquier otra transición (ingest completado, cluster, validate,
		// sign, etc.) la maneja MandateGenesisBuildWorkflow internamente
		// vía ExecuteActivity secuencial — este watcher solo necesita
		// reaccionar al arranque inicial. La confirmación humana (Fase 3)
		// tampoco pasa por acá: mandate_genesis_domains_cmd.go señaliza
		// "mandate:genesis:validate" directo al workflow, sin pasar por
		// este watcher ni por mandate_state.json como intermediario para
		// ese paso puntual.
	}
}

func (w *MandateWatcher) reconcileUnsignedMandates(ctx context.Context, now time.Time) error {
	entries, err := os.ReadDir(w.mandatesRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		path := filepath.Join(w.mandatesRoot, entry.Name(), "mandate_state.json")
		raw, err := os.ReadFile(path)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			w.logger.Warning("[mandate_watcher] no pude leer %s durante reconciliación: %v", path, err)
			continue
		}
		var ms MandateState
		if err := json.Unmarshal(raw, &ms); err != nil {
			w.logger.Warning("[mandate_watcher] estado inválido durante reconciliación en %s: %v", path, err)
			continue
		}
		if ms.MandateID == "" {
			ms.MandateID = entry.Name()
		}
		if err := w.reconcileUnsignedMandate(ctx, path, ms, now); err != nil {
			w.logger.Warning("[mandate_watcher] no pude reconciliar %s: %v", ms.MandateID, err)
		}
	}
	return nil
}

func (w *MandateWatcher) reconcileUnsignedMandate(ctx context.Context, path string, ms MandateState, now time.Time) error {
	if ms.MandateType != "genesis" && ms.MandateType != "domain_expansion" {
		return nil
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(path), "mandate.json")); err == nil || ms.Signature.Status == "signed" {
		if ms.Reconciliation.Status != "" {
			return persistReconciliation(path, reconciliationClear, "", now)
		}
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}

	workflowID := fmt.Sprintf("mandate_genesis_%s", ms.MandateID)
	workflowState, queryErr := w.tc.GetWorkflowExecutionState(ctx, workflowID)
	action, reason := evaluateUnsignedMandate(ms, workflowState, queryErr, now)
	if action == reconciliationNoop ||
		(action == reconciliationUnknown && ms.Reconciliation.Status == "unknown") ||
		(action == reconciliationRequired && ms.Reconciliation.Status == "required" && ms.Reconciliation.Reason == reason) ||
		(action == reconciliationFailed && ms.Signature.Status == "failed" && ms.Reconciliation.Status == "required") {
		return nil
	}
	return persistReconciliation(path, action, reason, now)
}

func evaluateUnsignedMandate(ms MandateState, workflowState WorkflowExecutionState, queryErr error, now time.Time) (reconciliationAction, string) {
	if queryErr != nil || workflowState == WorkflowExecutionUnknown {
		return reconciliationUnknown, "temporal_unavailable"
	}
	if workflowState == WorkflowExecutionRunning {
		if ms.Reconciliation.Status == "unknown" {
			return reconciliationClear, ""
		}
		return reconciliationNoop, ""
	}
	if workflowState == WorkflowExecutionFailed || workflowState == WorkflowExecutionCanceled ||
		workflowState == WorkflowExecutionTerminated || workflowState == WorkflowExecutionTimedOut ||
		workflowState == WorkflowExecutionCompleted {
		return reconciliationFailed, "unsigned_after_terminal_workflow"
	}
	if workflowState == WorkflowExecutionNotFound && gracePeriodElapsed(ms, now) {
		return reconciliationRequired, "unsigned_without_active_workflow"
	}
	return reconciliationNoop, ""
}

func gracePeriodElapsed(ms MandateState, now time.Time) bool {
	base := ms.Signature.PendingAt
	if base == "" && ms.StateVersion >= 1 {
		base = ms.UpdatedAt
	}
	if base == "" {
		return false
	}
	startedAt, err := time.Parse(time.RFC3339, base)
	if err != nil {
		return false
	}
	return !now.Before(startedAt.Add(unsignedMandateGracePeriod))
}

func persistReconciliation(path string, action reconciliationAction, reason string, now time.Time) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var state map[string]interface{}
	if err := json.Unmarshal(raw, &state); err != nil {
		return err
	}
	if action == reconciliationClear {
		delete(state, "reconciliation")
	} else {
		status := string(action)
		if action == reconciliationFailed {
			status = "required"
		}
		state["reconciliation"] = map[string]interface{}{
			"status":     status,
			"reason":     reason,
			"detectedAt": now.UTC().Format(time.RFC3339),
		}
	}
	if action == reconciliationFailed {
		signature, _ := state["signature"].(map[string]interface{})
		if signature == nil {
			signature = map[string]interface{}{}
		}
		signature["status"] = "failed"
		signature["failedAt"] = now.UTC().Format(time.RFC3339)
		signature["failure"] = map[string]interface{}{"code": "SIGNATURE_FAILED", "message": reason}
		state["signature"] = signature
	}
	version, _ := state["stateVersion"].(float64)
	state["stateVersion"] = int64(version) + 1
	state["updatedAt"] = now.UTC().Format(time.RFC3339)
	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// startGenesisWorkflow arranca MandateGenesisBuildWorkflow. El Workflow ID
// real (confirmado en temporal_client.go) es "mandate_genesis_{mandateID}",
// no el mandateID pelado — StartMandateGenesisBuildWorkflow lo arma así
// internamente, acá no hace falta reconstruirlo porque el propio método
// lo recibe como parámetro separado. Esto hace que un segundo evento de
// fsnotify sobre la misma escritura (fsnotify puede duplicar eventos) no
// dispare un segundo workflow: mismo Workflow ID → Temporal devuelve
// WorkflowExecutionAlreadyStarted, manejado abajo vía IsAlreadyStarted.
func (w *MandateWatcher) startGenesisWorkflow(ctx context.Context, ms MandateState) {
	_, err := w.tc.StartMandateGenesisBuildWorkflow(ctx, ms.MandateID, workflows.GenesisBuildInput{
		MandateID:     ms.MandateID,
		MandateType:   ms.MandateType,
		BaseGenesisID: ms.BaseGenesisID,
		Source:        ms.Source,
		Project:       ms.Project,
		// MandatesRoot — CAMPO NUEVO esta sesión (Tarea 1). Sin esto,
		// ScaffoldDomainActivity/SignMandateActivity/PersistHumanSyncActivity
		// fallan al arrancar ("MandatesRoot vacío para mandate ..."). El
		// watcher ya lo tenía disponible como campo propio
		// (w.mandatesRoot, ver NewMandateWatcher) — solo faltaba pasarlo.
		MandatesRoot: w.mandatesRoot,
	})
	if err != nil {
		var alreadyStarted *serviceerror.WorkflowExecutionAlreadyStarted
		if errors.As(err, &alreadyStarted) {
			workflowID := fmt.Sprintf("mandate_genesis_%s", ms.MandateID)
			running, statusErr := w.tc.IsWorkflowRunning(ctx, workflowID)
			switch classifyGenesisDuplicate(running, statusErr) {
			case genesisDuplicateUnclassified:
				w.logger.Error("[mandate_watcher] Temporal rechazó el dispatch duplicado de %s y no se pudo clasificar el Run: %v", ms.MandateID, statusErr)
				return
			case genesisDuplicateActive:
				w.logger.Info("[mandate_watcher] workflow ya está vivo para %s, redispatch ignorado", ms.MandateID)
				return
			case genesisDuplicateHistorical:
				w.logger.Error("[mandate_watcher] Temporal rechazó un nuevo Run para %s: Workflow ID histórico protegido por REJECT_DUPLICATE", ms.MandateID)
				return
			}
		}
		w.logger.Error("[mandate_watcher] error al arrancar MandateGenesisBuildWorkflow para %s: %v", ms.MandateID, err)
		return
	}
	w.logger.Success("[mandate_watcher] MandateGenesisBuildWorkflow arrancado para mandate %s", ms.MandateID)
}
