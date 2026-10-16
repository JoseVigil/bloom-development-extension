package gene

import (
	"errors"
	"os"
	"sort"
)

// VerifyMaterializationReceipt independently re-reads the canonical store. A
// receipt remains valid after later commits as long as its commit is reachable
// from the current Project head.
func (s *Store) VerifyMaterializationReceipt(receipt Receipt) error {
	if receipt.ProjectID == "" || !idPattern.MatchString(receipt.ContributionID) ||
		!digestPattern.MatchString(receipt.ContributionDigest) || !digestPattern.MatchString(receipt.RevisionDigest) ||
		!digestPattern.MatchString(receipt.CanonicalCommitDigest) || receipt.WorkspaceEffect != WorkspaceEffectNone ||
		!digestPattern.MatchString(receipt.PublishedHeadDigest) {
		return ErrReceiptInvalid
	}
	head, currentHeadDigest, err := s.loadHead(receipt.ProjectID)
	if err != nil {
		return errors.Join(ErrReceiptInvalid, err)
	}
	if !commitReachable(s, receipt.ProjectID, head.CanonicalCommitDigest, receipt.CanonicalCommitDigest) {
		return ErrReceiptInvalid
	}
	commit, err := s.readCommit(receipt.ProjectID, receipt.CanonicalCommitDigest)
	if err != nil || validateCommitReferences(commit) != nil || commit.PublishedGeneration != receipt.PublishedGeneration ||
		commit.WorkspaceEffect != receipt.WorkspaceEffect || commit.RatificationDigest != receipt.RatificationDigest ||
		!equalStrings(commit.RepositoryBindings, receipt.RepositoryBindings) {
		return ErrReceiptInvalid
	}
	if head.Generation == receipt.PublishedGeneration && currentHeadDigest != receipt.PublishedHeadDigest {
		return ErrReceiptInvalid
	}
	if len(commit.RevisionTransitions) != 1 || commit.RevisionTransitions[0].To != receipt.RevisionDigest {
		return ErrReceiptInvalid
	}
	found := false
	for _, ref := range commit.Contributions {
		if ref.ID == receipt.ContributionID && ref.Digest == receipt.ContributionDigest {
			found = true
		}
	}
	if !found {
		return ErrReceiptInvalid
	}
	path, err := s.immutablePath(receipt.ProjectID, "contributions", receipt.ContributionID, false)
	if err != nil {
		return ErrReceiptInvalid
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return ErrReceiptInvalid
	}
	var contribution Contribution
	if strictDecode(raw, &contribution) != nil {
		return ErrReceiptInvalid
	}
	payload, err := withoutField(contribution, "contribution_digest")
	if err != nil {
		return ErrReceiptInvalid
	}
	actual, _, err := digestValue(payload)
	if err != nil || actual != receipt.ContributionDigest || contribution.ContributionDigest != receipt.ContributionDigest {
		return ErrReceiptInvalid
	}
	if _, err = s.readRevision(receipt.ProjectID, receipt.RevisionDigest); err != nil {
		return ErrReceiptInvalid
	}
	s.logEvent("SUCCESS", "GENE_MATERIALIZATION_RECEIPT_VERIFIED", map[string]any{"project_id": receipt.ProjectID, "contribution_id": receipt.ContributionID, "canonical_commit_digest": receipt.CanonicalCommitDigest, "published_generation": receipt.PublishedGeneration})
	return nil
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	aa := append([]string(nil), a...)
	bb := append([]string(nil), b...)
	sort.Strings(aa)
	sort.Strings(bb)
	for i := range aa {
		if aa[i] != bb[i] {
			return false
		}
	}
	return true
}
