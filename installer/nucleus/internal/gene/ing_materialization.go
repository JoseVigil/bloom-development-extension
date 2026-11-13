package gene

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

const INGMaterializationReceiptSchema = "bloom.ing-gene-materialization-receipt/v1"

var (
	ErrINGMaterializationBinding = errors.New("ING_GENE_MATERIALIZATION_BINDING_INVALID")
	bareDigestPattern            = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

// INGMaterializationBinding is the evidence owned by the Mandate/ING caller.
// It deliberately contains no defaults: the Gene store must not infer a
// Mandate, signed contract, Action, human decision, or upstream artifact.
type INGMaterializationBinding struct {
	ProjectID       string `json:"project_id"`
	GeneID          string `json:"gene_id"`
	ContributionID  string `json:"contribution_id"`
	MandateID       string `json:"mandate_id"`
	ContractDigest  string `json:"contract_digest"`
	INGActionID     string `json:"ing_action_id"`
	IntentID        string `json:"intent_id"`
	DecisionID      string `json:"decision_id"`
	DecisionDigest  string `json:"decision_digest"`
	HumanDecision   string `json:"human_decision"`
	INGResultDigest string `json:"ing_result_digest"`
	INGLedgerDigest string `json:"ing_ledger_digest"`
}

type INGMaterializationInput struct {
	Binding INGMaterializationBinding
	Request MaterializeRequest
}

// INGMaterializationReceipt binds the verified Gene receipt to the exact
// signed Mandate execution evidence that authorized the ING contribution.
// The digest is suitable for storing in the Mandate journal before allowing a
// dependent Action to run.
type INGMaterializationReceipt struct {
	SchemaVersion   string                    `json:"schema_version"`
	Binding         INGMaterializationBinding `json:"binding"`
	Materialization Receipt                   `json:"materialization"`
	ReceiptDigest   string                    `json:"receipt_digest"`
}

func validateINGMaterializationBinding(b INGMaterializationBinding) error {
	if !idPattern.MatchString(b.ProjectID) || !idPattern.MatchString(b.GeneID) || !idPattern.MatchString(b.ContributionID) ||
		b.MandateID == "" || b.INGActionID == "" || b.IntentID == "" || b.DecisionID == "" ||
		!bareDigestPattern.MatchString(b.ContractDigest) || !bareDigestPattern.MatchString(b.DecisionDigest) ||
		!bareDigestPattern.MatchString(b.INGResultDigest) || !bareDigestPattern.MatchString(b.INGLedgerDigest) ||
		(b.HumanDecision != "approved" && b.HumanDecision != "overridden") {
		return ErrINGMaterializationBinding
	}
	return nil
}

func validateINGMaterializationInput(input INGMaterializationInput) error {
	b, req := input.Binding, input.Request
	if err := validateINGMaterializationBinding(b); err != nil {
		return err
	}
	if req.ProjectID != b.ProjectID || req.Identity.ProjectID != b.ProjectID || req.Identity.GeneID != b.GeneID ||
		req.Contribution.ProjectID != b.ProjectID || req.Contribution.GeneID != b.GeneID ||
		req.Contribution.ContributionID != b.ContributionID || req.Contribution.MandateID != b.MandateID ||
		req.Contribution.IntentID != b.IntentID || req.Identity.Origin.MandateID != b.MandateID ||
		req.Identity.Origin.IntentID != b.IntentID || req.Identity.Origin.DecisionID != b.DecisionID ||
		req.Contribution.Ratification.DecisionID != b.DecisionID ||
		req.Contribution.Ratification.Classification != "productive" || req.Contribution.Ratification.Synthetic ||
		!req.Contribution.Ratification.Productive || len(req.RatificationEnvelope) == 0 ||
		req.WorkspaceEffect != WorkspaceEffectNone || len(req.Repositories) != 0 {
		return ErrINGMaterializationBinding
	}
	return nil
}

func ingReceiptDigest(receipt INGMaterializationReceipt) (string, error) {
	payload, err := withoutField(receipt, "receipt_digest")
	if err != nil {
		return "", err
	}
	digest, _, err := digestValue(payload)
	return digest, err
}

func sameCanonicalMaterialization(a, b Receipt) bool {
	return a.ProjectID == b.ProjectID && a.ContributionID == b.ContributionID && a.ContributionDigest == b.ContributionDigest &&
		a.RevisionDigest == b.RevisionDigest && a.CanonicalCommitDigest == b.CanonicalCommitDigest &&
		a.PublishedGeneration == b.PublishedGeneration && a.WorkspaceEffect == b.WorkspaceEffect &&
		a.RatificationDigest == b.RatificationDigest && equalStrings(a.RepositoryBindings, b.RepositoryBindings)
}

// MaterializeRatifiedING accepts only a fully prepared productive request. It
// does not translate Brain's logical accepted_contributions, mint IDs, resolve
// repositories from paths, or create Authority evidence.
func (s *Store) MaterializeRatifiedING(input INGMaterializationInput, evidencePath string) (INGMaterializationReceipt, error) {
	if s == nil || evidencePath == "" || !filepath.IsAbs(evidencePath) || filepath.Ext(evidencePath) != ".json" {
		return INGMaterializationReceipt{}, ErrINGMaterializationBinding
	}
	if err := validateINGMaterializationInput(input); err != nil {
		return INGMaterializationReceipt{}, err
	}
	receipt, err := s.Materialize(input.Request)
	if err != nil {
		return INGMaterializationReceipt{}, err
	}
	if err = s.VerifyMaterializationReceipt(receipt); err != nil {
		return INGMaterializationReceipt{}, errors.Join(ErrReceiptInvalid, err)
	}
	if _, statErr := os.Stat(evidencePath); statErr == nil {
		existing, verifyErr := s.VerifyINGMaterializationReceipt(evidencePath, input.Binding)
		if verifyErr != nil {
			return INGMaterializationReceipt{}, verifyErr
		}
		if !sameCanonicalMaterialization(existing.Materialization, receipt) {
			return INGMaterializationReceipt{}, ErrINGMaterializationBinding
		}
		return existing, nil
	} else if !errors.Is(statErr, os.ErrNotExist) {
		return INGMaterializationReceipt{}, statErr
	}
	// Replay is an operational observation, not part of the durable evidence.
	// Normalizing it makes retries byte-identical.
	receipt.Replay = false
	doc := INGMaterializationReceipt{SchemaVersion: INGMaterializationReceiptSchema, Binding: input.Binding, Materialization: receipt}
	doc.ReceiptDigest, err = ingReceiptDigest(doc)
	if err != nil {
		return INGMaterializationReceipt{}, err
	}
	if err = os.MkdirAll(filepath.Dir(evidencePath), 0700); err != nil {
		return INGMaterializationReceipt{}, err
	}
	raw, err := canonicalValue(doc)
	if err != nil {
		return INGMaterializationReceipt{}, err
	}
	if err = writeImmutable(evidencePath, raw); err != nil {
		return INGMaterializationReceipt{}, fmt.Errorf("persist ING Gene materialization receipt: %w", err)
	}
	return s.VerifyINGMaterializationReceipt(evidencePath, input.Binding)
}

// VerifyINGMaterializationReceipt independently re-reads both the linkage
// evidence and the canonical Gene store. A caller must provide the exact
// expected binding from its signed Mandate state.
func (s *Store) VerifyINGMaterializationReceipt(evidencePath string, expected INGMaterializationBinding) (INGMaterializationReceipt, error) {
	if s == nil || evidencePath == "" || !filepath.IsAbs(evidencePath) || validateINGMaterializationBinding(expected) != nil {
		return INGMaterializationReceipt{}, ErrINGMaterializationBinding
	}
	raw, err := os.ReadFile(evidencePath)
	if err != nil {
		return INGMaterializationReceipt{}, err
	}
	var doc INGMaterializationReceipt
	if err = strictDecode(raw, &doc); err != nil || doc.SchemaVersion != INGMaterializationReceiptSchema || doc.Binding != expected {
		return INGMaterializationReceipt{}, ErrINGMaterializationBinding
	}
	digest, err := ingReceiptDigest(doc)
	if err != nil || digest != doc.ReceiptDigest || !digestPattern.MatchString(doc.ReceiptDigest) {
		return INGMaterializationReceipt{}, ErrINGMaterializationBinding
	}
	r := doc.Materialization
	if r.ProjectID != expected.ProjectID || r.ContributionID != expected.ContributionID || r.WorkspaceEffect != WorkspaceEffectNone || r.Replay {
		return INGMaterializationReceipt{}, ErrINGMaterializationBinding
	}
	if err = s.VerifyMaterializationReceipt(r); err != nil {
		return INGMaterializationReceipt{}, errors.Join(ErrReceiptInvalid, err)
	}
	return doc, nil
}
