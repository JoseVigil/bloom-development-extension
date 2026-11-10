package mandatecontract

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"nucleus/internal/authority"
)

type ConfirmedDestination struct {
	BackendID string `json:"backend_id"`
	Provider  string `json:"provider"`
	Model     string `json:"model"`
}

// LoadConfirmedDestination verifies the Nucleus signature and the exact Mandate,
// prepared contract and action before exposing a W4 selection to execution.
func LoadConfirmedDestination(mandateDir, identityPath, mandateID, digest, actionID string) (ConfirmedDestination, error) {
	var empty ConfirmedDestination
	identity, err := authority.LoadExistingLocalIdentity(identityPath)
	if err != nil {
		return empty, err
	}
	raw, err := os.ReadFile(filepath.Join(mandateDir, "intent_supply_receipt.json"))
	if err != nil {
		return empty, err
	}
	var receipt struct {
		Schema                 string          `json:"schema"`
		MandateID              string          `json:"mandateId"`
		PreparedContractDigest string          `json:"preparedContractDigest"`
		AssignmentPackage      json.RawMessage `json:"assignmentPackage"`
		AuthorityVersion       string          `json:"authorityVersion"`
		AuthorityStateDigest   string          `json:"authorityStateDigest"`
		ActorPrincipalID       string          `json:"actorPrincipalId"`
		ConfirmedAt            time.Time       `json:"confirmedAt"`
		SignatureKeyID         string          `json:"signatureKeyId"`
		Signature              string          `json:"signature"`
	}
	if err := json.Unmarshal(raw, &receipt); err != nil {
		return empty, err
	}
	if receipt.Schema != "bloom.mandate-resources-confirm/v1" || receipt.MandateID != mandateID ||
		receipt.PreparedContractDigest != "sha256:"+digest || receipt.SignatureKeyID != identity.InstallationID ||
		receipt.ActorPrincipalID == "" || receipt.AuthorityVersion == "" || receipt.AuthorityStateDigest == "" || receipt.ConfirmedAt.IsZero() {
		return empty, errors.New("W4 receipt binding invalid")
	}
	signature := receipt.Signature
	receipt.Signature = ""
	unsigned, err := json.Marshal(receipt)
	if err != nil {
		return empty, err
	}
	canonical, err := authority.Canonicalize(unsigned)
	if err != nil {
		return empty, err
	}
	sig, err := base64.RawURLEncoding.DecodeString(signature)
	if err != nil || !ed25519.Verify(identity.PublicKey, append([]byte("BLOOM-MANDATE-RESOURCES-CONFIRM-v1\x00"), canonical...), sig) {
		return empty, errors.New("W4 receipt signature invalid")
	}
	var pkg struct {
		MandateID              string `json:"mandate_id"`
		PreparedContractDigest string `json:"prepared_contract_digest"`
		Assignments            []struct {
			ActionID    string               `json:"action_id"`
			Destination ConfirmedDestination `json:"destination"`
		} `json:"assignments"`
		Validation struct {
			Fingerprint string `json:"fingerprint"`
			ValidUntil  string `json:"valid_until"`
		} `json:"validation"`
	}
	if err := json.Unmarshal(receipt.AssignmentPackage, &pkg); err != nil || pkg.MandateID != mandateID ||
		pkg.PreparedContractDigest != "sha256:"+digest || pkg.Validation.Fingerprint == "" {
		return empty, errors.New("W4 package binding invalid")
	}
	if _, err := time.Parse(time.RFC3339Nano, pkg.Validation.ValidUntil); err != nil {
		return empty, errors.New("W4 validation time invalid")
	}
	var selected ConfirmedDestination
	count := 0
	for _, item := range pkg.Assignments {
		if item.ActionID == actionID {
			selected = item.Destination
			count++
		}
	}
	if count != 1 || selected.BackendID == "" || selected.Provider == "" || selected.Model == "" {
		return empty, errors.New("W4 action destination missing or ambiguous")
	}
	return selected, nil
}
