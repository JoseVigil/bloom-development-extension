package activities

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"go.temporal.io/sdk/testsuite"
)

// runPersistExecutionResult invoca PersistExecutionResultActivity a través
// de testsuite.TestActivityEnvironment en vez de llamarla como función Go
// directa. CAMBIO (esta sesión, logging homologado): PersistExecutionResultActivity
// ahora usa activity.GetLogger(ctx), que requiere un contexto de activity
// real poblado por el SDK de Temporal — un context.Background() plano
// panickea. Mismo mecanismo que runAdvancePhase en mandate_phase_activities_test.go.
func runPersistExecutionResult(t *testing.T, input PersistExecutionResultInput) (PersistExecutionResultResult, error) {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	env.RegisterActivity(PersistExecutionResultActivity)
	val, err := env.ExecuteActivity(PersistExecutionResultActivity, input)
	if err != nil {
		return PersistExecutionResultResult{}, err
	}
	var result PersistExecutionResultResult
	if decodeErr := val.Get(&result); decodeErr != nil {
		t.Fatalf("no pude decodificar el resultado de PersistExecutionResultActivity: %v", decodeErr)
	}
	return result, nil
}

func TestPersistExecutionResultActivityWritesUnderExecutePhaseActions(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-execute"
	writeGenesisStateFixture(t, root, mandateID)
	path := filepath.Join(root, mandateID, "mandate_state.json")

	result, err := runPersistExecutionResult(t, PersistExecutionResultInput{
		MandatesRoot: root,
		MandateID:    mandateID,
		ActionID:     "action-1",
		DomainName:   "Billing",
		ResultRef:    "scaffold/domain_Billing",
		Status:       "completed",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.StateVersion != 2 {
		t.Fatalf("StateVersion = %d, want 2 (fixture starts at 1)", result.StateVersion)
	}

	state := readGenesisStateFixture(t, path)
	phases, _ := state["phases"].(map[string]interface{})
	execute, _ := phases["execute"].(map[string]interface{})
	actionsRecord, _ := execute["actions"].(map[string]interface{})
	record, ok := actionsRecord["action-1"].(map[string]interface{})
	if !ok {
		t.Fatalf("phases.execute.actions[action-1] not found in %+v", phases)
	}
	if record["domainName"] != "Billing" || record["status"] != "completed" || record["resultRef"] != "scaffold/domain_Billing" {
		t.Fatalf("unexpected record: %+v", record)
	}
}

func TestPersistExecutionResultActivityIsIdempotent(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-execute-idempotent"
	writeGenesisStateFixture(t, root, mandateID)

	input := PersistExecutionResultInput{
		MandatesRoot: root,
		MandateID:    mandateID,
		ActionID:     "action-1",
		DomainName:   "Billing",
		ResultRef:    "scaffold/domain_Billing",
		Status:       "completed",
	}
	first, err := runPersistExecutionResult(t, input)
	if err != nil {
		t.Fatalf("unexpected error on first call: %v", err)
	}
	second, err := runPersistExecutionResult(t, input)
	if err != nil {
		t.Fatalf("unexpected error on retry: %v", err)
	}
	if second.StateVersion != first.StateVersion {
		t.Fatalf("retry with identical input bumped stateVersion: first=%d second=%d", first.StateVersion, second.StateVersion)
	}
}

func TestPersistExecutionResultActivityFallsBackToDomainNameWhenActionIDEmpty(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-execute-no-actionid"
	writeGenesisStateFixture(t, root, mandateID)
	path := filepath.Join(root, mandateID, "mandate_state.json")

	if _, err := runPersistExecutionResult(t, PersistExecutionResultInput{
		MandatesRoot: root,
		MandateID:    mandateID,
		DomainName:   "Billing",
		Status:       "failed",
		Error:        "scaffold real falló",
	}); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var state map[string]interface{}
	if err := json.Unmarshal(raw, &state); err != nil {
		t.Fatal(err)
	}
	phases, _ := state["phases"].(map[string]interface{})
	execute, _ := phases["execute"].(map[string]interface{})
	actionsRecord, _ := execute["actions"].(map[string]interface{})
	record, ok := actionsRecord["Billing"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected fallback key 'Billing' in %+v", actionsRecord)
	}
	if record["status"] != "failed" || record["error"] != "scaffold real falló" {
		t.Fatalf("unexpected record: %+v", record)
	}
}
