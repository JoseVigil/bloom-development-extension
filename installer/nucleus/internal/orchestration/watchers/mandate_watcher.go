// internal/orchestration/watchers/mandate_watcher.go
package watchers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/fsnotify/fsnotify"

	"nucleus/internal/orchestration/temporal"
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
	Phases        struct {
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
	tc           *temporal.Client
	watcher      *fsnotify.Watcher
	progress     *mandateProgress
}

func NewMandateWatcher(mandatesRoot string, tc *temporal.Client) *MandateWatcher {
	return &MandateWatcher{
		mandatesRoot: mandatesRoot,
		tc:           tc,
		progress:     newMandateProgress(),
	}
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
		log.Printf("[mandate_watcher] warning al indexar dirs existentes: %v", err)
	}
	if err := fsw.Add(w.mandatesRoot); err != nil {
		fsw.Close()
		return fmt.Errorf("no pude observar %s: %w", w.mandatesRoot, err)
	}

	log.Printf("[mandate_watcher] vigilando %s", w.mandatesRoot)

	for {
		select {
		case <-ctx.Done():
			fsw.Close()
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
			log.Printf("[mandate_watcher] error fsnotify: %v", err)
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
			log.Printf("[mandate_watcher] no pude observar %s: %v", dir, err)
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
				log.Printf("[mandate_watcher] no pude observar nueva carpeta %s: %v", event.Name, err)
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
		log.Printf("[mandate_watcher] no pude leer %s: %v", path, err)
		return
	}

	var ms MandateState
	if err := json.Unmarshal(raw, &ms); err != nil {
		log.Printf("[mandate_watcher] mandate_state.json inválido en %s: %v", path, err)
		return
	}

	// El mandateId puede no estar embebido en archivos viejos escritos antes
	// de este cambio (o si algún escritor todavía no fue actualizado) — como
	// fallback lo derivamos del nombre de carpeta, que siempre es el UUID.
	if ms.MandateID == "" {
		ms.MandateID = filepath.Base(filepath.Dir(path))
		log.Printf("[mandate_watcher] mandate_state.json sin mandateId embebido en %s — usando nombre de carpeta (%s) como fallback", path, ms.MandateID)
	}

	if ms.MandateType != "genesis" && ms.MandateType != "domain_expansion" {
		// No es un genesis en curso (podría ser un standard, o un archivo
		// todavía sin mandateType si algún escritor viejo no fue migrado).
		// No es este watcher quien procesa eso.
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
		if temporal.IsAlreadyStarted(err) {
			log.Printf("[mandate_watcher] workflow ya corría para %s, ignorando", ms.MandateID)
			return
		}
		log.Printf("[mandate_watcher] error al arrancar MandateGenesisBuildWorkflow para %s: %v", ms.MandateID, err)
		return
	}
	log.Printf("[mandate_watcher] MandateGenesisBuildWorkflow arrancado para mandate %s", ms.MandateID)
}
