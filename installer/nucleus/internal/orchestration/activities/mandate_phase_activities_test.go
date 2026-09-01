package activities

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"go.temporal.io/sdk/testsuite"
)

// genesisPhaseOrderFixture / genesisPhasesWithStatusSubobjectFixture — la
// secuencia concreta que usa hoy Genesis/domain_expansion (ver
// GenesisPhaseOrder en mandate_genesis_build_workflow.go). AdvancePhaseActivity
// ya no la conoce de memoria — estos tests se la pasan como cualquier otro
// caller lo haría.
var genesisPhaseOrderFixture = []string{"ingest", "cluster", "validate", "signed", "completed"}
var genesisPhasesWithStatusSubobjectFixture = map[string]bool{"ingest": true, "cluster": true, "validate": true}

// runAdvancePhase invoca AdvancePhaseActivity a través de
// testsuite.TestActivityEnvironment en vez de llamarla como función Go
// directa. CAMBIO (esta sesión, logging homologado): AdvancePhaseActivity
// ahora usa activity.GetLogger(ctx), que requiere un contexto de activity
// real poblado por el SDK de Temporal — un context.Background() plano
// panickea (getActivityOutboundInterceptor sobre un contexto vacío). Este
// es el mecanismo estándar de Temporal para testear activities que usan
// GetLogger/GetInfo/heartbeat.
func runAdvancePhase(t *testing.T, input AdvancePhaseInput) (AdvancePhaseResult, error) {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	env.RegisterActivity(AdvancePhaseActivity)
	val, err := env.ExecuteActivity(AdvancePhaseActivity, input)
	if err != nil {
		return AdvancePhaseResult{}, err
	}
	var result AdvancePhaseResult
	if decodeErr := val.Get(&result); decodeErr != nil {
		t.Fatalf("no pude decodificar el resultado de AdvancePhaseActivity: %v", decodeErr)
	}
	return result, nil
}

// writePhaseStateFixture escribe un mandate_state.json con la forma real de
// initialGenesisMandateState (internal/orchestration/commands/mandate.go) —
// currentPhase: currentPhase, phases.ingest/cluster/validate con su propio
// sub-objeto status:"pending". writeGenesisStateFixture (en
// mandate_genesis_sign_activity_test.go) no sirve acá porque no setea
// currentPhase ni phases.ingest/cluster, que es justamente lo que
// AdvancePhaseActivity necesita para poder validar la transición.
func writePhaseStateFixture(t *testing.T, root, mandateID, currentPhase string) string {
	t.Helper()
	dir := filepath.Join(root, mandateID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	state := map[string]interface{}{
		"mandateId":    mandateID,
		"mandateType":  "genesis",
		"project":      "fixture",
		"status":       "building",
		"currentPhase": currentPhase,
		"phases": map[string]interface{}{
			"ingest":  map[string]interface{}{"status": "pending"},
			"cluster": map[string]interface{}{"status": "pending"},
			"validate": map[string]interface{}{
				"status":    "pending",
				"humanSync": map[string]interface{}{"candidateDomains": []interface{}{}},
			},
		},
		"stateVersion": 1,
		"updatedAt":    "initial",
		"signature": map[string]interface{}{
			"status": "not_ready", "intentId": nil,
			"artifacts": map[string]interface{}{"reception": nil, "domainProposal": nil, "humanSyncPersisted": false},
			"pendingAt": nil, "signedAt": nil, "failedAt": nil, "failure": nil,
		},
	}
	raw, _ := json.Marshal(state)
	path := filepath.Join(dir, "mandate_state.json")
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestAdvancePhaseActivityAdvancesCurrentPhaseAndMarksPhaseCompleted(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-phase-ingest"
	path := writePhaseStateFixture(t, root, mandateID, "ingest")

	result, err := runAdvancePhase(t, AdvancePhaseInput{
		MandatesRoot:              root,
		MandateID:                 mandateID,
		Phase:                     "ingest",
		PhaseOrder:                genesisPhaseOrderFixture,
		PhasesWithStatusSubobject: genesisPhasesWithStatusSubobjectFixture,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.StateVersion != 2 {
		t.Fatalf("StateVersion = %d, want 2 (fixture starts at 1)", result.StateVersion)
	}

	state := readGenesisStateFixture(t, path)
	if state["currentPhase"] != "cluster" {
		t.Fatalf("currentPhase = %v, want %q", state["currentPhase"], "cluster")
	}
	phases, _ := state["phases"].(map[string]interface{})
	ingest, _ := phases["ingest"].(map[string]interface{})
	if ingest["status"] != "completed" {
		t.Fatalf("phases.ingest.status = %v, want %q", ingest["status"], "completed")
	}
	// cluster no se toca en esta llamada — Phase:"ingest" solo cierra ingest.
	cluster, _ := phases["cluster"].(map[string]interface{})
	if cluster["status"] != "pending" {
		t.Fatalf("phases.cluster.status = %v, want unchanged %q", cluster["status"], "pending")
	}
}

func TestAdvancePhaseActivityValidateToSignedMarksValidateCompletedNoSignedSubobject(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-phase-validate"
	path := writePhaseStateFixture(t, root, mandateID, "validate")

	if _, err := runAdvancePhase(t, AdvancePhaseInput{
		MandatesRoot:              root,
		MandateID:                 mandateID,
		Phase:                     "validate",
		PhaseOrder:                genesisPhaseOrderFixture,
		PhasesWithStatusSubobject: genesisPhasesWithStatusSubobjectFixture,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	state := readGenesisStateFixture(t, path)
	if state["currentPhase"] != "signed" {
		t.Fatalf("currentPhase = %v, want %q", state["currentPhase"], "signed")
	}
	// "validate" sí está en PhasesWithStatusSubobject: Phase:"validate"
	// significa que la fase validate (que en el hook real del workflow se
	// invoca justo después de que SignMandateActivity firma con éxito)
	// terminó, así que phases.validate.status pasa a "completed" en la
	// misma escritura. "signed" en cambio no tiene sub-objeto propio en
	// phases{} — no se crea ningún phases.signed.
	phases, _ := state["phases"].(map[string]interface{})
	if _, exists := phases["signed"]; exists {
		t.Fatalf("no se esperaba phases.signed, se encontró: %+v", phases["signed"])
	}
	validate, _ := phases["validate"].(map[string]interface{})
	if validate["status"] != "completed" {
		t.Fatalf("phases.validate.status = %v, want %q", validate["status"], "completed")
	}
}

func TestAdvancePhaseActivitySignedToCompleted(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-phase-signed"
	path := writePhaseStateFixture(t, root, mandateID, "signed")

	if _, err := runAdvancePhase(t, AdvancePhaseInput{
		MandatesRoot:              root,
		MandateID:                 mandateID,
		Phase:                     "signed",
		PhaseOrder:                genesisPhaseOrderFixture,
		PhasesWithStatusSubobject: genesisPhasesWithStatusSubobjectFixture,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	state := readGenesisStateFixture(t, path)
	if state["currentPhase"] != "completed" {
		t.Fatalf("currentPhase = %v, want %q", state["currentPhase"], "completed")
	}
}

func TestAdvancePhaseActivityIsIdempotentOnRetry(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-phase-idempotent"
	writePhaseStateFixture(t, root, mandateID, "ingest")

	input := AdvancePhaseInput{
		MandatesRoot:              root,
		MandateID:                 mandateID,
		Phase:                     "ingest",
		PhaseOrder:                genesisPhaseOrderFixture,
		PhasesWithStatusSubobject: genesisPhasesWithStatusSubobjectFixture,
	}
	first, err := runAdvancePhase(t, input)
	if err != nil {
		t.Fatalf("unexpected error on first call: %v", err)
	}
	if first.StateVersion != 2 {
		t.Fatalf("StateVersion tras primer avance = %d, want 2", first.StateVersion)
	}

	// Retry de Temporal: currentPhase ya es "cluster" (== next), así que el
	// callback de Mutate debe devolver changed=false y NO reintentar la
	// validación de transición ni bumpear stateVersion.
	second, err := runAdvancePhase(t, input)
	if err != nil {
		t.Fatalf("unexpected error on retry: %v", err)
	}
	if second.StateVersion != first.StateVersion {
		t.Fatalf("retry bumpeó stateVersion: first=%d second=%d", first.StateVersion, second.StateVersion)
	}
}

func TestAdvancePhaseActivityRejectsUnknownPhase(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-phase-unknown"
	writePhaseStateFixture(t, root, mandateID, "ingest")

	if _, err := runAdvancePhase(t, AdvancePhaseInput{
		MandatesRoot: root,
		MandateID:    mandateID,
		Phase:        "bogus",
		PhaseOrder:   genesisPhaseOrderFixture,
	}); err == nil {
		t.Fatal("expected error for unknown phase, got nil")
	}
}

func TestAdvancePhaseActivityRejectsInvalidTransitionWhenStateDivergedFromCaller(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-phase-diverged"
	// El estado real ya está en "validate" (p. ej. otro worker ya lo avanzó),
	// pero este caller todavía cree que ingest fue la última fase completada.
	// currentPhase=validate, next=cluster (siguiente tras "ingest") no es un
	// paso hacia adelante válido desde "validate" — ValidateForwardOnly lo
	// rechaza igual que rechazaría un salto o un retroceso.
	writePhaseStateFixture(t, root, mandateID, "validate")

	if _, err := runAdvancePhase(t, AdvancePhaseInput{
		MandatesRoot: root,
		MandateID:    mandateID,
		Phase:        "ingest",
		PhaseOrder:   genesisPhaseOrderFixture,
	}); err == nil {
		t.Fatal("expected error for transition inconsistente con el estado real, got nil")
	}
}

func TestAdvancePhaseActivityRequiresMandatesRootAndMandateID(t *testing.T) {
	if _, err := runAdvancePhase(t, AdvancePhaseInput{Phase: "ingest", PhaseOrder: genesisPhaseOrderFixture}); err == nil {
		t.Fatal("expected error for empty MandatesRoot/MandateID, got nil")
	}
}

func TestAdvancePhaseActivityRequiresNonEmptyPhaseOrder(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-phase-no-order"
	writePhaseStateFixture(t, root, mandateID, "ingest")

	if _, err := runAdvancePhase(t, AdvancePhaseInput{
		MandatesRoot: root,
		MandateID:    mandateID,
		Phase:        "ingest",
	}); err == nil {
		t.Fatal("expected error for empty PhaseOrder, got nil")
	}
}

// TestAdvancePhaseActivityWorksWithACompletelyDifferentPhaseSequence prueba
// que AdvancePhaseActivity no tiene ningún conocimiento hardcodeado de
// Genesis — un caller hipotético con una secuencia de fases totalmente
// distinta (p. ej. un mandate de tipo "review": draft → review → approved)
// funciona igual, sin tocar este archivo.
func TestAdvancePhaseActivityWorksWithACompletelyDifferentPhaseSequence(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-phase-review-flow"
	dir := filepath.Join(root, mandateID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	state := map[string]interface{}{
		"mandateId":    mandateID,
		"mandateType":  "review", // tipo hipotético, no existe hoy en el repo
		"currentPhase": "draft",
		"phases": map[string]interface{}{
			"draft": map[string]interface{}{"status": "pending"},
		},
		"stateVersion": 1,
	}
	raw, _ := json.Marshal(state)
	path := filepath.Join(dir, "mandate_state.json")
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}

	reviewPhaseOrder := []string{"draft", "review", "approved"}
	reviewPhasesWithStatusSubobject := map[string]bool{"draft": true}

	if _, err := runAdvancePhase(t, AdvancePhaseInput{
		MandatesRoot:              root,
		MandateID:                 mandateID,
		Phase:                     "draft",
		PhaseOrder:                reviewPhaseOrder,
		PhasesWithStatusSubobject: reviewPhasesWithStatusSubobject,
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	got := readGenesisStateFixture(t, path)
	if got["currentPhase"] != "review" {
		t.Fatalf("currentPhase = %v, want %q", got["currentPhase"], "review")
	}
}
