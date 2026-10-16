package watchers

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/fsnotify/fsnotify"
	"go.temporal.io/sdk/client"

	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/orchestration/mandatecontract"
	"nucleus/internal/orchestration/temporal/workflows"
)

func TestAdoptedMandateDispatchesOnceAcrossWatcherRestart(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "mandate-1")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	identity := &authority.LocalIdentity{InstallationID: "installation-1", PublicKey: public, PrivateKey: private}
	identityPath := filepath.Join(root, "identity.json")
	identityRaw, _ := json.Marshal(map[string]string{"installation_id": identity.InstallationID, "public_key": base64.StdEncoding.EncodeToString(public)})
	if err := os.WriteFile(identityPath, identityRaw, 0600); err != nil {
		t.Fatal(err)
	}
	types := []string{"ing", "dis", "doc", "exp", "dev", "exp"}
	actions := make([]mandatecontract.Action, len(types))
	for i, kind := range types {
		actions[i] = mandatecontract.Action{ActionID: string(rune('a' + i)), Type: "run_intent", IntentType: kind, IdempotencyKey: string(rune('k' + i))}
		if i > 0 {
			actions[i].DependsOn = []string{actions[i-1].ActionID}
		}
	}
	actions[4].WhenResult = "remediation_required"
	contract := mandatecontract.Contract{MandateID: "mandate-1", ContractVersion: 4, OrganizationID: "org-1",
		ProjectID: "project-1", ProjectBinding: "binding-1", Objective: "Classify approved inputs",
		Domain: mandatecontract.Domain{ID: "domain-1", Name: "Project"}, Actions: actions,
		Intelligence: &mandatecontract.Intelligence{PolicyVersion: "mandate-gen/v1", PolicyRef: filepath.Join(root, "policy.json"),
			PolicySHA256: hex.EncodeToString(make([]byte, 32)), RegistryRef: filepath.Join(root, "registry.json"),
			RegistrySHA256: hex.EncodeToString(make([]byte, 32)), MaxTotalTokens: 100, MaxOutputTokens: 50},
		Inputs:      []mandatecontract.Input{{Ref: "inputs/source.md", SHA256: hex.EncodeToString(make([]byte, 32)), Size: 1}},
		Fulfillment: mandatecontract.Fulfillment{Evaluator: "exp-ready", EvaluatorVersion: "1", RequiredFields: []string{"ing", "dis", "doc", "exp"}}}
	envelope, err := mandatecontract.Sign(contract, identity)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(envelope)
	if err := os.WriteFile(filepath.Join(dir, "mandate.json"), raw, 0600); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(raw)
	journalRaw, _ := json.Marshal(map[string]any{"mandateId": "mandate-1", "adoption": map[string]string{
		"organizationId": "org-1", "installationId": "installation-1", "version": "v1",
		"digest": hex.EncodeToString(sum[:]), "contractDigest": envelope.ContractDigest}})
	if err := os.WriteFile(filepath.Join(dir, "mandate_state.json"), journalRaw, 0600); err != nil {
		t.Fatal(err)
	}
	tc := &syntheticMandateBuildTemporalClient{state: WorkflowExecutionNotFound}
	logger, err := core.InitLogger(&core.Paths{LogsDir: filepath.Join(root, "logs")}, "MANDATE", true)
	if err != nil {
		t.Fatal(err)
	}
	defer logger.Close()
	consented := false
	verified := func(string, mandatecontract.Envelope, string) error {
		if !consented {
			return errors.New("approve or activate receipt missing")
		}
		return nil
	}
	w := &MandateWatcher{mandatesRoot: root, identityPath: identityPath, tc: tc, verifyActs: verified, logger: logger}
	w.onAdoptedMandate(context.Background(), dir, "mandate-1", "v1", hex.EncodeToString(sum[:]), envelope.ContractDigest, "adopted")
	if tc.executionStarts != 0 {
		t.Fatalf("dispatch before consent: %d", tc.executionStarts)
	}
	consented = true
	w.onAdoptedMandate(context.Background(), dir, "mandate-1", "v1", hex.EncodeToString(sum[:]), envelope.ContractDigest, "adopted")
	if tc.executionStarts != 1 {
		t.Fatalf("first dispatches=%d", tc.executionStarts)
	}
	tc.state = WorkflowExecutionRunning
	restarted := &MandateWatcher{mandatesRoot: root, identityPath: identityPath, tc: tc, verifyActs: verified, logger: logger}
	restarted.onAdoptedMandate(context.Background(), dir, "mandate-1", "v1", hex.EncodeToString(sum[:]), envelope.ContractDigest, "adopted")
	if tc.executionStarts != 1 {
		t.Fatalf("restart duplicated dispatch: %d", tc.executionStarts)
	}
	var durable map[string]any
	if json.Unmarshal(journalRaw, &durable) != nil {
		t.Fatal("invalid fixture")
	}
	durable["actions"] = map[string]any{"a": map[string]any{"status": "awaiting_human_decision"}}
	durable["ingDecision"] = map[string]any{"actionId": "a", "contractDigest": envelope.ContractDigest, "decisionDigest": "decision-1"}
	journalRaw, _ = json.Marshal(durable)
	if err := os.WriteFile(filepath.Join(dir, "mandate_state.json"), journalRaw, 0600); err != nil {
		t.Fatal(err)
	}
	restarted.onAdoptedMandate(context.Background(), dir, "mandate-1", "v1", hex.EncodeToString(sum[:]), envelope.ContractDigest, "waiting_human")
	if tc.decisionSignals != 1 || tc.executionStarts != 1 {
		t.Fatalf("restart signals=%d starts=%d", tc.decisionSignals, tc.executionStarts)
	}
}

func TestMandateBuildDispatchClassifiesLiveDuplicate(t *testing.T) {
	if got := classifyBuildDuplicate(true, nil); got != buildDuplicateActive {
		t.Fatalf("classification = %q, want %q", got, buildDuplicateActive)
	}
}

func TestMandateBuildDispatchClassifiesHistoricalDuplicate(t *testing.T) {
	if got := classifyBuildDuplicate(false, nil); got != buildDuplicateHistorical {
		t.Fatalf("classification = %q, want %q", got, buildDuplicateHistorical)
	}
}

func TestMandateBuildDispatchPreservesClassificationFailure(t *testing.T) {
	if got := classifyBuildDuplicate(false, errors.New("describe failed")); got != buildDuplicateUnclassified {
		t.Fatalf("classification = %q, want %q", got, buildDuplicateUnclassified)
	}
}

func TestMandateBuildInputPreservesProjectID(t *testing.T) {
	var state MandateState
	if err := json.Unmarshal([]byte(`{
		"mandateId":"mandate-fixture",
		"project":"project-label",
		"projectId":"project-id-fixture"
	}`), &state); err != nil {
		t.Fatal(err)
	}
	input := mandateBuildInput(state, "mandates-root")
	if input.ProjectID != "project-id-fixture" {
		t.Fatalf("ProjectID = %q, want project-id-fixture", input.ProjectID)
	}
	if input.Project != "project-label" {
		t.Fatalf("Project = %q, want project-label", input.Project)
	}
}

func TestMandateBuildInputCarriesResumePhase(t *testing.T) {
	input := mandateBuildInput(MandateState{MandateID: "m", CurrentPhase: "validate"}, "root")
	if input.ResumeFrom != "validate" {
		t.Fatalf("ResumeFrom = %q", input.ResumeFrom)
	}
}

func TestDispatchBuildSupportsFreshAndReconciledCheckpoints(t *testing.T) {
	cases := []struct {
		name, phase, ingest, reconciliationStatus, reconciliationReason string
		want                                                            bool
	}{
		{"fresh ingest", "ingest", "pending", "", "", true},
		{"recovered cluster", "cluster", "completed", "required", "unsigned_without_active_workflow", true},
		{"recovered validate", "validate", "completed", "required", "unsigned_without_active_workflow", true},
		{"active validate", "validate", "completed", "", "", false},
		{"terminal signed", "signed", "completed", "required", "unsigned_without_active_workflow", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ms := MandateState{Status: "building", CurrentPhase: tc.phase}
			ms.Phases.Ingest.Status = tc.ingest
			ms.Reconciliation.Status = tc.reconciliationStatus
			ms.Reconciliation.Reason = tc.reconciliationReason
			if got := shouldDispatchBuild(ms); got != tc.want {
				t.Fatalf("shouldDispatchBuild() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestSupersededGenesisIsExcludedFromWatcher(t *testing.T) {
	root := t.TempDir()
	mandates := filepath.Join(root, ".mandates")
	_ = os.MkdirAll(mandates, 0755)
	projects := filepath.Join(root, ".core", "genesis-projects")
	_ = os.MkdirAll(projects, 0755)
	raw, _ := json.Marshal(map[string]any{"attempts": []map[string]any{{"mandateId": "old", "relationshipStatus": "superseded"}}})
	_ = os.WriteFile(filepath.Join(projects, "project.json"), raw, 0644)
	w := &MandateWatcher{mandatesRoot: mandates}
	if !w.isSupersededGenesis(MandateState{MandateID: "old", MandateType: "genesis", ProjectID: "project"}) {
		t.Fatal("superseded Genesis was not excluded")
	}
	if w.isSupersededGenesis(MandateState{MandateID: "new", MandateType: "genesis", ProjectID: "project"}) {
		t.Fatal("current/unknown Genesis was excluded")
	}
}

type syntheticMandateBuildTemporalClient struct {
	state           WorkflowExecutionState
	err             error
	starts          int
	executionStarts int
	decisionSignals int
}

func (f *syntheticMandateBuildTemporalClient) SignalMandateExecutionWorkflow(context.Context, string, string) error {
	f.decisionSignals++
	return nil
}

func (f *syntheticMandateBuildTemporalClient) StartMandateExecutionWorkflow(context.Context, string, workflows.MandateExecutionInput) (client.WorkflowRun, error) {
	f.executionStarts++
	return nil, nil
}

func (f *syntheticMandateBuildTemporalClient) StartMandateBuildWorkflow(context.Context, string, workflows.MandateBuildInput) (client.WorkflowRun, error) {
	f.starts++
	return nil, nil
}
func (f *syntheticMandateBuildTemporalClient) IsWorkflowRunning(context.Context, string) (bool, error) {
	return f.state == WorkflowExecutionRunning, f.err
}
func (f *syntheticMandateBuildTemporalClient) GetWorkflowExecutionState(context.Context, string) (WorkflowExecutionState, error) {
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

func TestCreatedMandateDirectoryProcessesStateAlreadyWritten(t *testing.T) {
	mandates := t.TempDir()
	statePath := syntheticMandateState(t, mandates, time.Now())
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		t.Fatal(err)
	}
	defer fsw.Close()
	tc := &syntheticMandateBuildTemporalClient{state: WorkflowExecutionNotFound}
	w := &MandateWatcher{mandatesRoot: mandates, tc: tc, watcher: fsw,
		progress: newMandateProgress(), logger: &core.Logger{}}
	event := fsnotify.Event{Name: filepath.Dir(statePath), Op: fsnotify.Create}
	w.handleEvent(context.Background(), event)
	if tc.starts != 1 {
		t.Fatalf("starts=%d, want one dispatch for state written before directory notification", tc.starts)
	}
	w.handleEvent(context.Background(), event)
	if tc.starts != 1 {
		t.Fatalf("duplicate directory notification started %d workflows", tc.starts)
	}
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
	w := &MandateWatcher{tc: &syntheticMandateBuildTemporalClient{state: WorkflowExecutionNotFound}}
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
	w := &MandateWatcher{tc: &syntheticMandateBuildTemporalClient{state: WorkflowExecutionUnknown, err: errors.New("unavailable")}}
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
	w := &MandateWatcher{tc: &syntheticMandateBuildTemporalClient{state: WorkflowExecutionFailed}}
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
	w := &MandateWatcher{tc: &syntheticMandateBuildTemporalClient{state: WorkflowExecutionFailed}}
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
	w := &MandateWatcher{tc: &syntheticMandateBuildTemporalClient{state: WorkflowExecutionRunning}}
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
	w := &MandateWatcher{tc: &syntheticMandateBuildTemporalClient{state: WorkflowExecutionNotFound}}
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
