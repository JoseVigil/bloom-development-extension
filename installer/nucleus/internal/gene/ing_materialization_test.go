package gene

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type ingRatificationVerifier struct{}

func (ingRatificationVerifier) VerifyGeneRatification(_ []byte, projectID, geneID, contributionID, contributionDigest, mandateID, intentID, decisionID string, repositoryIDs []string) (string, error) {
	if projectID == "" || geneID == "" || contributionID == "" || contributionDigest == "" || mandateID == "" || intentID == "" || decisionID == "" || len(repositoryIDs) != 1 {
		return "", errors.New("invalid test ratification scope")
	}
	return "sha256:" + strings.Repeat("a", 64), nil
}

type ingRepositoryResolver struct{ root string }

func (r ingRepositoryResolver) ResolveRepository(projectID, repositoryID string) (string, string, error) {
	if projectID == "" || repositoryID == "" {
		return "", "", ErrRepositoryBinding
	}
	return r.root, "sha256:" + strings.Repeat("b", 64), nil
}

func ingMaterializationFixture(t *testing.T) (*Store, INGMaterializationInput, string) {
	t.Helper()
	root, repository := t.TempDir(), t.TempDir()
	if err := os.WriteFile(filepath.Join(repository, "gene.md"), []byte("governed gene\n"), 0600); err != nil {
		t.Fatal(err)
	}
	projectID := "11111111-1111-4111-8111-111111111111"
	geneID := "33333333-3333-4333-8333-333333333333"
	contributionID := "44444444-4444-4444-8444-444444444444"
	mandateID, intentID, decisionID := "mandate-1", "intent-1", "decision-1"
	binding := INGMaterializationBinding{
		ProjectID: projectID, GeneID: geneID, ContributionID: contributionID, MandateID: mandateID,
		ContractDigest: strings.Repeat("c", 64), INGActionID: "ing-1", IntentID: intentID, DecisionID: decisionID,
		DecisionDigest: strings.Repeat("d", 64), HumanDecision: "approved",
		INGResultDigest: strings.Repeat("e", 64), INGLedgerDigest: strings.Repeat("f", 64),
	}
	identity := Identity{SchemaVersion: SchemaVersion, ProjectID: projectID, GeneID: geneID, Function: "Govern the fixture.",
		Origin: Origin{MandateID: mandateID, IntentID: intentID, DecisionID: decisionID}}
	contribution := Contribution{SchemaVersion: SchemaVersion, ContributionID: contributionID, ProjectID: projectID, GeneID: geneID,
		MandateID: mandateID, IntentID: intentID, DeclaredFunction: identity.Function,
		Assets:           []AssetRef{{ProjectID: projectID, RepositoryID: "22222222-2222-4222-8222-222222222222", Kind: "document", RepositoryRelativePath: "gene.md"}},
		Ratification:     RatificationEvidence{Classification: "productive", Productive: true, DecisionID: decisionID},
		StableProvenance: map[string]string{"ing_action_id": "ing-1"}}
	store := &Store{Root: root, RatificationVerifier: ingRatificationVerifier{}, RepositoryResolver: ingRepositoryResolver{root: repository}}
	request := MaterializeRequest{ProjectID: projectID, ExpectedGeneration: 0, Identity: identity, Contribution: contribution,
		WorkspaceEffect: WorkspaceEffectNone, RatificationEnvelope: []byte(`{"test":"ratification"}`)}
	return store, INGMaterializationInput{Binding: binding, Request: request}, filepath.Join(root, "mandates", mandateID, "evidence", "gene-materialization.json")
}

func TestMaterializeRatifiedINGPersistsAndVerifiesExactBinding(t *testing.T) {
	store, input, path := ingMaterializationFixture(t)
	first, err := store.MaterializeRatifiedING(input, path)
	if err != nil {
		t.Fatal(err)
	}
	if first.ReceiptDigest == "" || first.Materialization.CanonicalCommitDigest == "" || first.Materialization.Replay {
		t.Fatalf("invalid receipt: %+v", first)
	}
	again, err := store.MaterializeRatifiedING(input, path)
	if err != nil || !reflect.DeepEqual(again, first) {
		t.Fatalf("replay changed durable evidence: %+v %v", again, err)
	}
	verified, err := store.VerifyINGMaterializationReceipt(path, input.Binding)
	if err != nil || !reflect.DeepEqual(verified, first) {
		t.Fatalf("verification: %+v %v", verified, err)
	}
}

func TestMaterializeRatifiedINGRejectsMissingOrChangedGovernance(t *testing.T) {
	store, input, path := ingMaterializationFixture(t)
	missing := input
	missing.Request.RatificationEnvelope = nil
	if _, err := store.MaterializeRatifiedING(missing, path); !errors.Is(err, ErrINGMaterializationBinding) {
		t.Fatalf("missing envelope accepted: %v", err)
	}
	if _, err := store.MaterializeRatifiedING(input, path); err != nil {
		t.Fatal(err)
	}
	changed := input.Binding
	changed.ContractDigest = strings.Repeat("9", 64)
	if _, err := store.VerifyINGMaterializationReceipt(path, changed); !errors.Is(err, ErrINGMaterializationBinding) {
		t.Fatalf("changed contract accepted: %v", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	raw[len(raw)-1] ^= 1
	if err = os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = store.VerifyINGMaterializationReceipt(path, input.Binding); !errors.Is(err, ErrINGMaterializationBinding) {
		t.Fatalf("tampered evidence accepted: %v", err)
	}
}

func TestMaterializeRatifiedINGDoesNotAcceptLogicalBrainContribution(t *testing.T) {
	store, input, path := ingMaterializationFixture(t)
	input.Request.Contribution.ContributionID = "contribution-logical-id"
	if _, err := store.MaterializeRatifiedING(input, path); !errors.Is(err, ErrINGMaterializationBinding) {
		t.Fatalf("legacy logical contribution accepted: %v", err)
	}
}
