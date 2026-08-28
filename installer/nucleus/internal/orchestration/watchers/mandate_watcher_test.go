package watchers

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"go.temporal.io/sdk/client"

	"nucleus/internal/orchestration/temporal"
	"nucleus/internal/orchestration/temporal/workflows"
)

func TestMandateGenesisDispatchClassifiesLiveDuplicate(t *testing.T) {
	if got := classifyGenesisDuplicate(true, nil); got != genesisDuplicateActive {
		t.Fatalf("classification = %q, want %q", got, genesisDuplicateActive)
	}
}

func TestMandateGenesisDispatchClassifiesHistoricalDuplicate(t *testing.T) {
	if got := classifyGenesisDuplicate(false, nil); got != genesisDuplicateHistorical {
		t.Fatalf("classification = %q, want %q", got, genesisDuplicateHistorical)
	}
}

func TestMandateGenesisDispatchPreservesClassificationFailure(t *testing.T) {
	if got := classifyGenesisDuplicate(false, errors.New("describe failed")); got != genesisDuplicateUnclassified {
		t.Fatalf("classification = %q, want %q", got, genesisDuplicateUnclassified)
	}
}

type syntheticGenesisTemporalClient struct {
	state temporal.WorkflowExecutionState
	err   error
}

func (f *syntheticGenesisTemporalClient) StartMandateGenesisBuildWorkflow(context.Context, string, workflows.GenesisBuildInput) (client.WorkflowRun, error) {
	return nil, nil
}
func (f *syntheticGenesisTemporalClient) IsWorkflowRunning(context.Context, string) (bool, error) {
	return f.state == temporal.WorkflowExecutionRunning, f.err
}
func (f *syntheticGenesisTemporalClient) GetWorkflowExecutionState(context.Context, string) (temporal.WorkflowExecutionState, error) {
	return f.state, f.err
}

func syntheticMandateState(t *testing.T, root string, updatedAt time.Time) string {
	t.Helper()
	dir := filepath.Join(root, "mandate-synthetic")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	fixture := map[string]interface{}{
		"mandateId": "mandate-synthetic", "mandateType": "genesis", "status": "building",
		"currentPhase": "ingest", "stateVersion": 1, "updatedAt": updatedAt.UTC().Format(time.RFC3339),
		"signature": map[string]interface{}{"status": "not_ready"},
		"phases":    map[string]interface{}{"ingest": map[string]interface{}{"status": "pending"}, "cluster": map[string]interface{}{"status": "pending"}},
		"preserved": map[string]interface{}{"value": "keep"},
	}
	data, _ := json.Marshal(fixture)
	path := filepath.Join(dir, "mandate_state.json")
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
	return path
}

func readSyntheticState(t *testing.T, path string) map[string]interface{} {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var state map[string]interface{}
	if err := json.Unmarshal(raw, &state); err != nil {
		t.Fatal(err)
	}
	return state
}

func TestUnsignedMandateGracePeriodIsFifteenMinutes(t *testing.T) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	ms := MandateState{StateVersion: 1, UpdatedAt: now.Add(-unsignedMandateGracePeriod + time.Second).Format(time.RFC3339)}
	if gracePeriodElapsed(ms, now) {
		t.Fatal("grace period elapsed one second too early")
	}
	ms.UpdatedAt = now.Add(-unsignedMandateGracePeriod).Format(time.RFC3339)
	if !gracePeriodElapsed(ms, now) {
		t.Fatal("grace period did not elapse at fifteen minutes")
	}
}

func TestReconcileMarksMissingWorkflowRequiredAfterGraceAndPreservesFields(t *testing.T) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	path := syntheticMandateState(t, t.TempDir(), now.Add(-unsignedMandateGracePeriod))
	w := &MandateWatcher{tc: &syntheticGenesisTemporalClient{state: temporal.WorkflowExecutionNotFound}}
	var ms MandateState
	raw, _ := os.ReadFile(path)
	_ = json.Unmarshal(raw, &ms)
	if err := w.reconcileUnsignedMandate(context.Background(), path, ms, now); err != nil {
		t.Fatal(err)
	}
	state := readSyntheticState(t, path)
	reconciliation := state["reconciliation"].(map[string]interface{})
	if reconciliation["status"] != "required" || reconciliation["reason"] != "unsigned_without_active_workflow" {
		t.Fatalf("reconciliation = %#v", reconciliation)
	}
	if state["stateVersion"].(float64) != 2 || state["preserved"].(map[string]interface{})["value"] != "keep" {
		t.Fatalf("state was not versioned/preserved: %#v", state)
	}
}

func TestReconcileTemporalUnavailableIsUnknownNeverFailed(t *testing.T) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	path := syntheticMandateState(t, t.TempDir(), now.Add(-time.Hour))
	w := &MandateWatcher{tc: &syntheticGenesisTemporalClient{state: temporal.WorkflowExecutionUnknown, err: errors.New("unavailable")}}
	var ms MandateState
	raw, _ := os.ReadFile(path)
	_ = json.Unmarshal(raw, &ms)
	if err := w.reconcileUnsignedMandate(context.Background(), path, ms, now); err != nil {
		t.Fatal(err)
	}
	state := readSyntheticState(t, path)
	if state["reconciliation"].(map[string]interface{})["status"] != "unknown" {
		t.Fatalf("reconciliation = %#v", state["reconciliation"])
	}
	if state["signature"].(map[string]interface{})["status"] == "failed" {
		t.Fatal("Temporal unavailability was converted into signature failure")
	}
}

func TestReconcileTerminalWorkflowMarksFailedIdempotently(t *testing.T) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	path := syntheticMandateState(t, t.TempDir(), now)
	w := &MandateWatcher{tc: &syntheticGenesisTemporalClient{state: temporal.WorkflowExecutionFailed}}
	var ms MandateState
	raw, _ := os.ReadFile(path)
	_ = json.Unmarshal(raw, &ms)
	if err := w.reconcileUnsignedMandate(context.Background(), path, ms, now); err != nil {
		t.Fatal(err)
	}
	first := readSyntheticState(t, path)
	raw, _ = os.ReadFile(path)
	_ = json.Unmarshal(raw, &ms)
	if err := w.reconcileUnsignedMandate(context.Background(), path, ms, now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	second := readSyntheticState(t, path)
	if first["stateVersion"] != second["stateVersion"] {
		t.Fatalf("reconciliation was not idempotent: first=%v second=%v", first["stateVersion"], second["stateVersion"])
	}
}

func TestReconcileSignedMandateDoesNotTouchState(t *testing.T) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	path := syntheticMandateState(t, t.TempDir(), now.Add(-time.Hour))
	mandatePath := filepath.Join(filepath.Dir(path), "mandate.json")
	if err := os.WriteFile(mandatePath, []byte(`{"status":"signed"}`), 0644); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var ms MandateState
	if err := json.Unmarshal(before, &ms); err != nil {
		t.Fatal(err)
	}
	w := &MandateWatcher{tc: &syntheticGenesisTemporalClient{state: temporal.WorkflowExecutionFailed}}
	if err := w.reconcileUnsignedMandate(context.Background(), path, ms, now); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(before) {
		t.Fatal("signed mandate state was modified")
	}
}

func TestReconcileRunningWorkflowDoesNotMarkMissingOrFailed(t *testing.T) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	path := syntheticMandateState(t, t.TempDir(), now.Add(-time.Hour))
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var ms MandateState
	if err := json.Unmarshal(before, &ms); err != nil {
		t.Fatal(err)
	}
	w := &MandateWatcher{tc: &syntheticGenesisTemporalClient{state: temporal.WorkflowExecutionRunning}}
	if err := w.reconcileUnsignedMandate(context.Background(), path, ms, now); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(before) {
		t.Fatal("RUNNING workflow was marked or otherwise modified")
	}
	state := readSyntheticState(t, path)
	if _, exists := state["reconciliation"]; exists {
		t.Fatalf("RUNNING workflow has reconciliation marker: %#v", state["reconciliation"])
	}
	if state["signature"].(map[string]interface{})["status"] == "failed" {
		t.Fatal("RUNNING workflow was marked as signature failure")
	}
}

func TestReconcileNeverMutatesBrainIntentProposalOrHumanSync(t *testing.T) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	root := t.TempDir()
	path := syntheticMandateState(t, root, now.Add(-unsignedMandateGracePeriod))

	state := readSyntheticState(t, path)
	phases := state["phases"].(map[string]interface{})
	humanSync := map[string]interface{}{
		"candidateDomains":   []interface{}{"domain-a"},
		"confirmedDomainIds": []interface{}{"domain-a"},
		"confirmedBy":        "synthetic-user",
	}
	phases["validate"] = map[string]interface{}{"status": "completed", "humanSync": humanSync}
	state["phases"] = phases
	stateBytes, _ := json.Marshal(state)
	if err := os.WriteFile(path, stateBytes, 0644); err != nil {
		t.Fatal(err)
	}

	proposalPath := filepath.Join(filepath.Dir(path), "domain_proposal.json")
	proposalBefore := []byte(`{"status":"proposed","domains":[{"id":"domain-a"}]}`)
	if err := os.WriteFile(proposalPath, proposalBefore, 0644); err != nil {
		t.Fatal(err)
	}
	intentPath := filepath.Join(root, ".intents", ".ing", ".synthetic", ".ing_state.json")
	if err := os.MkdirAll(filepath.Dir(intentPath), 0755); err != nil {
		t.Fatal(err)
	}
	intentBefore := []byte(`{"mandate_id":"mandate-synthetic","phase_active":"classification"}`)
	if err := os.WriteFile(intentPath, intentBefore, 0644); err != nil {
		t.Fatal(err)
	}

	var ms MandateState
	raw, _ := os.ReadFile(path)
	if err := json.Unmarshal(raw, &ms); err != nil {
		t.Fatal(err)
	}
	w := &MandateWatcher{tc: &syntheticGenesisTemporalClient{state: temporal.WorkflowExecutionNotFound}}
	if err := w.reconcileUnsignedMandate(context.Background(), path, ms, now); err != nil {
		t.Fatal(err)
	}

	proposalAfter, err := os.ReadFile(proposalPath)
	if err != nil {
		t.Fatal(err)
	}
	intentAfter, err := os.ReadFile(intentPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(proposalAfter) != string(proposalBefore) {
		t.Fatal("domain_proposal.json was modified by reconciliation")
	}
	if string(intentAfter) != string(intentBefore) {
		t.Fatal("Brain Intent was modified by reconciliation")
	}
	afterState := readSyntheticState(t, path)
	afterHumanSync := afterState["phases"].(map[string]interface{})["validate"].(map[string]interface{})["humanSync"]
	beforeHumanSync, _ := json.Marshal(humanSync)
	afterHumanSyncBytes, _ := json.Marshal(afterHumanSync)
	if string(afterHumanSyncBytes) != string(beforeHumanSync) {
		t.Fatalf("Human Sync was modified: before=%s after=%s", beforeHumanSync, afterHumanSyncBytes)
	}
}
