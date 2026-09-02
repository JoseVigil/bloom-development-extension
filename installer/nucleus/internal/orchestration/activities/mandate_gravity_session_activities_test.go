package activities

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"go.temporal.io/sdk/testsuite"

	"nucleus/internal/gravity"
)

// ─────────────────────────────────────────────────────────────────────────
// Fixture: una espina Gravity mínima NUCLEUS→ORGANIZATION→PROJECT ya
// existente (lo que EnsureGravityMandateNodeActivity espera encontrar,
// nunca crea) bajo un nucleusRoot real de test, más .nucleus-governance.json
// con el mismo org_id. Mismo layout que
// internal/gravity/resolver_test.go:createResolutionTree, reimplementado
// acá porque atomicWriteNode/testNode/ptr son símbolos internos de package
// gravity, no exportados.
// ─────────────────────────────────────────────────────────────────────────

func seedNodeDirect(t *testing.T, path string, node gravity.GravityNode) {
	t.Helper()
	node.NodeVersion = 1
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	raw, err := json.MarshalIndent(node, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, raw, 0644); err != nil {
		t.Fatal(err)
	}
}

func gravityStrPtr(s string) *string { return &s }

// gravitySpineFixture arma nucleusRoot/.nucleus-governance.json +
// nucleusRoot/.gravity/{nucleus,organization,project} ya existentes.
// Devuelve nucleusRoot, mandatesRoot (nucleusRoot/.mandates, mismo
// criterio que mandatesRootForWorker en worker.go), orgID y projectID.
func gravitySpineFixture(t *testing.T) (nucleusRoot, mandatesRoot, orgID, projectID string) {
	t.Helper()
	nucleusRoot = t.TempDir()
	orgID = "org-fixture"
	projectID = "proj-fixture"

	governance := map[string]interface{}{
		"org_identity": map[string]interface{}{"org_id": orgID},
	}
	raw, err := json.Marshal(governance)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".nucleus-governance.json"), raw, 0644); err != nil {
		t.Fatal(err)
	}

	store, err := gravity.NewStore(nucleusRoot)
	if err != nil {
		t.Fatal(err)
	}
	seedNodeDirect(t, filepath.Join(store.Root, "nucleus.node.json"), gravity.GravityNode{
		NodeID: "nucleus-fixture", NodeType: gravity.NodeNucleus, Status: gravity.NodeActive,
	})
	seedNodeDirect(t, filepath.Join(store.Root, ".organization", orgID, "node.json"), gravity.GravityNode{
		NodeID: orgID, NodeType: gravity.NodeOrganization, ParentID: gravityStrPtr("nucleus-fixture"), Status: gravity.NodeActive,
	})
	if err := store.CreateNode(filepath.Join(store.Root, ".organization", orgID, ".project", projectID, "node.json"), gravity.GravityNode{
		NodeID: projectID, NodeType: gravity.NodeProject, ParentID: gravityStrPtr(orgID), Status: gravity.NodeActive,
	}); err != nil {
		t.Fatal(err)
	}

	mandatesRoot = filepath.Join(nucleusRoot, ".mandates")
	if err := os.MkdirAll(mandatesRoot, 0755); err != nil {
		t.Fatal(err)
	}
	return nucleusRoot, mandatesRoot, orgID, projectID
}

// ─────────────────────────────────────────────────────────────────────────
// EnsureGravityMandateNodeActivity
// ─────────────────────────────────────────────────────────────────────────

func runEnsureGravityMandateNode(t *testing.T, input EnsureGravityMandateNodeInput) (EnsureGravityMandateNodeResult, error) {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	env.RegisterActivity(EnsureGravityMandateNodeActivity)
	val, err := env.ExecuteActivity(EnsureGravityMandateNodeActivity, input)
	if err != nil {
		return EnsureGravityMandateNodeResult{}, err
	}
	var result EnsureGravityMandateNodeResult
	if decodeErr := val.Get(&result); decodeErr != nil {
		t.Fatalf("no pude decodificar resultado: %v", decodeErr)
	}
	return result, nil
}

func TestEnsureGravityMandateNodeActivityCreatesUnderExistingProject(t *testing.T) {
	_, mandatesRoot, _, projectID := gravitySpineFixture(t)

	result, err := runEnsureGravityMandateNode(t, EnsureGravityMandateNodeInput{
		MandatesRoot: mandatesRoot, MandateID: "mandate-1", ProjectID: projectID,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Created {
		t.Fatalf("expected Created=true on first call, got %+v", result)
	}
	if _, statErr := os.Stat(result.MandateNodePath); statErr != nil {
		t.Fatalf("expected MANDATE node.json to exist at %s: %v", result.MandateNodePath, statErr)
	}
}

func TestEnsureGravityMandateNodeActivityIsIdempotent(t *testing.T) {
	_, mandatesRoot, _, projectID := gravitySpineFixture(t)
	input := EnsureGravityMandateNodeInput{MandatesRoot: mandatesRoot, MandateID: "mandate-retry", ProjectID: projectID}

	first, err := runEnsureGravityMandateNode(t, input)
	if err != nil {
		t.Fatalf("unexpected error on first call: %v", err)
	}
	second, err := runEnsureGravityMandateNode(t, input)
	if err != nil {
		t.Fatalf("unexpected error on retry: %v", err)
	}
	if second.Created {
		t.Fatalf("expected Created=false on retry (reused, not duplicated), got %+v", second)
	}
	if second.MandateNodePath != first.MandateNodePath {
		t.Fatalf("retry produced a different node path: first=%s second=%s", first.MandateNodePath, second.MandateNodePath)
	}
}

func TestEnsureGravityMandateNodeActivityFailsClosedWithoutProjectID(t *testing.T) {
	_, mandatesRoot, _, _ := gravitySpineFixture(t)
	if _, err := runEnsureGravityMandateNode(t, EnsureGravityMandateNodeInput{MandatesRoot: mandatesRoot, MandateID: "mandate-x"}); err == nil {
		t.Fatal("expected error when ProjectID is empty, got nil")
	}
}

func TestEnsureGravityMandateNodeActivityFailsClosedWhenProjectMissing(t *testing.T) {
	_, mandatesRoot, _, _ := gravitySpineFixture(t)
	if _, err := runEnsureGravityMandateNode(t, EnsureGravityMandateNodeInput{
		MandatesRoot: mandatesRoot, MandateID: "mandate-x", ProjectID: "no-existe",
	}); err == nil {
		t.Fatal("expected error when PROJECT node does not exist, got nil")
	}
}

func TestEnsureGravityMandateNodeActivityFailsClosedWhenOrganizationMissing(t *testing.T) {
	nucleusRoot := t.TempDir()
	// .nucleus-governance.json existe, pero no hay ningún nodo ORGANIZATION
	// bajo .gravity/.organization/{orgId}/ — espina inconsistente.
	raw, _ := json.Marshal(map[string]interface{}{"org_identity": map[string]interface{}{"org_id": "org-huerfano"}})
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".nucleus-governance.json"), raw, 0644); err != nil {
		t.Fatal(err)
	}
	mandatesRoot := filepath.Join(nucleusRoot, ".mandates")
	if err := os.MkdirAll(mandatesRoot, 0755); err != nil {
		t.Fatal(err)
	}

	if _, err := runEnsureGravityMandateNode(t, EnsureGravityMandateNodeInput{
		MandatesRoot: mandatesRoot, MandateID: "mandate-x", ProjectID: "cualquiera",
	}); err == nil {
		t.Fatal("expected error when ORGANIZATION node does not exist, got nil")
	}
}

// ─────────────────────────────────────────────────────────────────────────
// CreateGravitySessionActivity
// ─────────────────────────────────────────────────────────────────────────

func runCreateGravitySession(t *testing.T, input CreateGravitySessionInput) (CreateGravitySessionResult, error) {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	env.RegisterActivity(CreateGravitySessionActivity)
	val, err := env.ExecuteActivity(CreateGravitySessionActivity, input)
	if err != nil {
		return CreateGravitySessionResult{}, err
	}
	var result CreateGravitySessionResult
	if decodeErr := val.Get(&result); decodeErr != nil {
		t.Fatalf("no pude decodificar resultado: %v", decodeErr)
	}
	return result, nil
}

func TestCreateGravitySessionActivityCreatesUnderExistingMandate(t *testing.T) {
	nucleusRoot, mandatesRoot, _, projectID := gravitySpineFixture(t)
	mandateResult, err := runEnsureGravityMandateNode(t, EnsureGravityMandateNodeInput{
		MandatesRoot: mandatesRoot, MandateID: "mandate-1", ProjectID: projectID,
	})
	if err != nil {
		t.Fatalf("fixture setup: %v", err)
	}

	result, err := runCreateGravitySession(t, CreateGravitySessionInput{
		NucleusRoot: nucleusRoot, MandateNodePath: mandateResult.MandateNodePath, MandateID: "mandate-1", SessionID: "session-1",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.Created {
		t.Fatalf("expected Created=true, got %+v", result)
	}
}

func TestCreateGravitySessionActivityIsIdempotent(t *testing.T) {
	nucleusRoot, mandatesRoot, _, projectID := gravitySpineFixture(t)
	mandateResult, err := runEnsureGravityMandateNode(t, EnsureGravityMandateNodeInput{
		MandatesRoot: mandatesRoot, MandateID: "mandate-1", ProjectID: projectID,
	})
	if err != nil {
		t.Fatalf("fixture setup: %v", err)
	}
	input := CreateGravitySessionInput{
		NucleusRoot: nucleusRoot, MandateNodePath: mandateResult.MandateNodePath, MandateID: "mandate-1", SessionID: "session-retry",
	}

	first, err := runCreateGravitySession(t, input)
	if err != nil {
		t.Fatalf("unexpected error on first call: %v", err)
	}
	second, err := runCreateGravitySession(t, input)
	if err != nil {
		t.Fatalf("unexpected error on retry: %v", err)
	}
	if second.Created {
		t.Fatalf("expected Created=false on retry, got %+v", second)
	}
	if second.SessionNodePath != first.SessionNodePath {
		t.Fatalf("retry produced a different session path")
	}
}

func TestCreateGravitySessionActivityFailsClosedWithoutMandate(t *testing.T) {
	nucleusRoot, _, _, _ := gravitySpineFixture(t)
	store, err := gravity.NewStore(nucleusRoot)
	if err != nil {
		t.Fatal(err)
	}
	missingMandatePath := filepath.Join(store.Root, ".organization", "org-fixture", ".project", "proj-fixture", ".mandate", "no-existe", "node.json")

	if _, err := runCreateGravitySession(t, CreateGravitySessionInput{
		NucleusRoot: nucleusRoot, MandateNodePath: missingMandatePath, MandateID: "no-existe", SessionID: "session-1",
	}); err == nil {
		t.Fatal("expected error when MANDATE node does not exist, got nil")
	}
}

// ─────────────────────────────────────────────────────────────────────────
// PersistExecutionGravityActivity
// ─────────────────────────────────────────────────────────────────────────

func runPersistExecutionGravity(t *testing.T, input PersistExecutionGravityInput) (PersistExecutionGravityResult, error) {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestActivityEnvironment()
	env.RegisterActivity(PersistExecutionGravityActivity)
	val, err := env.ExecuteActivity(PersistExecutionGravityActivity, input)
	if err != nil {
		return PersistExecutionGravityResult{}, err
	}
	var result PersistExecutionGravityResult
	if decodeErr := val.Get(&result); decodeErr != nil {
		t.Fatalf("no pude decodificar resultado: %v", decodeErr)
	}
	return result, nil
}

func TestPersistExecutionGravityActivityWritesUnderExecutePhaseGravity(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-gravity"
	writeGenesisStateFixture(t, root, mandateID)

	input := PersistExecutionGravityInput{
		MandatesRoot: root, MandateID: mandateID, SessionID: "session-1", IntentType: "gen", Turn: 1,
		Result: gravity.ResolveResult{Collected: []gravity.ResolvedPosture{{
			GravityPosture: gravity.GravityPosture{PostureID: "p1", AppliesTo: []string{"gen"}, Status: "active"},
			NodeType:       gravity.NodeMandate, NodeID: mandateID,
		}}},
	}
	result, err := runPersistExecutionGravity(t, input)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.StateVersion != 2 {
		t.Fatalf("StateVersion = %d, want 2 (fixture starts at 1)", result.StateVersion)
	}

	path := filepath.Join(root, mandateID, "mandate_state.json")
	state := readGenesisStateFixture(t, path)
	phases, _ := state["phases"].(map[string]interface{})
	execute, _ := phases["execute"].(map[string]interface{})
	gravityRecord, ok := execute["gravity"].(map[string]interface{})
	if !ok {
		t.Fatalf("phases.execute.gravity not found in %+v", phases)
	}
	if gravityRecord["sessionId"] != "session-1" || gravityRecord["intentType"] != "gen" {
		t.Fatalf("unexpected record: %+v", gravityRecord)
	}
	if gravityRecord["collectedCount"] != float64(1) {
		t.Fatalf("collectedCount = %v, want 1", gravityRecord["collectedCount"])
	}
}

func TestPersistExecutionGravityActivityIsIdempotent(t *testing.T) {
	root := t.TempDir()
	mandateID := "fixture-gravity-idempotent"
	writeGenesisStateFixture(t, root, mandateID)

	input := PersistExecutionGravityInput{
		MandatesRoot: root, MandateID: mandateID, SessionID: "session-1", IntentType: "gen", Turn: 1,
		Result: gravity.ResolveResult{Collected: []gravity.ResolvedPosture{}},
	}
	first, err := runPersistExecutionGravity(t, input)
	if err != nil {
		t.Fatalf("unexpected error on first call: %v", err)
	}
	second, err := runPersistExecutionGravity(t, input)
	if err != nil {
		t.Fatalf("unexpected error on retry: %v", err)
	}
	if second.StateVersion != first.StateVersion {
		t.Fatalf("retry with identical input (salvo resolvedAt) bumped stateVersion: first=%d second=%d", first.StateVersion, second.StateVersion)
	}
}
