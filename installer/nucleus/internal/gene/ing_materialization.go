package gene

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

const (
	INGMaterializationReceiptSchema      = "bloom.ing-gene-materialization-receipt/v1"
	INGMaterializationBatchReceiptSchema = "bloom.ing-gene-materialization-batch-receipt/v1"
)

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

type INGMaterializationBatchBinding struct {
	ProjectID       string                      `json:"project_id"`
	MandateID       string                      `json:"mandate_id"`
	ContractDigest  string                      `json:"contract_digest"`
	INGActionID     string                      `json:"ing_action_id"`
	IntentID        string                      `json:"intent_id"`
	DecisionDigest  string                      `json:"decision_digest"`
	INGResultDigest string                      `json:"ing_result_digest"`
	INGLedgerDigest string                      `json:"ing_ledger_digest"`
	Items           []INGMaterializationBinding `json:"items"`
}

type INGMaterializationBatchReceipt struct {
	SchemaVersion    string                         `json:"schema_version"`
	Binding          INGMaterializationBatchBinding `json:"binding"`
	Materializations []Receipt                      `json:"materializations"`
	ReceiptDigest    string                         `json:"receipt_digest"`
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

func ingBatchReceiptDigest(receipt INGMaterializationBatchReceipt) (string, error) {
	payload, err := withoutField(receipt, "receipt_digest")
	if err != nil {
		return "", err
	}
	digest, _, err := digestValue(payload)
	return digest, err
}

func batchBindingFromInputs(inputs []INGMaterializationInput) (INGMaterializationBatchBinding, error) {
	if len(inputs) == 0 {
		return INGMaterializationBatchBinding{}, ErrINGMaterializationBinding
	}
	first := inputs[0].Binding
	batch := INGMaterializationBatchBinding{
		ProjectID: first.ProjectID, MandateID: first.MandateID, ContractDigest: first.ContractDigest,
		INGActionID: first.INGActionID, IntentID: first.IntentID, DecisionDigest: first.DecisionDigest,
		INGResultDigest: first.INGResultDigest, INGLedgerDigest: first.INGLedgerDigest,
		Items: make([]INGMaterializationBinding, len(inputs)),
	}
	seen := make(map[string]bool, len(inputs))
	for i, input := range inputs {
		if err := validateINGMaterializationInput(input); err != nil {
			return INGMaterializationBatchBinding{}, err
		}
		item := input.Binding
		if item.ProjectID != batch.ProjectID || item.MandateID != batch.MandateID || item.ContractDigest != batch.ContractDigest ||
			item.INGActionID != batch.INGActionID || item.IntentID != batch.IntentID || item.DecisionDigest != batch.DecisionDigest ||
			item.INGResultDigest != batch.INGResultDigest || item.INGLedgerDigest != batch.INGLedgerDigest || seen[item.ContributionID] {
			return INGMaterializationBatchBinding{}, ErrINGMaterializationBinding
		}
		seen[item.ContributionID] = true
		batch.Items[i] = item
	}
	return batch, nil
}

func equalINGMaterializationBatchBinding(a, b INGMaterializationBatchBinding) bool {
	if a.ProjectID != b.ProjectID || a.MandateID != b.MandateID || a.ContractDigest != b.ContractDigest ||
		a.INGActionID != b.INGActionID || a.IntentID != b.IntentID || a.DecisionDigest != b.DecisionDigest ||
		a.INGResultDigest != b.INGResultDigest || a.INGLedgerDigest != b.INGLedgerDigest || len(a.Items) != len(b.Items) {
		return false
	}
	for i := range a.Items {
		if a.Items[i] != b.Items[i] {
			return false
		}
	}
	return true
}

func validateINGMaterializationBatchBinding(binding INGMaterializationBatchBinding) error {
	if len(binding.Items) == 0 || !idPattern.MatchString(binding.ProjectID) || binding.MandateID == "" || binding.INGActionID == "" || binding.IntentID == "" ||
		!bareDigestPattern.MatchString(binding.ContractDigest) || !bareDigestPattern.MatchString(binding.DecisionDigest) ||
		!bareDigestPattern.MatchString(binding.INGResultDigest) || !bareDigestPattern.MatchString(binding.INGLedgerDigest) {
		return ErrINGMaterializationBinding
	}
	seen := make(map[string]bool, len(binding.Items))
	for _, item := range binding.Items {
		if validateINGMaterializationBinding(item) != nil || item.ProjectID != binding.ProjectID || item.MandateID != binding.MandateID ||
			item.ContractDigest != binding.ContractDigest || item.INGActionID != binding.INGActionID || item.IntentID != binding.IntentID ||
			item.DecisionDigest != binding.DecisionDigest || item.INGResultDigest != binding.INGResultDigest ||
			item.INGLedgerDigest != binding.INGLedgerDigest || seen[item.ContributionID] {
			return ErrINGMaterializationBinding
		}
		seen[item.ContributionID] = true
	}
	return nil
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

// MaterializeRatifiedINGBatch materializes the ordered ING inputs against the
// head observed immediately before each item. It does not reorder inputs or
// manufacture any missing governance evidence.
func (s *Store) MaterializeRatifiedINGBatch(inputs []INGMaterializationInput, evidencePath string) (INGMaterializationBatchReceipt, error) {
	if s == nil || evidencePath == "" || !filepath.IsAbs(evidencePath) || filepath.Ext(evidencePath) != ".json" {
		return INGMaterializationBatchReceipt{}, ErrINGMaterializationBinding
	}
	binding, err := batchBindingFromInputs(inputs)
	if err != nil {
		return INGMaterializationBatchReceipt{}, err
	}
	receipts := make([]Receipt, len(inputs))
	for i, input := range inputs {
		head, headDigest, loadErr := s.loadHead(binding.ProjectID)
		if loadErr != nil {
			return INGMaterializationBatchReceipt{}, loadErr
		}
		input.Request.ExpectedGeneration = head.Generation
		input.Request.ExpectedHeadDigest = headDigest
		receipt, materializeErr := s.Materialize(input.Request)
		if materializeErr != nil {
			return INGMaterializationBatchReceipt{}, materializeErr
		}
		if verifyErr := s.VerifyMaterializationReceipt(receipt); verifyErr != nil {
			return INGMaterializationBatchReceipt{}, errors.Join(ErrReceiptInvalid, verifyErr)
		}
		receipt.Replay = false
		receipts[i] = receipt
	}
	if _, statErr := os.Stat(evidencePath); statErr == nil {
		existing, verifyErr := s.VerifyINGMaterializationBatchReceipt(evidencePath, binding)
		if verifyErr != nil {
			return INGMaterializationBatchReceipt{}, verifyErr
		}
		if len(existing.Materializations) != len(receipts) {
			return INGMaterializationBatchReceipt{}, ErrINGMaterializationBinding
		}
		for i := range receipts {
			if !sameCanonicalMaterialization(existing.Materializations[i], receipts[i]) {
				return INGMaterializationBatchReceipt{}, ErrINGMaterializationBinding
			}
		}
		return existing, nil
	} else if !errors.Is(statErr, os.ErrNotExist) {
		return INGMaterializationBatchReceipt{}, statErr
	}
	doc := INGMaterializationBatchReceipt{SchemaVersion: INGMaterializationBatchReceiptSchema, Binding: binding, Materializations: receipts}
	doc.ReceiptDigest, err = ingBatchReceiptDigest(doc)
	if err != nil {
		return INGMaterializationBatchReceipt{}, err
	}
	if err = os.MkdirAll(filepath.Dir(evidencePath), 0700); err != nil {
		return INGMaterializationBatchReceipt{}, err
	}
	raw, err := canonicalValue(doc)
	if err != nil {
		return INGMaterializationBatchReceipt{}, err
	}
	if err = writeImmutable(evidencePath, raw); err != nil {
		return INGMaterializationBatchReceipt{}, fmt.Errorf("persist ING Gene materialization batch receipt: %w", err)
	}
	return s.VerifyINGMaterializationBatchReceipt(evidencePath, binding)
}

// VerifyINGMaterializationBatchReceipt re-reads the immutable batch evidence
// and independently verifies every canonical Gene receipt in item order.
func (s *Store) VerifyINGMaterializationBatchReceipt(evidencePath string, expected INGMaterializationBatchBinding) (INGMaterializationBatchReceipt, error) {
	if s == nil || evidencePath == "" || !filepath.IsAbs(evidencePath) || validateINGMaterializationBatchBinding(expected) != nil {
		return INGMaterializationBatchReceipt{}, ErrINGMaterializationBinding
	}
	raw, err := os.ReadFile(evidencePath)
	if err != nil {
		return INGMaterializationBatchReceipt{}, err
	}
	var doc INGMaterializationBatchReceipt
	if err = strictDecode(raw, &doc); err != nil || doc.SchemaVersion != INGMaterializationBatchReceiptSchema ||
		!equalINGMaterializationBatchBinding(doc.Binding, expected) || len(doc.Materializations) != len(expected.Items) {
		return INGMaterializationBatchReceipt{}, ErrINGMaterializationBinding
	}
	digest, err := ingBatchReceiptDigest(doc)
	if err != nil || digest != doc.ReceiptDigest || !digestPattern.MatchString(doc.ReceiptDigest) {
		return INGMaterializationBatchReceipt{}, ErrINGMaterializationBinding
	}
	for i, receipt := range doc.Materializations {
		item := expected.Items[i]
		if receipt.ProjectID != expected.ProjectID || receipt.ContributionID != item.ContributionID ||
			receipt.WorkspaceEffect != WorkspaceEffectNone || receipt.Replay {
			return INGMaterializationBatchReceipt{}, ErrINGMaterializationBinding
		}
		if err = s.VerifyMaterializationReceipt(receipt); err != nil {
			return INGMaterializationBatchReceipt{}, errors.Join(ErrReceiptInvalid, err)
		}
	}
	return doc, nil
}
