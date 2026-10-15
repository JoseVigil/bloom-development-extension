package workflows

import (
	"context"
	"errors"
	"testing"

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

func TestAdoptedExecutionDispatchesOnlyING(t *testing.T) {
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(MandateExecutionWorkflow)
	env.RegisterActivityWithOptions((&activities.MandateIntentActivity{}).Run, activity.RegisterOptions{Name: "MandateIntentActivity"})
	ingCalls, persistCalls := 0, 0
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
	env.ExecuteWorkflow(MandateExecutionWorkflow, MandateExecutionInput{MandateID: "mandate-1", MandatesRoot: "isolated", Adopted: true})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	var result MandateExecutionResult
	if err := env.GetWorkflowResult(&result); err != nil {
		t.Fatal(err)
	}
	if !result.Success || result.Fulfilled || ingCalls != 1 || persistCalls != 1 {
		t.Fatalf("result=%#v ing=%d persist=%d", result, ingCalls, persistCalls)
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
