// internal/orchestration/temporal/temporal_client_test.go
//
// Test de verificación de Etapa 3 (PROMPT-EJECUCION-synapse-switch-organization.md):
// "una query (workflow.Query de Temporal, o el mecanismo que G1 termine
// usando) que devuelva true/false para '¿hay algo no-terminal para esta
// organización?' contra un Mandate real en ejecución de prueba."
//
// Es un test de integración real contra un Temporal Server — no un
// TestWorkflowEnvironment de unidad (testsuite.TestWorkflowEnvironment no
// sirve acá: HasNonTerminalMandateWork llama a client.DescribeWorkflowExecution
// contra un servidor real vía RPC, no contra el motor de replay en memoria
// que ese test suite simula). Requiere `temporal server start-dev` corriendo
// en localhost:7233 — el mismo servidor que ya levanta
// internal/supervisor.startTemporalServer() en desarrollo normal. Si no está
// disponible, el test se salta explícitamente (t.Skip), no falla en falso.
package temporal

import (
	"context"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"
)

const testTaskQueue = "etapa3-verification-queue"

// dummyLongRunningWorkflow se queda esperando la señal "finish" antes de
// terminar — es el único comportamiento que este test necesita: darle a
// HasNonTerminalMandateWork una ventana real donde el workflow está RUNNING,
// controlada de forma determinística (no un sleep con timing implícito).
// No implementa nada de MandateExecutionWorkflow/DomainAction a propósito —
// ver nota de diseño en temporal_client.go sobre por qué Etapa 3 no toca
// esos tipos.
func dummyLongRunningWorkflow(ctx workflow.Context) error {
	finished := false
	sel := workflow.NewSelector(ctx)
	sel.AddReceive(workflow.GetSignalChannel(ctx, "finish"), func(c workflow.ReceiveChannel, more bool) {
		c.Receive(ctx, nil)
		finished = true
	})
	for !finished {
		sel.Select(ctx)
	}
	return nil
}

// requireLocalTemporal salta el test si no hay un Temporal Server real
// escuchando en localhost:7233 — mismo chequeo (net.DialTimeout) que ya usa
// internal/supervisor.startTemporalServer() para decidir si necesita
// arrancar uno nuevo.
func requireLocalTemporal(t *testing.T) {
	t.Helper()
	conn, err := net.DialTimeout("tcp", "localhost:7233", 1*time.Second)
	if err != nil {
		t.Skip("Temporal Server no disponible en localhost:7233 — correr 'temporal server start-dev' para ejecutar este test de integración")
	}
	conn.Close()
}

// TestHasNonTerminalMandateWork_DetectsRunningAndCompleted es el test
// central: arranca un workflow real con el WorkflowID que
// HasNonTerminalMandateWork espera (mandate_genesis_{mandateID}), confirma
// que se detecta como no-terminal mientras corre, lo señaliza para que
// termine, y confirma que deja de detectarse.
func TestHasNonTerminalMandateWork_DetectsRunningAndCompleted(t *testing.T) {
	requireLocalTemporal(t)

	ctx := context.Background()

	rawClient, err := client.Dial(client.Options{HostPort: "localhost:7233", Namespace: "default"})
	if err != nil {
		t.Fatalf("client.Dial() error: %v", err)
	}
	defer rawClient.Close()

	// Construcción directa de Client{} (no vía NewClient) — este test vive
	// en package temporal (test interno, no _test externo) precisamente
	// para poder setear el campo no exportado `client` sin necesitar
	// core.Paths/logger, que NewClient() sí requiere y que acá no aportan
	// nada a lo que este test verifica.
	tc := &Client{client: rawClient}

	w := worker.New(rawClient, testTaskQueue, worker.Options{})
	w.RegisterWorkflow(dummyLongRunningWorkflow)
	workerStopped := make(chan struct{})
	go func() {
		defer close(workerStopped)
		_ = w.Run(worker.InterruptCh())
	}()
	defer func() {
		w.Stop()
		<-workerStopped
	}()

	mandateID := "etapa3-verify-" + time.Now().Format("20060102-150405.000000000")

	mandatesRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(mandatesRoot, mandateID), 0755); err != nil {
		t.Fatalf("failed to create fake mandate dir: %v", err)
	}

	workflowID := "mandate_genesis_" + mandateID
	we, err := rawClient.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
		ID:        workflowID,
		TaskQueue: testTaskQueue,
	}, dummyLongRunningWorkflow)
	if err != nil {
		t.Fatalf("ExecuteWorkflow() error: %v", err)
	}
	t.Cleanup(func() {
		_ = rawClient.SignalWorkflow(context.Background(), workflowID, "", "finish", nil)
	})

	// 1. Mientras corre: HasNonTerminalMandateWork debe verlo.
	nonTerminal, ids, err := tc.HasNonTerminalMandateWork(ctx, mandatesRoot)
	if err != nil {
		t.Fatalf("HasNonTerminalMandateWork() error (workflow running): %v", err)
	}
	if !nonTerminal {
		t.Fatalf("HasNonTerminalMandateWork() = false mientras %s está RUNNING, want true", workflowID)
	}
	found := false
	for _, id := range ids {
		if id == workflowID {
			found = true
		}
	}
	if !found {
		t.Fatalf("HasNonTerminalMandateWork() ids = %v, want incluir %q", ids, workflowID)
	}

	// 2. Señalizar y esperar a que termine de verdad (no asumir timing).
	if err := rawClient.SignalWorkflow(ctx, workflowID, "", "finish", nil); err != nil {
		t.Fatalf("SignalWorkflow() error: %v", err)
	}
	if err := we.Get(ctx, nil); err != nil {
		t.Fatalf("workflow no terminó limpio tras la señal: %v", err)
	}

	// 3. Ya terminado: HasNonTerminalMandateWork no debe verlo más.
	nonTerminal, ids, err = tc.HasNonTerminalMandateWork(ctx, mandatesRoot)
	if err != nil {
		t.Fatalf("HasNonTerminalMandateWork() error (workflow completed): %v", err)
	}
	if nonTerminal {
		t.Fatalf("HasNonTerminalMandateWork() = true tras completar %s, want false (ids=%v)", workflowID, ids)
	}
}

// TestHasNonTerminalMandateWork_NoMandatesDir cubre el caso donde la
// organización todavía no tiene ningún Mandate — .mandates/ ni siquiera
// existe. No debe tratarse como error.
func TestHasNonTerminalMandateWork_NoMandatesDir(t *testing.T) {
	requireLocalTemporal(t)

	ctx := context.Background()
	rawClient, err := client.Dial(client.Options{HostPort: "localhost:7233", Namespace: "default"})
	if err != nil {
		t.Fatalf("client.Dial() error: %v", err)
	}
	defer rawClient.Close()

	tc := &Client{client: rawClient}

	missingDir := filepath.Join(t.TempDir(), "nunca-existio", ".mandates")
	nonTerminal, ids, err := tc.HasNonTerminalMandateWork(ctx, missingDir)
	if err != nil {
		t.Fatalf("HasNonTerminalMandateWork() con .mandates inexistente: want nil error, got %v", err)
	}
	if nonTerminal || len(ids) != 0 {
		t.Fatalf("HasNonTerminalMandateWork() con .mandates inexistente = (%v, %v), want (false, [])", nonTerminal, ids)
	}
}
