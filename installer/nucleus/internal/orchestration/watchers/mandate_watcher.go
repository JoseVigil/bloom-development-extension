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

	"github.com/fsnotify/fsnotify"

	"nucleus/internal/orchestration/temporal"
	"nucleus/internal/orchestration/temporal/workflows"
)

// GenState espeja src/types/gen-state.types.ts del lado TS — mismo contrato,
// dos lenguajes. Mantiene sincronía entre frontend (TS) y backend (Go).
// Actualizar este struct cuando cambie el schema en TypeScript.
// dos lenguajes. Si un campo cambia en el schema TS, cambia acá también.
type GenState struct {
	MandateID     string `json:"mandateId"`
	MandateType   string `json:"mandateType"`
	BaseGenesisID string `json:"baseGenesisId,omitempty"`
	Source        string `json:"source"`
	Project       string `json:"project"`
	Name          string `json:"name"`
	Status        string `json:"status"`
	CurrentPhase  string `json:"currentPhase"`
}

type MandateWatcher struct {
	mandatesRoot string
	tc           *temporal.Client
	watcher      *fsnotify.Watcher
}

func NewMandateWatcher(mandatesRoot string, tc *temporal.Client) *MandateWatcher {
	return &MandateWatcher{mandatesRoot: mandatesRoot, tc: tc}
}

// Start arranca el vigilante de cambios en el filesystem y bloquea hasta que ctx se cancele.
// Usa fsnotify para detectar creación/escritura de gen_state.json y dispara workflows de Temporal.
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
		genStatePath := filepath.Join(dir, "gen_state.json")
		if _, err := os.Stat(genStatePath); err == nil {
			w.onGenStateWritten(context.Background(), genStatePath)
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

	if !strings.HasSuffix(event.Name, "gen_state.json") {
		return
	}
	if event.Op&(fsnotify.Create|fsnotify.Write) == 0 {
		return
	}
	w.onGenStateWritten(ctx, event.Name)
}

// onGenStateWritten es el handler principal: lee gen_state.json y arranca
// el workflow MandateGenesisBuildWorkflow vía Temporal.
func (w *MandateWatcher) onGenStateWritten(ctx context.Context, path string) {
	raw, err := os.ReadFile(path)
	if err != nil {
		log.Printf("[mandate_watcher] no pude leer %s: %v", path, err)
		return
	}

	var gs GenState
	if err := json.Unmarshal(raw, &gs); err != nil {
		log.Printf("[mandate_watcher] gen_state.json inválido en %s: %v", path, err)
		return
	}
	if gs.MandateID == "" {
		log.Printf("[mandate_watcher] gen_state.json sin mandateId en %s — ignorado", path)
		return
	}

	_, err = w.tc.StartMandateGenesisBuildWorkflow(ctx, gs.MandateID, workflows.GenesisBuildInput{
		MandateID:     gs.MandateID,
		MandateType:   gs.MandateType,
		BaseGenesisID: gs.BaseGenesisID,
		Source:        gs.Source,
		Project:       gs.Project,
	})
	if err != nil {
		if temporal.IsAlreadyStarted(err) {
			log.Printf("[mandate_watcher] workflow ya corría para %s, ignorando", gs.MandateID)
			return
		}
		log.Printf("[mandate_watcher] error al arrancar MandateGenesisBuildWorkflow para %s: %v", gs.MandateID, err)
		return
	}
	log.Printf("[mandate_watcher] MandateGenesisBuildWorkflow arrancado para mandate %s", gs.MandateID)
}