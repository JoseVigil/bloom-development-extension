package gene

import (
	"errors"
	"os"
	"path/filepath"
)

func (s *Store) recoverContribution(projectID, contributionID, contributionDigest string) (Receipt, bool, error) {
	head, _, err := s.loadHead(projectID)
	if err != nil {
		return Receipt{}, false, err
	}
	dir, err := s.projectDir(projectID)
	if err != nil {
		return Receipt{}, false, err
	}
	entries, err := os.ReadDir(filepath.Join(dir, "commits"))
	if err != nil {
		return Receipt{}, false, err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		digest, e := digestFromFilename(entry.Name())
		if e != nil {
			return Receipt{}, false, e
		}
		commit, e := s.readCommit(projectID, digest)
		if e != nil {
			return Receipt{}, false, e
		}
		if e = validateCommitReferences(commit); e != nil {
			return Receipt{}, false, e
		}
		for _, ref := range commit.Contributions {
			if ref.ID != contributionID {
				continue
			}
			if ref.Digest != contributionDigest {
				return Receipt{}, false, ErrContributionIDConflict
			}
			if !commitReachable(s, projectID, head.CanonicalCommitDigest, digest) {
				return Receipt{}, false, ErrRecoveryRequired
			}
			transition := commit.RevisionTransitions[0]
			return Receipt{Status: "replay", ProjectID: projectID, ContributionID: contributionID, ContributionDigest: contributionDigest, RevisionDigest: transition.To, CanonicalCommitDigest: digest, PublishedGeneration: commit.PublishedGeneration, DurabilityCapability: "previously_published"}, true, nil
		}
	}
	return Receipt{}, false, ErrRecoveryRequired
}

func commitReachable(s *Store, projectID, current, target string) bool {
	for current != "" {
		if current == target {
			return true
		}
		commit, err := s.readCommit(projectID, current)
		if err != nil || commit.PreviousCommitDigest == nil {
			return false
		}
		current = *commit.PreviousCommitDigest
	}
	return false
}

func (s *Store) Recover(projectID string) ([]Receipt, error) {
	s.logEvent("INFO", "GENE_RECOVERY_STARTED", map[string]any{"project_id": projectID})
	dir, err := s.initializeProject(projectID)
	if err != nil {
		return nil, err
	}
	lock, err := acquireProjectLock(filepath.Join(dir, "project.lock"))
	if err != nil {
		return nil, err
	}
	defer lock.release()
	entries, err := os.ReadDir(filepath.Join(dir, "transactions"))
	if err != nil {
		return nil, err
	}
	var receipts []Receipt
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		digest, e := digestFromFilename(entry.Name())
		if e != nil {
			return nil, e
		}
		raw, e := os.ReadFile(filepath.Join(dir, "transactions", entry.Name()))
		if e != nil {
			return nil, e
		}
		var tx Transaction
		if e = strictDecode(raw, &tx); e != nil {
			return nil, e
		}
		expectedTxID, _, digestErr := digestValue(struct {
			ProjectID          string `json:"project_id"`
			ContributionID     string `json:"contribution_id"`
			ContributionDigest string `json:"contribution_digest"`
			ExpectedGeneration uint64 `json:"expected_generation"`
		}{tx.ProjectID, tx.ContributionID, tx.ContributionDigest, tx.ExpectedGeneration})
		if digestErr != nil || tx.TransactionID != digest || tx.TransactionID != expectedTxID || tx.State != "READY_TO_COMMIT" {
			return nil, ErrRecoveryRequired
		}
		r, ok, e := s.recoverContribution(projectID, tx.ContributionID, tx.ContributionDigest)
		if e != nil && !errors.Is(e, ErrRecoveryRequired) {
			s.logEvent("ERROR", "GENE_RECOVERY_FAILED", map[string]any{"project_id": projectID, "contribution_id": tx.ContributionID, "error": e.Error()})
			return nil, e
		}
		if ok {
			receipts = append(receipts, r)
			s.logEvent("SUCCESS", "GENE_TRANSACTION_RECOVERED", map[string]any{"project_id": projectID, "contribution_id": tx.ContributionID, "canonical_commit_digest": r.CanonicalCommitDigest, "published_generation": r.PublishedGeneration})
		} else {
			s.logEvent("WARNING", "GENE_TRANSACTION_RECOVERY_PENDING", map[string]any{"project_id": projectID, "contribution_id": tx.ContributionID, "canonical_commit_digest": tx.CanonicalCommitDigest})
		}
	}
	s.logEvent("INFO", "GENE_RECOVERY_COMPLETED", map[string]any{"project_id": projectID, "recovered_transactions": len(receipts)})
	return receipts, nil
}
