package workflows

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/testsuite"
	"go.temporal.io/sdk/workflow"
	"nucleus/internal/orchestration/activities"
)

func mandateBuildTestEnvironment(t *testing.T, denyAct string) (*testsuite.TestWorkflowEnvironment, *[]string) {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	order := []string{}
	env.RegisterWorkflow(MandateBuildWorkflow)
	env.RegisterActivityWithOptions((&activities.MandateActVerificationActivity{}).Run, activity.RegisterOptions{Name: "MandateActVerificationActivity"})
	env.OnActivity(activities.IngestReceptionActivity, mock.Anything, mock.Anything).Return(func(activities.IngestReceptionInput) (activities.IngestReceptionResult, error) {
		order = append(order, "ingest")
		return activities.IngestReceptionResult{IntentID: "intent-1", FolderName: "fixture", ClassificationDigest: "sha256:classification", RawResponseDigest: "sha256:raw", Domains: []activities.ProposedDomain{{ID: "dom-1", DomainName: "Core"}}}, nil
	})
	env.OnActivity(activities.ScaffoldDomainActivity, mock.Anything, mock.Anything).Return(func(activities.ScaffoldDomainInput) (activities.ScaffoldDomainResult, error) {
		order = append(order, "cluster")
		return activities.ScaffoldDomainResult{ResultRef: "domain_proposal.json", Domains: []activities.ProposedDomain{{ID: "dom-1", DomainName: "Core"}}}, nil
	})
	env.OnActivity(activities.LoadMandateBuildCheckpointActivity, mock.Anything, mock.Anything).Return(func(input activities.LoadMandateBuildCheckpointInput) (activities.MandateBuildCheckpoint, error) {
		order = append(order, "checkpoint:"+input.Phase)
		return activities.MandateBuildCheckpoint{
			Reception:        activities.IngestReceptionResult{IntentID: "intent-1", FolderName: "fixture"},
			Scaffold:         activities.ScaffoldDomainResult{ResultRef: "domain_proposal.json", Domains: []activities.ProposedDomain{{ID: "dom-1", DomainName: "Core"}}},
			CandidateDomains: []activities.DomainCandidateState{{DomainID: "dom-1", Name: "Core"}},
		}, nil
	})
	env.OnActivity(activities.PublishMandateEventActivity, mock.Anything, mock.Anything, mock.Anything).Return(func(event string, _ map[string]interface{}) error { order = append(order, "event:"+event); return nil })
	env.OnActivity(activities.AdvancePhaseActivity, mock.Anything, mock.Anything).Return(func(_ context.Context, input activities.AdvancePhaseInput) (activities.AdvancePhaseResult, error) {
		order = append(order, "phase:"+input.Phase)
		return activities.AdvancePhaseResult{StateVersion: 1}, nil
	})
	env.OnActivity(activities.PersistCandidateDomainsActivity, mock.Anything, mock.Anything).Return(func(input activities.PersistCandidateDomainsInput) (activities.PersistCandidateDomainsResult, error) {
		order = append(order, "candidates:"+candidateIDs(input.CandidateDomains))
		return activities.PersistCandidateDomainsResult{StateVersion: 1}, nil
	})
	env.OnActivity(activities.PersistHumanSyncActivity, mock.Anything, mock.Anything).Return(func(input activities.PersistHumanSyncInput) (activities.PersistHumanSyncResult, error) {
		order = append(order, "humansync:"+candidateIDs(input.CandidateDomains))
		return activities.PersistHumanSyncResult{StateVersion: 2}, nil
	})
	env.OnActivity("MandateActVerificationActivity", mock.Anything, mock.Anything).Return(func(input activities.MandateActVerificationInput) (activities.MandateActVerificationResult, error) {
		order = append(order, "verify:"+input.Operation)
		if input.Operation == denyAct {
			return activities.MandateActVerificationResult{}, errors.New("invalid human act")
		}
		return activities.MandateActVerificationResult{ContractDigest: "digest-1", ProjectID: "project-1"}, nil
	})
	env.OnWorkflow(MandateExecutionWorkflow, mock.Anything, mock.Anything).Return(func(_ workflow.Context, input MandateExecutionInput) (MandateExecutionResult, error) {
		order = append(order, "execute")
		if input.MandateID != "m-1" || len(input.Domains) != 0 || input.IntentType != "" {
			t.Errorf("unsigned plan entered child: %#v", input)
		}
		return MandateExecutionResult{Success: true, Fulfilled: true}, nil
	})
	env.RegisterDelayedCallback(func() {
		env.SignalWorkflow("mandate:build:validate", MandateValidateSignal{Approved: true, Domains: []DomainConfirmation{{ID: "dom-1", DomainName: "Core"}}})
	}, time.Second)
	env.RegisterDelayedCallback(func() { env.SignalWorkflow("mandate:build:approve", "digest-1") }, 2*time.Second)
	if denyAct != "approve" {
		env.RegisterDelayedCallback(func() { env.SignalWorkflow("mandate:build:activate", "digest-1") }, 3*time.Second)
	}
	return env, &order
}

func TestMandateBuildRequiresVerifiedApproveThenSeparateActivateBeforeExecution(t *testing.T) {
	env, order := mandateBuildTestEnvironment(t, "")
	env.ExecuteWorkflow(MandateBuildWorkflow, MandateBuildInput{MandateID: "m-1", MandatesRoot: "fixture", Project: "Core"})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(*order, "|")
	for _, part := range []string{"verify:approve", "phase:validate", "verify:activate", "execute", "phase:signed", "event:mandate:build:all_complete"} {
		if !strings.Contains(joined, part) {
			t.Fatalf("missing %s: %s", part, joined)
		}
	}
	if strings.Index(joined, "verify:approve") > strings.Index(joined, "verify:activate") || strings.Index(joined, "verify:activate") > strings.Index(joined, "execute") {
		t.Fatalf("acts out of order: %s", joined)
	}
}

func TestMandateBuildRejectsUnverifiedApprovalBeforeExecution(t *testing.T) {
	env, order := mandateBuildTestEnvironment(t, "approve")
	env.ExecuteWorkflow(MandateBuildWorkflow, MandateBuildInput{MandateID: "m-1", MandatesRoot: "fixture", Project: "Core"})
	if env.GetWorkflowError() == nil {
		t.Fatal("unverified approval accepted")
	}
	if strings.Contains(strings.Join(*order, "|"), "execute") {
		t.Fatalf("executed after denied approval: %v", *order)
	}
}

func TestMandateBuildRejectsUnverifiedActivationBeforeExecution(t *testing.T) {
	env, order := mandateBuildTestEnvironment(t, "activate")
	env.ExecuteWorkflow(MandateBuildWorkflow, MandateBuildInput{MandateID: "m-1", MandatesRoot: "fixture", Project: "Core"})
	if env.GetWorkflowError() == nil {
		t.Fatal("unverified activation accepted")
	}
	if strings.Contains(strings.Join(*order, "|"), "execute") {
		t.Fatalf("executed after denied activation: %v", *order)
	}
}

func candidateIDs(candidates []activities.DomainCandidateState) string {
	ids := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		ids = append(ids, candidate.DomainID+"/"+candidate.Name)
	}
	return strings.Join(ids, ",")
}

// B1: los candidatos del cluster se persisten antes de pasar a "validate",
// y PersistHumanSync recibe exactamente la misma lista.
func TestMandateBuildPersistsCandidatesBeforeValidatePhase(t *testing.T) {
	env, order := mandateBuildTestEnvironment(t, "")
	env.ExecuteWorkflow(MandateBuildWorkflow, MandateBuildInput{MandateID: "m-1", MandatesRoot: "fixture", Project: "Core"})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(*order, "|")
	candidates := strings.Index(joined, "candidates:dom-1/Core")
	cluster := strings.Index(joined, "phase:cluster")
	humanSync := strings.Index(joined, "humansync:dom-1/Core")
	if candidates < 0 || cluster < 0 || humanSync < 0 {
		t.Fatalf("missing candidate persistence, cluster transition or human sync: %s", joined)
	}
	if candidates > cluster || cluster > humanSync {
		t.Fatalf("candidates must be persisted before validate and match human sync: %s", joined)
	}
}

func TestMandateBuildResumesValidateWithoutRepeatingIngestOrCluster(t *testing.T) {
	env, order := mandateBuildTestEnvironment(t, "")
	env.ExecuteWorkflow(MandateBuildWorkflow, MandateBuildInput{MandateID: "m-1", MandatesRoot: "fixture", Project: "Core", ResumeFrom: "validate"})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(*order, "|")
	if !strings.Contains(joined, "checkpoint:validate") {
		t.Fatalf("checkpoint not loaded: %s", joined)
	}
	if strings.Contains(joined, "ingest") || strings.Contains(joined, "cluster") || strings.Contains(joined, "candidates:") {
		t.Fatalf("completed phases repeated during validate resume: %s", joined)
	}
	if !strings.Contains(joined, "humansync:dom-1/Core") {
		t.Fatalf("restored candidate not used: %s", joined)
	}
}
