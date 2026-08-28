package workflows

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"go.temporal.io/sdk/testsuite"

	"nucleus/internal/orchestration/activities"
)

func genesisWorkflowFixture(t *testing.T) (*testsuite.TestWorkflowEnvironment, *[]string) {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	order := []string{}
	env.RegisterWorkflow(MandateGenesisBuildWorkflow)
	env.RegisterWorkflow(MandateExecutionWorkflow)
	env.OnActivity(activities.IngestReceptionActivity, mock.Anything, mock.Anything).
		Return(activities.IngestReceptionResult{IntentID: "intent-1", FolderName: ".fixture"}, nil)
	env.OnActivity(activities.ScaffoldDomainActivity, mock.Anything, mock.Anything).
		Return(activities.ScaffoldDomainResult{ResultRef: "domain_proposal.json", Domains: []activities.ProposedDomain{{ID: "dom-1", DomainName: "Core"}}}, nil)
	env.OnActivity(activities.PublishMandateEventActivity, mock.Anything, mock.Anything, mock.Anything).
		Return(func(event string, _ map[string]interface{}) error { order = append(order, "event:"+event); return nil })
	env.RegisterDelayedCallback(func() {
		env.SignalWorkflow("mandate:genesis:validate", GenesisValidateSignal{Approved: true, Domains: []DomainConfirmation{{ID: "dom-1", DomainName: "Core"}}})
	}, time.Second)
	return env, &order
}

func TestMandateGenesisSignatureEventFollowsDurableSignedState(t *testing.T) {
	env, order := genesisWorkflowFixture(t)
	env.OnActivity(activities.PersistHumanSyncActivity, mock.Anything, mock.Anything).
		Return(func(activities.PersistHumanSyncInput) (activities.PersistHumanSyncResult, error) {
			*order = append(*order, "state:pending")
			return activities.PersistHumanSyncResult{StateVersion: 2}, nil
		})
	env.OnActivity(activities.SignMandateActivity, mock.Anything, mock.Anything, mock.Anything).
		Return(func(string, string) (activities.SignMandateResult, error) {
			*order = append(*order, "state:signed")
			return activities.SignMandateResult{ActionsCreated: 1, SignedAt: "2026-08-27T10:00:00Z", Actions: []activities.Action{{DomainName: "Core"}}}, nil
		})
	env.ExecuteWorkflow(MandateGenesisBuildWorkflow, GenesisBuildInput{MandateID: "m1", MandateType: "genesis", Project: "fixture", MandatesRoot: "fixture"})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(*order, "|")
	if !strings.Contains(joined, "state:signed|event:mandate:genesis:signed") {
		t.Fatalf("order=%s", joined)
	}
	if strings.Contains(joined, "mark-effect-applied") || strings.Contains(joined, "commit-turn") || strings.Contains(joined, "advance-turn") {
		t.Fatalf("BSIP wiring activated: %s", joined)
	}
}

func TestMandateGenesisSignatureFailurePersistsBeforeErrorEvent(t *testing.T) {
	env, order := genesisWorkflowFixture(t)
	env.OnActivity(activities.PersistHumanSyncActivity, mock.Anything, mock.Anything).
		Return(activities.PersistHumanSyncResult{StateVersion: 2}, nil)
	env.OnActivity(activities.SignMandateActivity, mock.Anything, mock.Anything, mock.Anything).
		Return(activities.SignMandateResult{}, errors.New("sign failed"))
	env.OnActivity(activities.PersistSignatureFailureActivity, mock.Anything, mock.Anything).
		Return(func(activities.PersistSignatureFailureInput) (activities.PersistSignatureFailureResult, error) {
			*order = append(*order, "state:failed")
			return activities.PersistSignatureFailureResult{StateVersion: 3}, nil
		})
	env.ExecuteWorkflow(MandateGenesisBuildWorkflow, GenesisBuildInput{MandateID: "m2", MandateType: "genesis", Project: "fixture", MandatesRoot: "fixture"})
	if env.GetWorkflowError() == nil {
		t.Fatal("expected workflow failure")
	}
	joined := strings.Join(*order, "|")
	if !strings.Contains(joined, "state:failed|event:mandate:genesis:error") {
		t.Fatalf("order=%s", joined)
	}
}
