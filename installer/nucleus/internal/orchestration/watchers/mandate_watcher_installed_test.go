package watchers

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"go.temporal.io/sdk/client"

	"nucleus/internal/core"
	"nucleus/internal/mandateoffer"
	"nucleus/internal/orchestration/temporal/workflows"
)

// Una instancia instalada desde una oferta de Wisdom queda en .mandates sólo si
// el watcher no la toma: ni en vivo, ni al reiniciar, ni en la reconciliación.
// Estas pruebas fijan esa inercia contra el archivo que escribe la instalación.

type countingTemporalClient struct {
	mu                                                    sync.Mutex
	buildStarts, executionStarts, signals, running, query int
}

func (c *countingTemporalClient) StartMandateBuildWorkflow(context.Context, string, workflows.MandateBuildInput) (client.WorkflowRun, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.buildStarts++
	return nil, nil
}
func (c *countingTemporalClient) StartMandateExecutionWorkflow(context.Context, string, workflows.MandateExecutionInput) (client.WorkflowRun, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.executionStarts++
	return nil, nil
}
func (c *countingTemporalClient) SignalMandateExecutionWorkflow(context.Context, string, string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.signals++
	return nil
}
func (c *countingTemporalClient) IsWorkflowRunning(context.Context, string) (bool, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.running++
	return false, nil
}
func (c *countingTemporalClient) GetWorkflowExecutionState(context.Context, string) (WorkflowExecutionState, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.query++
	return WorkflowExecutionNotFound, nil
}
func (c *countingTemporalClient) total() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.buildStarts + c.executionStarts + c.signals + c.running + c.query
}

const installedInstanceID = "7d0c2f5e-3a51-4f0e-9c7b-2b1f6f4d9a10"

// installedInstanceFixture son los bytes exactos que escribe la instalación de
// una oferta (mandateoffer.MarshalInstance): sin mandateType, sin adoption, sin
// signature y sin mandate.json.
var installedInstanceFixture = mustInstalledInstance()

func mustInstalledInstance() []byte {
	data, err := mandateoffer.MarshalInstance(mandateoffer.Instance{
		Schema: mandateoffer.InstanceSchema, SchemaVersion: mandateoffer.InstanceSchemaVersion,
		MandateID: installedInstanceID, Status: mandateoffer.StatusInstalled,
		OrganizationID: "9f1de71c-b252-4f90-bbdd-984e1cd5c9c2", ProjectID: "65572042-229e-4ea6-ad13-37b11fce5fdd",
		ProjectBinding: mandateoffer.InstanceProjectBinding{Revision: "1", CheckedAt: "2026-10-19T19:00:00Z"},
		Definition: mandateoffer.InstanceDefinition{DefinitionID: "0b8e4b9e-6d0f-4c55-9d8e-2f4b7a1c3e21", Version: "1.0.0",
			Digest: "4f2d0c7b1a9e8d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a392817060f5e", Label: "Genesis",
			PublisherKeyID: "bloom-mandate-definition-dev-1", Preparation: "not_defined"},
		ReceiptRef:    "authority/mandate-delivery/example/receipt.json",
		Authorization: mandateoffer.InstanceAuthorization{Kind: mandateoffer.AuthorizationMasterLocal, InstallationID: "installation-1"},
		InstalledAt:   "2026-10-19T19:00:00Z"})
	if err != nil {
		panic(err)
	}
	return data
}

func writeInstalledInstance(t *testing.T, root string) string {
	t.Helper()
	dir := filepath.Join(root, installedInstanceID)
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "mandate_state.json")
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, installedInstanceFixture, 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(tmp, path); err != nil {
		t.Fatal(err)
	}
	return path
}

func newInertiaWatcher(t *testing.T, root string, tc MandateBuildTemporalClient) (*MandateWatcher, string) {
	t.Helper()
	logs := filepath.Join(t.TempDir(), "logs")
	logger, err := core.InitLogger(&core.Paths{LogsDir: logs}, "MANDATE", true)
	if err != nil {
		t.Fatal(err)
	}
	return &MandateWatcher{mandatesRoot: root, identityPath: filepath.Join(t.TempDir(), "identity.json"),
		tc: tc, progress: newMandateProgress(), logger: logger}, logs
}

func runWatcherFor(t *testing.T, w *MandateWatcher, during func()) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- w.Start(ctx) }()
	time.Sleep(300 * time.Millisecond)
	if during != nil {
		during()
	}
	time.Sleep(700 * time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("watcher did not stop")
	}
}

func assertInstanceUntouched(t *testing.T, root, statePath string, tc *countingTemporalClient, logs string) {
	t.Helper()
	if n := tc.total(); n != 0 {
		t.Fatalf("watcher touched Temporal for an installed instance: build=%d exec=%d signal=%d running=%d query=%d",
			tc.buildStarts, tc.executionStarts, tc.signals, tc.running, tc.query)
	}
	raw, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(raw, installedInstanceFixture) {
		t.Fatalf("installed instance was rewritten:\n%s", raw)
	}
	entries, err := os.ReadDir(filepath.Dir(statePath))
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].Name() != "mandate_state.json" {
		names := []string{}
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Fatalf("instance directory gained files: %v", names)
	}
	// El watcher tampoco debe tratarlo como estado inválido: ignorar no es fallar.
	_ = filepath.Walk(logs, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		content, _ := os.ReadFile(path)
		text := string(content)
		if strings.Contains(text, installedInstanceID) && (strings.Contains(text, "inválido") || strings.Contains(text, "no pude")) {
			t.Fatalf("watcher logged the installed instance as an error:\n%s", text)
		}
		return nil
	})
}

// Prueba 1: el watcher ya corre y la instalación escribe el estado (directorio
// nuevo + rename atómico, y una reescritura posterior).
func TestInstalledInstanceIgnoredByLiveWatcher(t *testing.T) {
	root := t.TempDir()
	tc := &countingTemporalClient{}
	w, logs := newInertiaWatcher(t, root, tc)
	var statePath string
	runWatcherFor(t, w, func() {
		statePath = writeInstalledInstance(t, root)
		time.Sleep(200 * time.Millisecond)
		statePath = writeInstalledInstance(t, root)
	})
	assertInstanceUntouched(t, root, statePath, tc, logs)
}

// Prueba 2: el estado ya está en disco y el watcher arranca (dos veces) —
// recorre directorios existentes y corre la reconciliación inicial.
func TestInstalledInstanceIgnoredAcrossWatcherRestart(t *testing.T) {
	root := t.TempDir()
	statePath := writeInstalledInstance(t, root)
	tc := &countingTemporalClient{}
	for i := 0; i < 2; i++ {
		w, logs := newInertiaWatcher(t, root, tc)
		runWatcherFor(t, w, nil)
		assertInstanceUntouched(t, root, statePath, tc, logs)
	}
}

// Prueba 3: la reconciliación periódica, mucho después del período de gracia,
// no consulta Temporal ni escribe `reconciliation` en el registro.
func TestReconciliationScanLeavesInstalledInstanceUntouched(t *testing.T) {
	root := t.TempDir()
	statePath := writeInstalledInstance(t, root)
	tc := &countingTemporalClient{}
	w, logs := newInertiaWatcher(t, root, tc)
	defer w.logger.Close()
	for _, offset := range []time.Duration{0, unsignedMandateGracePeriod + time.Minute, 30 * 24 * time.Hour} {
		if err := w.reconcileUnsignedMandates(context.Background(), time.Now().Add(offset)); err != nil {
			t.Fatal(err)
		}
	}
	assertInstanceUntouched(t, root, statePath, tc, logs)
}
