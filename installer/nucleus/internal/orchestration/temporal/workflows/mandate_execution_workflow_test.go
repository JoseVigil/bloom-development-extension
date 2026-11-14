package workflows

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/testsuite"
	"nucleus/internal/orchestration/activities"
	"nucleus/internal/orchestration/mandatecontract"
)

func TestSignedActionGraphRejectsChangedOrderAndBranch(t *testing.T) {
	types := []string{"ing", "dis", "doc", "exp", "dev", "exp"}
	actions := make([]mandatecontract.Action, len(types))
	for i, intentType := range types {
		actions[i] = mandatecontract.Action{ActionID: string(rune('a' + i)), Type: "run_intent", IntentType: intentType, IdempotencyKey: string(rune('a' + i))}
		if i > 0 {
			actions[i].DependsOn = []string{actions[i-1].ActionID}
		}
	}
	actions[4].WhenResult = "remediation_required"
	if err := mandatecontract.ValidateMandateActions(actions); err != nil {
		t.Fatal(err)
	}
	actions[4].WhenResult = "ready"
	if err := mandatecontract.ValidateMandateActions(actions); err == nil {
		t.Fatal("changed branch condition was accepted")
	}
	actions[4].WhenResult = "remediation_required"
	actions[2].DependsOn = []string{actions[0].ActionID}
	if err := mandatecontract.ValidateMandateActions(actions); err == nil {
		t.Fatal("changed dependency was accepted")
	}
}

func TestAdoptedExecutionWaitsForDISTerminalEvidence(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(MandateExecutionWorkflow)
	env.RegisterActivityWithOptions((&activities.MandateIntentActivity{}).Run, activity.RegisterOptions{Name: "MandateIntentActivity"})
	env.RegisterActivityWithOptions((&activities.MandateIntentActivity{}).CompleteING, activity.RegisterOptions{Name: "MandateINGCompletionActivity"})
	env.RegisterActivityWithOptions((&activities.MandateIntentActivity{}).RunDIS, activity.RegisterOptions{Name: "MandateDISActivity"})
	env.RegisterActivityWithOptions((&activities.MandateIntentActivity{}).ObserveDISTerminal, activity.RegisterOptions{Name: "MandateDISTerminalObservationActivity"})
	env.RegisterActivityWithOptions((&activities.MandateDOCActivity{}).RunAfterDIS, activity.RegisterOptions{Name: "MandateDOCAfterDISActivity"})
	ingCalls, persistCalls, completionCalls, disCalls, observeCalls, terminalPersistCalls, docCalls := 0, 0, 0, 0, 0, 0, 0
	disPersisted := false
	env.OnActivity("MandateIntentActivity", mock.Anything, mock.Anything).Return(func(_ context.Context, input activities.MandateIntentInput) (activities.MandateIntentResult, error) {
		ingCalls++
		if input.MandateID != "mandate-1" {
			t.Errorf("wrong Mandate: %#v", input)
		}
		return activities.MandateIntentResult{MandateID: "mandate-1", ActionID: "a", ContractDigest: "digest",
			IntentID: "ing-1", EvidenceRef: "classification.json", EvidenceDigest: "hash", Status: "awaiting_human_decision"}, nil
	})
	env.OnActivity(activities.PersistAdoptedINGResultActivity, mock.Anything, mock.Anything, mock.Anything).Return(func(_ context.Context, _ activities.MandateIntentResult, _ string) (activities.PersistExecutionResultResult, error) {
		persistCalls++
		return activities.PersistExecutionResultResult{StateVersion: 2}, nil
	})
	env.OnActivity("MandateINGCompletionActivity", mock.Anything, mock.Anything).Return(func(_ context.Context, _ activities.MandateIntentInput) (activities.MandateINGCompletionResult, error) {
		completionCalls++
		return activities.MandateINGCompletionResult{MandateID: "mandate-1", ActionID: "a", NextActionID: "b", NextIntentType: "dis", ContractDigest: "digest", IntentID: "ing-1", DecisionDigest: "decision", ResultRef: "ing_result.json", ResultDigest: "hash", LedgerRef: "ledger.json", LedgerDigest: "hash"}, nil
	})
	env.OnActivity(activities.PersistAdoptedINGCompletionActivity, mock.Anything, mock.Anything, mock.Anything).Return(activities.PersistExecutionResultResult{StateVersion: 3}, nil)
	env.OnActivity("MandateDISActivity", mock.Anything, mock.Anything).Return(func(_ context.Context, input activities.MandateIntentInput) (activities.MandateDISResult, error) {
		disCalls++
		return activities.MandateDISResult{MandateID: input.MandateID, ActionID: "b", ContractDigest: "digest", IntentID: "dis-1",
			INGIntentID: "ing-1", INGResultRef: "ing_result.json", INGResultDigest: "hash",
			ProposalRef: "mapping.json", ProposalDigest: "hash", Status: "awaiting_human_decision"}, nil
	})
	env.OnActivity(activities.PersistAdoptedDISProposalActivity, mock.Anything, mock.Anything, mock.Anything).Return(activities.PersistExecutionResultResult{StateVersion: 4}, nil)
	env.OnActivity("MandateDISTerminalObservationActivity", mock.Anything, mock.Anything).Return(func(_ context.Context, input activities.MandateIntentInput) (activities.MandateDISCompletionResult, error) {
		observeCalls++
		if observeCalls == 1 {
			return activities.MandateDISCompletionResult{MandateID: input.MandateID, Status: "pending"}, nil
		}
		return activities.MandateDISCompletionResult{
			Ready: true, MandateID: input.MandateID, ActionID: "b", ContractDigest: "digest", IntentID: "dis-1",
			ProposalRef: "mapping.json", ProposalDigest: "hash", TurnID: "1", RatificationRef: "ratification.json",
			RatificationDigest: "ratification-hash", LedgerRef: "ledger.json", LedgerDigest: "ledger-hash",
			EffectsDigest: "effects-hash", Status: "completed",
		}, nil
	})
	env.OnActivity(activities.PersistAdoptedDISCompletionActivity, mock.Anything, mock.Anything, mock.Anything).Return(func(_ context.Context, _ activities.MandateDISCompletionResult, _ string) (activities.PersistExecutionResultResult, error) {
		terminalPersistCalls++
		disPersisted = true
		return activities.PersistExecutionResultResult{StateVersion: 5}, nil
	})
	env.OnActivity("MandateDOCAfterDISActivity", mock.Anything, mock.Anything).Return(func(_ context.Context, input activities.MandateIntentInput) (activities.MandateDOCResult, error) {
		docCalls++
		if !disPersisted {
			t.Error("DOC was dispatched before terminal DIS persistence")
		}
		if input.DISActionID != "b" {
			t.Errorf("DOC dispatch lost terminal DIS Action identity: %#v", input)
		}
		if docCalls == 1 {
			if input.ActionID != "" {
				t.Errorf("first DOC dispatch was unexpectedly pre-bound: %#v", input)
			}
			return activities.MandateDOCResult{MandateID: input.MandateID, ActionID: "c", DISActionID: "b", DocStatus: "pending_response", NextAction: "respond"}, nil
		}
		if input.ActionID != "c" {
			t.Errorf("DOC resume lost signed Action identity: %#v", input)
		}
		return activities.MandateDOCResult{Ready: true, MandateID: input.MandateID, ActionID: "c", DISActionID: "b", IntentID: "doc-1", DocStatus: "completed", NextAction: "none", RunDigest: "run-hash"}, nil
	})
	env.RegisterDelayedCallback(func() { env.SignalWorkflow("mandate:ing:decision", "decision") }, time.Millisecond)
	env.ExecuteWorkflow(MandateExecutionWorkflow, MandateExecutionInput{MandateID: "mandate-1", MandatesRoot: "isolated", Adopted: true})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	var result MandateExecutionResult
	if err := env.GetWorkflowResult(&result); err != nil {
		t.Fatal(err)
	}
	if !result.Success || result.Fulfilled || ingCalls != 1 || persistCalls != 1 || completionCalls != 1 || disCalls != 1 || observeCalls != 2 || terminalPersistCalls != 1 || docCalls != 2 {
		t.Fatalf("result=%#v ing=%d persist=%d complete=%d dis=%d observe=%d terminalPersist=%d doc=%d", result, ingCalls, persistCalls, completionCalls, disCalls, observeCalls, terminalPersistCalls, docCalls)
	}
}

func TestINGDoesNotDispatchDOCWithoutCanonicalGeneReceipt(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(MandateExecutionWorkflow)
	env.RegisterActivityWithOptions((&activities.MandateIntentActivity{}).Run, activity.RegisterOptions{Name: "MandateIntentActivity"})
	env.RegisterActivityWithOptions((&activities.MandateIntentActivity{}).CompleteING, activity.RegisterOptions{Name: "MandateINGCompletionActivity"})
	env.RegisterActivityWithOptions((&activities.MandateIntentActivity{}).RunDIS, activity.RegisterOptions{Name: "MandateDISActivity"})
	env.RegisterActivityWithOptions((&activities.MandateDOCActivity{}).RunAfterDIS, activity.RegisterOptions{Name: "MandateDOCAfterDISActivity"})
	persistCompletionCalls, disCalls, docCalls := 0, 0, 0
	env.OnActivity("MandateIntentActivity", mock.Anything, mock.Anything).Return(activities.MandateIntentResult{
		MandateID: "mandate-1", ActionID: "ing-1", ContractDigest: "digest", IntentID: "ing-intent",
		EvidenceRef: "classification.json", EvidenceDigest: "classification-hash", Status: "awaiting_human_decision",
	}, nil)
	env.OnActivity(activities.PersistAdoptedINGResultActivity, mock.Anything, mock.Anything, mock.Anything).Return(activities.PersistExecutionResultResult{StateVersion: 2}, nil)
	env.OnActivity("MandateINGCompletionActivity", mock.Anything, mock.Anything).Return(activities.MandateINGCompletionResult{
		MandateID: "mandate-1", ActionID: "ing-1", NextActionID: "doc-after-ing", NextIntentType: "doc",
		ContractDigest: "digest", IntentID: "ing-intent", DecisionDigest: "decision", ResultRef: "ing-result.json",
		ResultDigest: "result-hash", LedgerRef: "ledger.json", LedgerDigest: "ledger-hash",
	}, nil)
	env.OnActivity(activities.PersistAdoptedINGCompletionActivity, mock.Anything, mock.Anything, mock.Anything).Return(func(context.Context, activities.MandateINGCompletionResult, string) (activities.PersistExecutionResultResult, error) {
		persistCompletionCalls++
		return activities.PersistExecutionResultResult{}, nil
	})
	env.OnActivity("MandateDISActivity", mock.Anything, mock.Anything).Return(func(context.Context, activities.MandateIntentInput) (activities.MandateDISResult, error) {
		disCalls++
		return activities.MandateDISResult{}, nil
	})
	env.OnActivity("MandateDOCAfterDISActivity", mock.Anything, mock.Anything).Return(func(context.Context, activities.MandateIntentInput) (activities.MandateDOCResult, error) {
		docCalls++
		return activities.MandateDOCResult{}, nil
	})
	env.RegisterDelayedCallback(func() { env.SignalWorkflow("mandate:ing:decision", "decision") }, time.Millisecond)
	env.ExecuteWorkflow(MandateExecutionWorkflow, MandateExecutionInput{MandateID: "mandate-1", MandatesRoot: "isolated", Adopted: true})
	var result MandateExecutionResult
	if err := env.GetWorkflowResult(&result); err != nil {
		t.Fatal(err)
	}
	if result.Success || result.Error != "ING canonical Gene materialization receipt required before DOC" || persistCompletionCalls != 0 || disCalls != 0 || docCalls != 0 {
		t.Fatalf("ING did not fail closed: result=%#v persist=%d dis=%d doc=%d", result, persistCompletionCalls, disCalls, docCalls)
	}
}

func TestExecutionRejectsUnsignedPlanBeforeAnyGenEffect(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(MandateExecutionWorkflow)
	env.RegisterActivityWithOptions((&activities.MandateGenActivity{}).Run, activity.RegisterOptions{Name: "MandateGenActivity"})
	called := false
	env.OnActivity("MandateGenActivity", mock.Anything, mock.Anything).Return(func(_ context.Context, _ activities.MandateGenInput) (activities.MandateGenResult, error) {
		called = true
		return activities.MandateGenResult{}, nil
	})
	env.ExecuteWorkflow(MandateExecutionWorkflow, MandateExecutionInput{MandateID: "m-1", MandatesRoot: "root", Domains: []DomainAction{{DomainName: "injected", Files: []string{"late.md"}}}})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	var result MandateExecutionResult
	if err := env.GetWorkflowResult(&result); err != nil {
		t.Fatal(err)
	}
	if called || result.Success {
		t.Fatalf("unsigned signal reached gen: called=%v result=%#v", called, result)
	}
}

func TestExecutionUsesVerifiedGenEvidenceAndPersistsFulfillment(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(MandateExecutionWorkflow)
	env.RegisterActivityWithOptions((&activities.MandateGenActivity{}).Run, activity.RegisterOptions{Name: "MandateGenActivity"})
	genCalls, persistCalls := 0, 0
	env.OnActivity("MandateGenActivity", mock.Anything, mock.Anything).Return(func(_ context.Context, input activities.MandateGenInput) (activities.MandateGenResult, error) {
		genCalls++
		if input.MandateID != "m-1" {
			t.Errorf("wrong Mandate: %#v", input)
		}
		return activities.MandateGenResult{MandateID: "m-1", ActionID: "a-1", ContractDigest: "contract-hash", ArtifactRef: "domain_definition.json", ArtifactSHA256: "artifact-hash", FulfillmentStatus: "fulfilled"}, nil
	})
	env.OnActivity(activities.PersistExecutionResultActivity, mock.Anything, mock.Anything).Return(func(_ context.Context, input activities.PersistExecutionResultInput) (activities.PersistExecutionResultResult, error) {
		persistCalls++
		if input.ContractDigest != "contract-hash" || input.ArtifactDigest != "artifact-hash" || input.FulfillmentStatus != "fulfilled" {
			t.Errorf("evidence lost: %#v", input)
		}
		return activities.PersistExecutionResultResult{StateVersion: 2}, nil
	})
	env.ExecuteWorkflow(MandateExecutionWorkflow, MandateExecutionInput{MandateID: "m-1", MandatesRoot: "root"})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	var result MandateExecutionResult
	if err := env.GetWorkflowResult(&result); err != nil {
		t.Fatal(err)
	}
	if !result.Success || !result.Fulfilled || genCalls != 1 || persistCalls != 1 {
		t.Fatalf("result=%#v gen=%d persist=%d", result, genCalls, persistCalls)
	}
}

func TestExecutionRejectsFailedGenWithoutFulfillmentRecord(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(MandateExecutionWorkflow)
	env.RegisterActivityWithOptions((&activities.MandateGenActivity{}).Run, activity.RegisterOptions{Name: "MandateGenActivity"})
	env.OnActivity("MandateGenActivity", mock.Anything, mock.Anything).Return(activities.MandateGenResult{}, errors.New("activation receipt missing"))
	env.ExecuteWorkflow(MandateExecutionWorkflow, MandateExecutionInput{MandateID: "m-1", MandatesRoot: "root"})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	var result MandateExecutionResult
	if err := env.GetWorkflowResult(&result); err != nil {
		t.Fatal(err)
	}
	if result.Success || result.Fulfilled {
		t.Fatalf("failed gen fulfilled: %#v", result)
	}
}

func TestExecutionRejectsIncompleteGenEvidence(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(MandateExecutionWorkflow)
	env.RegisterActivityWithOptions((&activities.MandateGenActivity{}).Run, activity.RegisterOptions{Name: "MandateGenActivity"})
	env.OnActivity("MandateGenActivity", mock.Anything, mock.Anything).Return(activities.MandateGenResult{MandateID: "m-1", ActionID: "a-1", ContractDigest: "hash", ArtifactSHA256: "hash", FulfillmentStatus: "completed"}, nil)
	env.ExecuteWorkflow(MandateExecutionWorkflow, MandateExecutionInput{MandateID: "m-1", MandatesRoot: "root"})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	var result MandateExecutionResult
	if err := env.GetWorkflowResult(&result); err != nil {
		t.Fatal(err)
	}
	if result.Success || result.Fulfilled {
		t.Fatalf("incomplete evidence fulfilled: %#v", result)
	}
}
