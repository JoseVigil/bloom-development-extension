package genesisrecovery

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type fakeWorkflows struct {
	states map[string]WorkflowState
	err    error
}

func (f fakeWorkflows) GetMandateWorkflowStates(context.Context, string) (map[string]WorkflowState, error) {
	return f.states, f.err
}

func recoveryFixture(t *testing.T) (*Service, string, string) {
	t.Helper()
	root := t.TempDir()
	mandates := filepath.Join(root, ".mandates")
	projectID := "project-fixture"
	previous := "mandate-previous"
	dir := filepath.Join(mandates, previous)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(map[string]any{"mandateId": previous, "mandateType": "genesis", "projectId": projectID, "reconciliation": map[string]any{"status": "required"}})
	if err := os.WriteFile(filepath.Join(dir, "mandate_state.json"), raw, 0644); err != nil {
		t.Fatal(err)
	}
	svc := &Service{Store: NewStore(root), MandatesRoot: mandates, Workflows: fakeWorkflows{states: map[string]WorkflowState{"mandate_build_" + previous: WorkflowNotFound, "mandate_execution_" + previous: WorkflowNotFound}}}
	return svc, projectID, previous
}

func TestPrepareIsIdempotentAndRejectsConcurrentRequest(t *testing.T) {
	svc, projectID, previous := recoveryFixture(t)
	in := PrepareInput{ProjectID: projectID, ProjectName: "sample", Source: "core", ExpectedPreviousMandateID: previous, RecoveryRequestID: "11111111-1111-4111-8111-111111111111"}
	first, err := svc.Prepare(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := svc.Prepare(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	if replay.MandateLaunchID != first.MandateLaunchID || !replay.Replayed {
		t.Fatalf("replay = %#v, first = %#v", replay, first)
	}
	in.RecoveryRequestID = "22222222-2222-4222-8222-222222222222"
	if _, err := svc.Prepare(context.Background(), in); ErrorCode(err) != "RECOVERY_IN_PROGRESS" {
		t.Fatalf("error = %v", err)
	}
}

func TestAcknowledgeSupersedesOnlyAfterReplacementExists(t *testing.T) {
	svc, projectID, previous := recoveryFixture(t)
	in := PrepareInput{ProjectID: projectID, ProjectName: "sample", Source: "core", ExpectedPreviousMandateID: previous, RecoveryRequestID: "33333333-3333-4333-8333-333333333333"}
	prepared, err := svc.Prepare(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	replacement := "mandate-replacement"
	dir := filepath.Join(svc.MandatesRoot, replacement)
	_ = os.MkdirAll(dir, 0755)
	raw, _ := json.Marshal(map[string]any{"mandateId": replacement, "mandateType": "genesis", "projectId": projectID})
	_ = os.WriteFile(filepath.Join(dir, "mandate_state.json"), raw, 0644)
	record, err := svc.Acknowledge(projectID, in.RecoveryRequestID, prepared.MandateLaunchID, replacement)
	if err != nil {
		t.Fatal(err)
	}
	if record.CurrentMandateID != replacement || record.Attempts[0].RelationshipStatus != "superseded" || record.Attempts[1].RelationshipStatus != "current" {
		t.Fatalf("record = %#v", record)
	}
}

func TestPrepareFailsClosedWhenWorkflowIsRunning(t *testing.T) {
	svc, projectID, previous := recoveryFixture(t)
	svc.Workflows = fakeWorkflows{states: map[string]WorkflowState{"mandate_build_" + previous: WorkflowRunning}}
	_, err := svc.Prepare(context.Background(), PrepareInput{ProjectID: projectID, ProjectName: "sample", ExpectedPreviousMandateID: previous, RecoveryRequestID: "44444444-4444-4444-8444-444444444444"})
	if ErrorCode(err) != "PREVIOUS_WORKFLOW_ACTIVE" {
		t.Fatalf("error = %v", err)
	}
}

func TestLoadReadsLegacyLaunchIdentity(t *testing.T) {
	root := t.TempDir()
	store := NewStore(root)
	if err := os.MkdirAll(store.Root, 0755); err != nil {
		t.Fatal(err)
	}
	raw := []byte(`{"schemaVersion":1,"projectId":"project-fixture","pendingRecovery":{"genesisLaunchId":"pending-id"},"attempts":[{"genesisLaunchId":"attempt-id"}]}`)
	if err := os.WriteFile(store.path("project-fixture"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	record, err := store.Load("project-fixture")
	if err != nil {
		t.Fatal(err)
	}
	if record.PendingRecovery.MandateLaunchID != "pending-id" || record.Attempts[0].MandateLaunchID != "attempt-id" {
		t.Fatalf("legacy launch IDs not recovered: %#v", record)
	}
}
