package acceptance

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/gene"
)

const (
	g2ProjectID      = "00000000-0000-4000-8000-000000000101"
	g2GeneID         = "00000000-0000-4000-8000-000000000102"
	g2ContributionID = "00000000-0000-4000-8000-000000000103"
	g2RepositoryID   = "00000000-0000-4000-8000-000000000104"
	g2MandateID      = "00000000-0000-4000-8000-000000000105"
	g2IntentID       = "00000000-0000-4000-8000-000000000106"
	g2DecisionID     = "00000000-0000-4000-8000-000000000107"
)

type g2Evidence struct {
	Kind                    string       `json:"kind"`
	RunID                   string       `json:"runId"`
	ProjectID               string       `json:"projectId"`
	GeneID                  string       `json:"geneId"`
	ContributionID          string       `json:"contributionId"`
	WorkspaceEffect         string       `json:"workspaceEffect"`
	DomainRelationshipCount int          `json:"domainRelationshipCount"`
	HeadGeneration          uint64       `json:"headGeneration"`
	HeadToCommit            bool         `json:"headToCommit"`
	CommitToRevision        bool         `json:"commitToRevision"`
	CommitToContribution    bool         `json:"commitToContribution"`
	ReceiptVerified         bool         `json:"receiptVerified"`
	ReplayVerified          bool         `json:"replayVerified"`
	ContentionRejected      bool         `json:"contentionRejected"`
	Receipt                 gene.Receipt `json:"receipt"`
}

func g2Digest(value any) (string, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	canonical, err := authority.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return "sha256:" + hex.EncodeToString(sum[:]), nil
}

func g2ProductiveRequest(t *testing.T, root, repository string, contributionID string, expectedGeneration uint64) (*gene.Store, gene.MaterializeRequest) {
	t.Helper()
	bindingStore := &authority.RepositoryBindingStore{Path: filepath.Join(root, "authority", "repository-bindings.json")}
	binding := authority.RepositoryBinding{SchemaVersion: "bloom.repository-binding/v1", ProjectID: g2ProjectID,
		RepositoryID: g2RepositoryID, Root: repository, InstallationID: "runner-core-g2", AuthorityVersion: "ephemeral-1",
		AuthorizedBy: "runner-core-ephemeral-authority", Status: "active", Revision: 1, AuthorizedAt: time.Now().UTC()}
	if _, err := os.Stat(bindingStore.Path); errors.Is(err, os.ErrNotExist) {
		if err := bindingStore.Save(binding); err != nil {
			t.Fatal(err)
		}
	} else if err != nil {
		t.Fatal(err)
	}

	identity := gene.Identity{SchemaVersion: gene.SchemaVersion, ProjectID: g2ProjectID, GeneID: g2GeneID,
		Function: "Demonstrate the first isolated canonical Gene", Origin: gene.Origin{MandateID: g2MandateID, IntentID: g2IntentID, DecisionID: g2DecisionID}}
	contribution := gene.Contribution{SchemaVersion: gene.SchemaVersion, ContributionID: contributionID, ProjectID: g2ProjectID,
		GeneID: g2GeneID, MandateID: g2MandateID, IntentID: g2IntentID, DeclaredFunction: identity.Function,
		Assets:           []gene.AssetRef{{ProjectID: g2ProjectID, RepositoryID: g2RepositoryID, Kind: "document", RepositoryRelativePath: "FIRST_GENE.md"}},
		Ratification:     gene.RatificationEvidence{Classification: "productive", Productive: true, DecisionID: g2DecisionID},
		StableProvenance: map[string]string{"runner": "runner-core", "scenario": "gene-g2"}}
	resolved, _, err := gene.ResolveAuthorizedAssets(g2ProjectID, contribution.Assets, bindingStore)
	if err != nil {
		t.Fatal(err)
	}
	contribution.Assets = resolved
	type contributionPayload struct {
		SchemaVersion      string                    `json:"schema_version"`
		ContributionID     string                    `json:"contribution_id"`
		ProjectID          string                    `json:"project_id"`
		GeneID             string                    `json:"gene_id"`
		BaseRevisionDigest *string                   `json:"base_revision_digest"`
		MandateID          string                    `json:"mandate_id"`
		IntentID           string                    `json:"intent_id"`
		DeclaredFunction   string                    `json:"declared_function"`
		Assets             []gene.AssetRef           `json:"assets"`
		Ratification       gene.RatificationEvidence `json:"ratification"`
		StableProvenance   map[string]string         `json:"stable_provenance"`
	}
	digest, err := g2Digest(contributionPayload{contribution.SchemaVersion, contribution.ContributionID, contribution.ProjectID, contribution.GeneID,
		contribution.BaseRevisionDigest, contribution.MandateID, contribution.IntentID, contribution.DeclaredFunction, contribution.Assets, contribution.Ratification, contribution.StableProvenance})
	if err != nil {
		t.Fatal(err)
	}
	contribution.ContributionDigest = digest
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	payload := authority.GeneRatificationPayload{SchemaVersion: "bloom.gene-ratification/v1", Issuer: "runner-core-ephemeral-authority", KeyID: "ephemeral-g2-key",
		Permission: authority.PermissionGeneContributionRatify, PrincipalID: "runner-core", ProjectID: g2ProjectID, GeneID: g2GeneID,
		ContributionID: contributionID, ContributionDigest: digest, MandateID: g2MandateID, IntentID: g2IntentID, DecisionID: g2DecisionID,
		RepositoryIDs: []string{g2RepositoryID}, AuthorityVersion: "ephemeral-1", AuthorityStateDigest: "sha256:" + strings.Repeat("a", 64),
		ControlRevisions: []string{"runner-core:1"}, Outcome: "ratified", DecidedAt: time.Now().UTC()}
	envelope, err := authority.SignGeneRatification(payload, priv)
	if err != nil {
		t.Fatal(err)
	}
	logger, err := core.InitLogger(&core.Paths{LogsDir: filepath.Join(root, "logs"), TelemetryDir: filepath.Join(root, "logs")}, "GENE", true)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = logger.Close() })
	store := &gene.Store{Root: filepath.Join(root, "nucleus"), Logger: logger, RepositoryResolver: bindingStore,
		RatificationVerifier: authority.GeneRatificationVerifier{TrustedKeys: map[string]ed25519.PublicKey{"ephemeral-g2-key": pub}}}
	return store, gene.MaterializeRequest{ProjectID: g2ProjectID, ExpectedGeneration: expectedGeneration, Identity: identity,
		Contribution: contribution, WorkspaceEffect: gene.WorkspaceEffectNone, RatificationEnvelope: envelope}
}

// TestRunnerCoreGeneG2 is compiled as a one-shot executable by RUNNER CORE.
// It never opens a productive Project or Mandate and writes only below its disposable root.
func TestRunnerCoreGeneG2(t *testing.T) {
	root, runID, evidencePath := os.Getenv("RUNNER_CORE_GENE_G2_ROOT"), os.Getenv("RUNNER_CORE_RUN_ID"), os.Getenv("RUNNER_CORE_GENE_G2_EVIDENCE")
	if root == "" && runID == "" {
		t.Skip("RUNNER CORE Gene G2 executable only")
	}
	if root == "" || runID == "" || evidencePath != filepath.Join(root, ".runner-core", "gene-g2-evidence.json") {
		t.Fatal("invalid isolated G2 environment")
	}
	repository := filepath.Join(root, "repository")
	asset := filepath.Join(repository, "FIRST_GENE.md")
	if info, err := os.Stat(asset); err != nil || !info.Mode().IsRegular() {
		t.Fatal("pre-existing asset missing")
	}
	store, request := g2ProductiveRequest(t, root, repository, g2ContributionID, 0)
	receipt, err := store.Materialize(request)
	if err != nil {
		t.Fatal(err)
	}
	if err = store.VerifyMaterializationReceipt(receipt); err != nil {
		t.Fatal(err)
	}
	replay, err := store.Materialize(request)
	if err != nil || !replay.Replay || replay.CanonicalCommitDigest != receipt.CanonicalCommitDigest {
		t.Fatalf("replay: %+v %v", replay, err)
	}

	staleStore, stale := g2ProductiveRequest(t, root, repository, "00000000-0000-4000-8000-000000000108", 0)
	if _, err = staleStore.Materialize(stale); !errors.Is(err, gene.ErrProjectGeneration) {
		t.Fatalf("contention: %v", err)
	}
	project := filepath.Join(root, "nucleus", ".genes", "projects", g2ProjectID)
	var head gene.Head
	var commit gene.CanonicalCommit
	var revision gene.Revision
	var contribution gene.Contribution
	read := func(path string, target any) {
		raw, e := os.ReadFile(path)
		if e != nil || json.Unmarshal(raw, target) != nil {
			t.Fatalf("read canonical object %s: %v", path, e)
		}
	}
	read(filepath.Join(project, "head.json"), &head)
	read(filepath.Join(project, "commits", strings.TrimPrefix(receipt.CanonicalCommitDigest, "sha256:")+".json"), &commit)
	read(filepath.Join(project, "revisions", strings.TrimPrefix(receipt.RevisionDigest, "sha256:")+".json"), &revision)
	read(filepath.Join(project, "contributions", g2ContributionID+".json"), &contribution)
	domainEntries, err := os.ReadDir(filepath.Join(project, "relations", "domain-gene"))
	if err != nil {
		t.Fatal(err)
	}
	evidence := g2Evidence{Kind: "runner_core_gene_g2", RunID: runID, ProjectID: g2ProjectID, GeneID: g2GeneID, ContributionID: g2ContributionID,
		WorkspaceEffect: receipt.WorkspaceEffect, DomainRelationshipCount: len(domainEntries), HeadGeneration: head.Generation,
		HeadToCommit:         head.CanonicalCommitDigest == receipt.CanonicalCommitDigest,
		CommitToRevision:     len(commit.RevisionTransitions) == 1 && commit.RevisionTransitions[0].To == revision.RevisionDigest,
		CommitToContribution: len(commit.Contributions) == 1 && commit.Contributions[0].ID == contribution.ContributionID && commit.Contributions[0].Digest == contribution.ContributionDigest,
		ReceiptVerified:      true, ReplayVerified: true, ContentionRejected: true, Receipt: receipt}
	if evidence.WorkspaceEffect != gene.WorkspaceEffectNone || evidence.DomainRelationshipCount != 0 || evidence.HeadGeneration != 1 || !evidence.HeadToCommit || !evidence.CommitToRevision || !evidence.CommitToContribution {
		t.Fatalf("invalid graph evidence: %+v", evidence)
	}
	raw, err := json.MarshalIndent(evidence, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(evidencePath, raw, 0600); err != nil {
		t.Fatal(err)
	}
}
