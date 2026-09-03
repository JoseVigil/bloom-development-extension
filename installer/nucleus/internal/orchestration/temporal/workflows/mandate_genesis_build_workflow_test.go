package workflows

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"go.temporal.io/sdk/testsuite"

	"nucleus/internal/orchestration/activities"
)

// failRealScaffold es un toggle compartido, no un override de mock: testify
// no permite pisar un env.OnActivity ya registrado con matchers igual de
// específicos (gana siempre el primero registrado) — así que en vez de
// intentar re-registrar ScaffoldDomainActivity desde un test, el único mock
// (registrado acá, una sola vez) lee este puntero en cada llamada. false por
// default (todo test hereda "corrida feliz"); un test que necesite que el
// scaffold real (Mode:real, dentro del child MandateExecutionWorkflow) falle
// lo pone en true antes de env.ExecuteWorkflow. El scaffold dry_run de la
// fase cluster, en el padre, nunca falla por este toggle — solo Mode:real.
func genesisWorkflowFixture(t *testing.T) (env *testsuite.TestWorkflowEnvironment, order *[]string, failRealScaffold *bool) {
	t.Helper()
	var suite testsuite.WorkflowTestSuite
	env = suite.NewTestWorkflowEnvironment()
	orderSlice := []string{}
	fail := false
	env.RegisterWorkflow(MandateGenesisBuildWorkflow)
	env.RegisterWorkflow(MandateExecutionWorkflow)
	env.OnActivity(activities.IngestReceptionActivity, mock.Anything, mock.Anything).
		Return(activities.IngestReceptionResult{IntentID: "intent-1", FolderName: ".fixture"}, nil)
	env.OnActivity(activities.ScaffoldDomainActivity, mock.Anything, mock.Anything).
		Return(func(input activities.ScaffoldDomainInput) (activities.ScaffoldDomainResult, error) {
			if input.Mode == activities.ScaffoldModeReal && fail {
				return activities.ScaffoldDomainResult{}, errors.New("scaffold real falló (fixture de test)")
			}
			return activities.ScaffoldDomainResult{ResultRef: "domain_proposal.json", Domains: []activities.ProposedDomain{{ID: "dom-1", DomainName: "Core"}}}, nil
		})
	// PersistExecutionResultActivity — CAMBIO esta sesión (Paso 1, action graph):
	// MandateExecutionWorkflow ahora la invoca de verdad como child workflow real
	// (antes era un placeholder que no llamaba ninguna activity). Sin este mock,
	// ambos tests de este fixture fallarían con "unable to find activity type".
	env.OnActivity(activities.PersistExecutionResultActivity, mock.Anything, mock.Anything).
		Return(activities.PersistExecutionResultResult{StateVersion: 1}, nil)
	// AdvancePhaseActivity — CAMBIO esta sesión (Paso 2, transición de fase):
	// el workflow ahora la invoca 3-4 veces (ingest, cluster, validate, y
	// signed→completed condicional a execResult.Success). Sin este mock,
	// ambos tests de este fixture fallarían con "unable to find activity
	// type" apenas termine la fase ingest. La validación real de
	// transiciones (ValidateForwardOnly) ya se prueba de forma aislada en
	// mandate_genesis_phase_activities_test.go — acá solo hace falta que la
	// activity exista para el test runner de Temporal.
	// Registra la Phase en `order` (mismo mecanismo que PublishMandateEventActivity
	// abajo) — no solo para que la activity exista, sino para que los dos
	// tests de Paso 2 más abajo puedan verificar la secuencia sin necesitar
	// pisar este mock (testify no permite pisar un mock ya registrado con
	// matchers idénticos — el primero registrado gana siempre).
	env.OnActivity(activities.AdvancePhaseActivity, mock.Anything, mock.Anything).
		Return(func(_ context.Context, input activities.AdvancePhaseInput) (activities.AdvancePhaseResult, error) {
			orderSlice = append(orderSlice, "advance:"+input.Phase)
			return activities.AdvancePhaseResult{StateVersion: 1}, nil
		})
	env.OnActivity(activities.PublishMandateEventActivity, mock.Anything, mock.Anything, mock.Anything).
		Return(func(event string, _ map[string]interface{}) error { orderSlice = append(orderSlice, "event:"+event); return nil })
	// Gravity: MandateExecutionWorkflow (child, corre de verdad en este
	// fixture) ahora garantiza espina+SESSION+resolución antes de
	// scaffold — cowork nodo SESSION/MANDATE (2026-09-02). Sin estos tres
	// mocks, ambos tests de este fixture fallarían con "unable to find
	// activity type" apenas el child arrancara — mismo síntoma que ya
	// documentan los mocks de ScaffoldDomainActivity/PersistExecutionResultActivity
	// más arriba.
	env.OnActivity(activities.EnsureGravityMandateNodeActivity, mock.Anything, mock.Anything).
		Return(func(_ context.Context, input activities.EnsureGravityMandateNodeInput) (activities.EnsureGravityMandateNodeResult, error) {
			if input.ProjectID != "project-id-fixture" {
				return activities.EnsureGravityMandateNodeResult{}, errors.New("ProjectID no llegó al child MandateExecutionWorkflow")
			}
			return activities.EnsureGravityMandateNodeResult{
				NucleusRoot: "fixture-nucleus", OrganizationID: "org-fixture", MandateNodePath: "fixture-mandate-path", Created: true,
			}, nil
		})
	env.OnActivity(activities.CreateGravitySessionActivity, mock.Anything, mock.Anything).
		Return(activities.CreateGravitySessionResult{SessionNodePath: "fixture-session-path", Created: true}, nil)
	env.OnActivity(activities.ResolveActiveGravityActivity, mock.Anything, mock.Anything).
		Return(activities.ResolveActiveGravityResult{}, nil)
	env.OnActivity(activities.PersistExecutionGravityActivity, mock.Anything, mock.Anything).
		Return(activities.PersistExecutionGravityResult{StateVersion: 1}, nil)
	env.RegisterDelayedCallback(func() {
		env.SignalWorkflow("mandate:genesis:validate", GenesisValidateSignal{Approved: true, Domains: []DomainConfirmation{{ID: "dom-1", DomainName: "Core"}}})
	}, time.Second)
	return env, &orderSlice, &fail
}

func TestMandateGenesisSignatureEventFollowsDurableSignedState(t *testing.T) {
	env, order, _ := genesisWorkflowFixture(t)
	env.OnActivity(activities.PersistHumanSyncActivity, mock.Anything, mock.Anything).
		Return(func(activities.PersistHumanSyncInput) (activities.PersistHumanSyncResult, error) {
			*order = append(*order, "state:pending")
			return activities.PersistHumanSyncResult{StateVersion: 2}, nil
		})
	env.OnActivity(activities.SignMandateActivity, mock.Anything, mock.Anything, mock.Anything).
		Return(func(string, string) (activities.SignMandateResult, error) {
			*order = append(*order, "state:signed")
			return activities.SignMandateResult{ActionsCreated: 1, SignedAt: "2026-08-27T10:00:00Z", Actions: []activities.Action{{DomainName: "Core", IntentType: "gen"}}}, nil
		})
	env.ExecuteWorkflow(MandateGenesisBuildWorkflow, GenesisBuildInput{MandateID: "m1", MandateType: "genesis", Project: "fixture", ProjectID: "project-id-fixture", MandatesRoot: "fixture"})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(*order, "|")
	// CAMBIO (esta sesión, Paso 2): antes se pedía adyacencia exacta
	// "state:signed|event:mandate:genesis:signed". Ya no es adyacente —
	// AdvancePhaseActivity(Phase:"validate") ahora corre legítimamente
	// entre la firma y la publicación del evento (Hook 3, currentPhase
	// validate→signed) — así que lo que importa (que el estado firmado sea
	// durable ANTES de publicar el evento) se verifica por posición, no por
	// adyacencia literal.
	signedIdx := strings.Index(joined, "state:signed")
	eventIdx := strings.Index(joined, "event:mandate:genesis:signed")
	if signedIdx == -1 || eventIdx == -1 || signedIdx > eventIdx {
		t.Fatalf("expected state:signed before event:mandate:genesis:signed, got order=%s", joined)
	}
	if strings.Contains(joined, "mark-effect-applied") || strings.Contains(joined, "commit-turn") || strings.Contains(joined, "advance-turn") {
		t.Fatalf("BSIP wiring activated: %s", joined)
	}
}

// CAMBIO (esta sesión, Paso 2): las dos pruebas de abajo cubren lo que el
// fixture compartido no puede — el orden y las Phase exactas con las que se
// invoca AdvancePhaseActivity a lo largo de una corrida feliz completa, y la
// regla explícitamente confirmada con el usuario de que currentPhase NO
// llega a "completed" cuando el child MandateExecutionWorkflow reporta
// Success:false (soft-failure — el child no retorna error de Go, ver
// MandateExecutionResult).

func TestMandateGenesisAdvancesPhaseInOrderThroughCompletion(t *testing.T) {
	env, order, _ := genesisWorkflowFixture(t)
	env.OnActivity(activities.PersistHumanSyncActivity, mock.Anything, mock.Anything).
		Return(activities.PersistHumanSyncResult{StateVersion: 2}, nil)
	env.OnActivity(activities.SignMandateActivity, mock.Anything, mock.Anything, mock.Anything).
		Return(activities.SignMandateResult{ActionsCreated: 1, SignedAt: "2026-08-27T10:00:00Z", Actions: []activities.Action{{DomainName: "Core", IntentType: "gen"}}}, nil)

	env.ExecuteWorkflow(MandateGenesisBuildWorkflow, GenesisBuildInput{MandateID: "m3", MandateType: "genesis", Project: "fixture", ProjectID: "project-id-fixture", MandatesRoot: "fixture"})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}

	joined := strings.Join(*order, "|")
	// Orden esperado: ingest completa fase ingest → cluster completa fase
	// cluster → sign completa fase validate → execute (child con Success:true
	// vía el fixture, que mockea ScaffoldDomainActivity/PersistExecutionResultActivity
	// sin error) completa fase signed (→ currentPhase queda en "completed").
	// Se verifica por posición relativa, no por adyacencia literal — entre
	// medio corren los eventos PublishMandateEventActivity y otras
	// activities (PersistHumanSyncActivity, SignMandateActivity, etc.).
	idxIngest := strings.Index(joined, "advance:ingest")
	idxCluster := strings.Index(joined, "advance:cluster")
	idxValidate := strings.Index(joined, "advance:validate")
	idxSigned := strings.Index(joined, "advance:signed")
	if idxIngest == -1 || idxCluster == -1 || idxValidate == -1 || idxSigned == -1 {
		t.Fatalf("expected all four AdvancePhaseActivity calls (ingest, cluster, validate, signed), got order=%s", joined)
	}
	if !(idxIngest < idxCluster && idxCluster < idxValidate && idxValidate < idxSigned) {
		t.Fatalf("expected AdvancePhaseActivity invoked in order ingest→cluster→validate→signed, got order=%s", joined)
	}
}

func TestMandateGenesisDoesNotAdvanceToCompletedWhenExecutionFails(t *testing.T) {
	env, order, failRealScaffold := genesisWorkflowFixture(t)
	env.OnActivity(activities.PersistHumanSyncActivity, mock.Anything, mock.Anything).
		Return(activities.PersistHumanSyncResult{StateVersion: 2}, nil)
	env.OnActivity(activities.SignMandateActivity, mock.Anything, mock.Anything, mock.Anything).
		Return(activities.SignMandateResult{ActionsCreated: 1, SignedAt: "2026-08-27T10:00:00Z", Actions: []activities.Action{{DomainName: "Core", IntentType: "gen"}}}, nil)
	// El scaffold real (Mode:real, dentro del child) va a fallar — ver
	// comentario de failRealScaffold en genesisWorkflowFixture. La fase
	// cluster (Mode:dry_run, en el padre) sigue funcionando normalmente.
	*failRealScaffold = true

	env.ExecuteWorkflow(MandateGenesisBuildWorkflow, GenesisBuildInput{MandateID: "m4", MandateType: "genesis", Project: "fixture", ProjectID: "project-id-fixture", MandatesRoot: "fixture"})
	if err := env.GetWorkflowError(); err != nil {
		t.Fatalf("no se esperaba error de workflow (soft-failure vía execResult.Success): %v", err)
	}

	joined := strings.Join(*order, "|")
	if !strings.Contains(joined, "advance:ingest") || !strings.Contains(joined, "advance:cluster") || !strings.Contains(joined, "advance:validate") {
		t.Fatalf("expected ingest/cluster/validate to still advance before execute fails, got order=%s", joined)
	}
	if strings.Contains(joined, "advance:signed") {
		t.Fatalf("currentPhase no debe avanzar a completed cuando execResult.Success=false, got order=%s", joined)
	}
}

func TestMandateGenesisSignatureFailurePersistsBeforeErrorEvent(t *testing.T) {
	env, order, _ := genesisWorkflowFixture(t)
	env.OnActivity(activities.PersistHumanSyncActivity, mock.Anything, mock.Anything).
		Return(activities.PersistHumanSyncResult{StateVersion: 2}, nil)
	env.OnActivity(activities.SignMandateActivity, mock.Anything, mock.Anything, mock.Anything).
		Return(activities.SignMandateResult{}, errors.New("sign failed"))
	env.OnActivity(activities.PersistSignatureFailureActivity, mock.Anything, mock.Anything).
		Return(func(activities.PersistSignatureFailureInput) (activities.PersistSignatureFailureResult, error) {
			*order = append(*order, "state:failed")
			return activities.PersistSignatureFailureResult{StateVersion: 3}, nil
		})
	env.ExecuteWorkflow(MandateGenesisBuildWorkflow, GenesisBuildInput{MandateID: "m2", MandateType: "genesis", Project: "fixture", ProjectID: "project-id-fixture", MandatesRoot: "fixture"})
	if env.GetWorkflowError() == nil {
		t.Fatal("expected workflow failure")
	}
	joined := strings.Join(*order, "|")
	if !strings.Contains(joined, "state:failed|event:mandate:genesis:error") {
		t.Fatalf("order=%s", joined)
	}
}
