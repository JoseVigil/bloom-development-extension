package gene

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
)

func (s *Store) Materialize(req MaterializeRequest) (receipt Receipt, retErr error) {
	s.logEvent("INFO", "GENE_MATERIALIZATION_STARTED", map[string]any{"project_id": req.ProjectID, "contribution_id": req.Contribution.ContributionID, "expected_generation": req.ExpectedGeneration})
	defer func() {
		if retErr != nil {
			s.logEvent("ERROR", "GENE_MATERIALIZATION_FAILED", map[string]any{"project_id": req.ProjectID, "contribution_id": req.Contribution.ContributionID, "error": retErr.Error()})
		}
	}()
	if req.ProjectID == "" {
		return Receipt{}, ErrProjectIDRequired
	}
	if req.Identity.ProjectID != req.ProjectID || req.Contribution.ProjectID != req.ProjectID {
		return Receipt{}, ErrProjectMismatch
	}
	if !idPattern.MatchString(req.Identity.GeneID) || req.Contribution.GeneID != req.Identity.GeneID || !idPattern.MatchString(req.Contribution.ContributionID) {
		return Receipt{}, ErrVerificationFailed
	}
	if req.Contribution.Ratification.Classification != "test_only" || !req.Contribution.Ratification.Synthetic || req.Contribution.Ratification.Productive {
		return Receipt{}, ErrContributionNotRatified
	}
	if req.Identity.Origin.DecisionID != req.Contribution.Ratification.DecisionID || req.Identity.Origin.MandateID != req.Contribution.MandateID || req.Identity.Origin.IntentID != req.Contribution.IntentID {
		return Receipt{}, ErrContributionNotRatified
	}
	dir, err := s.initializeProject(req.ProjectID)
	if err != nil {
		return Receipt{}, err
	}
	lock, err := acquireProjectLock(filepath.Join(dir, "project.lock"))
	if err != nil {
		return Receipt{}, err
	}
	defer lock.release()

	contribution := normalizeContribution(req.Contribution)
	contribution.SchemaVersion = SchemaVersion
	resolved, err := ResolveAssets(req.ProjectID, contribution.Assets, req.Repositories)
	if err != nil {
		return Receipt{}, err
	}
	sort.Slice(resolved, func(i, j int) bool { return resolved[i].AssetID < resolved[j].AssetID })
	contribution.Assets = resolved
	payload, err := withoutField(contribution, "contribution_digest")
	if err != nil {
		return Receipt{}, err
	}
	calculatedContributionDigest, _, err := digestValue(payload)
	if err != nil {
		return Receipt{}, err
	}
	if contribution.ContributionDigest != "" && contribution.ContributionDigest != calculatedContributionDigest {
		return Receipt{}, ErrContributionIDConflict
	}
	contribution.ContributionDigest = calculatedContributionDigest

	if receipt, ok, err := s.findReplay(req.ProjectID, contribution.ContributionID, contribution.ContributionDigest); err != nil && !errors.Is(err, ErrRecoveryRequired) {
		return Receipt{}, err
	} else if ok {
		s.logEvent("SUCCESS", "GENE_MATERIALIZATION_REPLAYED", map[string]any{"project_id": req.ProjectID, "contribution_id": contribution.ContributionID, "canonical_commit_digest": receipt.CanonicalCommitDigest, "published_generation": receipt.PublishedGeneration})
		return receipt, nil
	}
	head, observedHeadDigest, err := s.loadHead(req.ProjectID)
	if err != nil {
		return Receipt{}, err
	}
	if head.Generation != req.ExpectedGeneration || (req.ExpectedHeadDigest != "" && req.ExpectedHeadDigest != observedHeadDigest) {
		s.logEvent("WARNING", "GENE_PROJECT_GENERATION_CONFLICT", map[string]any{"project_id": req.ProjectID, "contribution_id": contribution.ContributionID, "expected_generation": req.ExpectedGeneration, "observed_generation": head.Generation})
		return Receipt{}, ErrProjectGeneration
	}
	current, exists := head.Genes[req.Identity.GeneID]
	if exists {
		if contribution.BaseRevisionDigest == nil || *contribution.BaseRevisionDigest != current.CurrentRevisionDigest {
			return Receipt{}, ErrBaseRevisionConflict
		}
	} else if contribution.BaseRevisionDigest != nil {
		return Receipt{}, ErrBaseRevisionConflict
	}

	verificationDigest, _, err := digestValue(struct {
		Assets             []AssetRef `json:"assets"`
		ContributionDigest string     `json:"contribution_digest"`
	}{resolved, contribution.ContributionDigest})
	if err != nil {
		return Receipt{}, err
	}
	revision := Revision{
		SchemaVersion: SchemaVersion, ProjectID: req.ProjectID, GeneID: req.Identity.GeneID,
		ParentRevisionDigest: contribution.BaseRevisionDigest, DeclaredFunction: contribution.DeclaredFunction,
		ConstitutiveAssets: resolved, ProducedByContribution: contribution.ContributionID,
		StableProvenance: contribution.StableProvenance,
		Verification:     Verification{EvidenceDigest: verificationDigest, Verifier: SchemaVersion},
	}
	revisionPayload, _ := withoutField(revision, "revision_digest")
	revision.RevisionDigest, _, err = digestValue(revisionPayload)
	if err != nil {
		return Receipt{}, err
	}

	identity := req.Identity
	identity.SchemaVersion = SchemaVersion
	identityRef, err := s.writeObject(req.ProjectID, "identities", identity.GeneID, false, identity)
	if err != nil {
		return Receipt{}, err
	}
	contributionRef, err := s.writeObject(req.ProjectID, "contributions", contribution.ContributionID, false, contribution)
	if err != nil {
		if errors.Is(err, os.ErrExist) {
			return Receipt{}, ErrContributionIDConflict
		}
		return Receipt{}, errors.Join(ErrContributionIDConflict, err)
	}
	revisionRef, err := s.writeObject(req.ProjectID, "revisions", revision.RevisionDigest, true, revision)
	if err != nil {
		return Receipt{}, errors.Join(ErrRevisionCollision, err)
	}

	var previous *string
	if head.CanonicalCommitDigest != "" {
		x := head.CanonicalCommitDigest
		previous = &x
	}
	created := []string{}
	if !exists {
		created = append(created, identity.GeneID)
	}
	identityDigest, _, err := digestValue(identity)
	if err != nil {
		return Receipt{}, err
	}
	identityObject := ObjectRef{Kind: "identity", ID: identity.GeneID, Digest: identityDigest, Ref: identityRef}
	contributionObject := ObjectRef{Kind: "contribution", ID: contribution.ContributionID, Digest: contribution.ContributionDigest, Ref: contributionRef}
	revisionObject := ObjectRef{Kind: "revision", ID: revision.RevisionDigest, Digest: revision.RevisionDigest, Ref: revisionRef}
	objects := []ObjectRef{identityObject, contributionObject, revisionObject}
	sort.Slice(objects, func(i, j int) bool { return objects[i].Ref < objects[j].Ref })
	commit := CanonicalCommit{
		SchemaVersion: SchemaVersion, ProjectID: req.ProjectID, ExpectedGeneration: head.Generation,
		PublishedGeneration: head.Generation + 1, PreviousCommitDigest: previous,
		Contributions: []ObjectRef{contributionObject}, CreatedGeneIDs: created,
		RevisionTransitions: []RevisionTransition{{GeneID: identity.GeneID, From: contribution.BaseRevisionDigest, To: revision.RevisionDigest}},
		InstalledObjects:    objects,
	}
	commitPayload, _ := withoutField(commit, "canonical_commit_digest")
	commit.CanonicalCommitDigest, _, err = digestValue(commitPayload)
	if err != nil {
		return Receipt{}, err
	}
	commitRef, err := s.writeObject(req.ProjectID, "commits", commit.CanonicalCommitDigest, true, commit)
	if err != nil {
		return Receipt{}, err
	}
	_ = commitRef

	txID, _, err := digestValue(struct {
		ProjectID          string `json:"project_id"`
		ContributionID     string `json:"contribution_id"`
		ContributionDigest string `json:"contribution_digest"`
		ExpectedGeneration uint64 `json:"expected_generation"`
	}{req.ProjectID, contribution.ContributionID, contribution.ContributionDigest, head.Generation})
	if err != nil {
		return Receipt{}, err
	}
	tx := Transaction{SchemaVersion: SchemaVersion, TransactionID: txID, ProjectID: req.ProjectID, ContributionID: contribution.ContributionID, ContributionDigest: contribution.ContributionDigest, ExpectedGeneration: head.Generation, State: "READY_TO_COMMIT", CanonicalCommitDigest: commit.CanonicalCommitDigest}
	if _, err = s.writeObject(req.ProjectID, "transactions", txID, true, tx); err != nil {
		return Receipt{}, err
	}
	s.logEvent("INFO", "GENE_CANONICAL_OBJECTS_INSTALLED", map[string]any{"project_id": req.ProjectID, "contribution_id": contribution.ContributionID, "revision_digest": revision.RevisionDigest, "canonical_commit_digest": commit.CanonicalCommitDigest})

	if s.hook != nil {
		if err = s.hook("objects_written"); err != nil {
			return Receipt{}, err
		}
	}
	newHead := cloneHead(head)
	newHead.Generation++
	newHead.CanonicalCommitDigest = commit.CanonicalCommitDigest
	newHead.Genes[identity.GeneID] = GeneHead{IdentityRef: identityRef, LifecycleStatus: "active", CurrentRevisionDigest: revision.RevisionDigest}
	degraded, err := s.publishHead(dir, newHead)
	if err != nil {
		return Receipt{}, err
	}
	durability := "platform_full"
	if degraded {
		durability = "fsync_fallback_degraded"
		s.logEvent("WARNING", "GENE_DURABILITY_DEGRADED", map[string]any{"project_id": req.ProjectID, "canonical_commit_digest": commit.CanonicalCommitDigest, "capability": durability})
	}
	receipt = Receipt{Status: "committed", ProjectID: req.ProjectID, ContributionID: contribution.ContributionID, ContributionDigest: contribution.ContributionDigest, RevisionDigest: revision.RevisionDigest, CanonicalCommitDigest: commit.CanonicalCommitDigest, PublishedGeneration: newHead.Generation, DurabilityCapability: durability}
	s.logEvent("SUCCESS", "GENE_CANONICAL_HEAD_PUBLISHED", map[string]any{"project_id": req.ProjectID, "contribution_id": contribution.ContributionID, "revision_digest": revision.RevisionDigest, "canonical_commit_digest": commit.CanonicalCommitDigest, "published_generation": newHead.Generation, "durability_capability": durability})
	return receipt, nil
}

func (s *Store) findReplay(projectID, contributionID, contributionDigest string) (Receipt, bool, error) {
	path, err := s.immutablePath(projectID, "contributions", contributionID, false)
	if err != nil {
		return Receipt{}, false, err
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return Receipt{}, false, nil
	}
	if err != nil {
		return Receipt{}, false, err
	}
	var stored Contribution
	if err = strictDecode(raw, &stored); err != nil {
		return Receipt{}, false, err
	}
	payload, err := withoutField(stored, "contribution_digest")
	if err != nil {
		return Receipt{}, false, err
	}
	actual, _, err := digestValue(payload)
	if err != nil || actual != stored.ContributionDigest || stored.ContributionDigest != contributionDigest {
		return Receipt{}, false, ErrContributionIDConflict
	}
	return s.recoverContribution(projectID, contributionID, contributionDigest)
}

func validateCommitReferences(c CanonicalCommit) error {
	if c.PublishedGeneration != c.ExpectedGeneration+1 || len(c.RevisionTransitions) == 0 {
		return fmt.Errorf("%w: invalid commit", ErrVerificationFailed)
	}
	return nil
}
