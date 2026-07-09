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
// peor caso es una señal repetida al reindexar, que el workflow debe poder
// ignorar sin efecto (idempotencia del lado del handler de señal, no
// resuelta acá — ver TODO en sendPhaseSignal).
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
//   - señalizarlo para que avance de fase (ingest → cluster), o
//   - no hacer nada (la escritura no cambió nada relevante — por ejemplo,
//     un touch sin cambio de contenido, o un evento duplicado de fsnotify).
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

	case ms.CurrentPhase == "ingest" && ms.Phases.Ingest.Status == "completed":
		w.sendPhaseSignal(ctx, ms.MandateID, "ingest_complete")

	case ms.CurrentPhase == "cluster" && ms.Phases.Cluster.Status == "completed":
		w.sendPhaseSignal(ctx, ms.MandateID, "cluster_complete")

	default:
		// Otras transiciones (validate, sign, etc.) — todavía no
		// implementadas en este watcher. No es un error, es simplemente
		// una fase que este código no maneja todavía.
	}
}

// startGenesisWorkflow arranca MandateGenesisBuildWorkflow. Usa el
// mandateID como Workflow ID (asumido — no confirmado contra
// temporal/client.go, que no tengo) para que un segundo evento de fsnotify
// sobre la misma escritura (fsnotify puede duplicar eventos) no dispare un
// segundo workflow: StartWorkflow con el mismo ID debe devolver
// "already started", que ya se maneja abajo igual que en el código previo.
func (w *MandateWatcher) startGenesisWorkflow(ctx context.Context, ms MandateState) {
	_, err := w.tc.StartMandateGenesisBuildWorkflow(ctx, ms.MandateID, workflows.GenesisBuildInput{
		MandateID:     ms.MandateID,
		MandateType:   ms.MandateType,
		BaseGenesisID: ms.BaseGenesisID,
		Source:        ms.Source,
		Project:       ms.Project,
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

// sendPhaseSignal señaliza al workflow en curso que una fase terminó, para
// que avance a la siguiente Activity.
//
// ⚠️ PENDIENTE DE VERIFICAR: no tengo internal/orchestration/temporal/client.go,
// así que no conozco la firma real del método de señalización sobre
// *temporal.Client (si existe todavía). SignalMandateGenesisPhase de abajo
// es un nombre propuesto, no confirmado. Tampoco conozco si
// MandateGenesisBuildWorkflow (cuyo cuerpo tampoco tengo) ya define
// setHandler() para una señal con este nombre — si no lo define, esta
// llamada no tiene ningún efecto del lado del workflow aunque compile.
// No lo puedo resolver sin esos dos archivos — dejarlo así hasta
// confirmarlos, en vez de inventar una interfaz que capaz no coincide.
func (w *MandateWatcher) sendPhaseSignal(ctx context.Context, mandateID, signalName string) {
	err := w.tc.SignalMandateGenesisPhase(ctx, mandateID, signalName, nil)
	if err != nil {
		log.Printf("[mandate_watcher] error al señalizar %q para mandate %s: %v", signalName, mandateID, err)
		return
	}
	log.Printf("[mandate_watcher] señal %q enviada para mandate %s", signalName, mandateID)
}
