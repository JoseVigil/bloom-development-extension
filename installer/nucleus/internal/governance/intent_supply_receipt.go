package governance

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/gofrs/flock"
	"nucleus/internal/authority"
)

const intentSupplyReceiptDomain = "BLOOM-MANDATE-RESOURCES-CONFIRM-v1"

type intentSupplyReceipt struct {
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

func receiptCanonical(value intentSupplyReceipt) ([]byte, error) {
	value.Signature = ""
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return authority.Canonicalize(raw)
}

func verifyIntentSupplyReceipt(value intentSupplyReceipt, identity *authority.LocalIdentity, mandateID, digest string) error {
	if identity == nil || value.Schema != "bloom.mandate-resources-confirm/v1" || value.MandateID != mandateID ||
		value.PreparedContractDigest != "sha256:"+digest || value.SignatureKeyID != identity.InstallationID ||
		value.ActorPrincipalID == "" || value.AuthorityVersion == "" || value.AuthorityStateDigest == "" || value.ConfirmedAt.IsZero() {
		return errors.New("W4 receipt binding invalid")
	}
	var pkg struct {
		MandateID              string            `json:"mandate_id"`
		PreparedContractDigest string            `json:"prepared_contract_digest"`
		Assignments            []json.RawMessage `json:"assignments"`
		Validation             struct {
			Fingerprint string `json:"fingerprint"`
			ValidUntil  string `json:"valid_until"`
		} `json:"validation"`
	}
	if json.Unmarshal(value.AssignmentPackage, &pkg) != nil || pkg.MandateID != mandateID || pkg.PreparedContractDigest != value.PreparedContractDigest || len(pkg.Assignments) == 0 || pkg.Validation.Fingerprint == "" || pkg.Validation.ValidUntil == "" {
		return errors.New("W4 receipt package invalid")
	}
	canonical, err := receiptCanonical(value)
	if err != nil {
		return err
	}
	sig, err := base64.RawURLEncoding.DecodeString(value.Signature)
	if err != nil || !ed25519.Verify(identity.PublicKey, append(append([]byte(intentSupplyReceiptDomain), 0), canonical...), sig) {
		return errors.New("W4 receipt signature invalid")
	}
	return nil
}

func saveIntentSupplyReceipt(mandateDir, identityPath, mandateID, digest string, evidence intentSupplyAuthorityEvidence, actor verifiedIntentSupplyActor, requested, result json.RawMessage, at time.Time) error {
	var response struct {
		Status                 string          `json:"status"`
		MandateID              string          `json:"mandate_id"`
		PreparedContractDigest string          `json:"prepared_contract_digest"`
		AssignmentPackage      json.RawMessage `json:"assignment_package"`
		Fingerprint            string          `json:"fingerprint"`
		ValidUntil             string          `json:"valid_until"`
	}
	if json.Unmarshal(result, &response) != nil || response.Status != "valid" || response.MandateID != mandateID || response.PreparedContractDigest != "sha256:"+digest {
		return errors.New("W4 validation result invalid")
	}
	validUntil, err := time.Parse(time.RFC3339Nano, response.ValidUntil)
	if err != nil || !at.Before(validUntil) || response.Fingerprint == "" {
		return errors.New("W4 evidence expired or invalid")
	}
	var packageRows struct {
		Assignments json.RawMessage `json:"assignments"`
		Validation  struct {
			Fingerprint string `json:"fingerprint"`
			ValidUntil  string `json:"valid_until"`
		} `json:"validation"`
	}
	if json.Unmarshal(response.AssignmentPackage, &packageRows) != nil || packageRows.Validation.Fingerprint != response.Fingerprint || packageRows.Validation.ValidUntil != response.ValidUntil {
		return errors.New("W4 package malformed")
	}
	selected, selectedErr := authority.Canonicalize(requested)
	confirmed, confirmedErr := authority.Canonicalize(packageRows.Assignments)
	if selectedErr != nil || confirmedErr != nil || string(selected) != string(confirmed) {
		return errors.New("W4 selections differ from actor request")
	}
	identity, err := authority.LoadExistingLocalIdentity(identityPath)
	if err != nil {
		return err
	}
	value := intentSupplyReceipt{Schema: "bloom.mandate-resources-confirm/v1", MandateID: mandateID,
		PreparedContractDigest: "sha256:" + digest, AssignmentPackage: response.AssignmentPackage,
		AuthorityVersion: evidence.AuthorityVersion, AuthorityStateDigest: evidence.AuthorityStateDigest,
		ActorPrincipalID: actor.principalID, ConfirmedAt: at, SignatureKeyID: identity.InstallationID}
	path := filepath.Join(mandateDir, "intent_supply_receipt.json")
	lock := flock.New(path + ".lock")
	if err := lock.Lock(); err != nil {
		return err
	}
	defer lock.Unlock()
	if raw, err := os.ReadFile(path); err == nil {
		var existing intentSupplyReceipt
		if json.Unmarshal(raw, &existing) != nil || verifyIntentSupplyReceipt(existing, identity, mandateID, digest) != nil {
			return errors.New("existing W4 receipt invalid")
		}
		var oldRows, newRows struct {
			Assignments json.RawMessage `json:"assignments"`
		}
		if json.Unmarshal(existing.AssignmentPackage, &oldRows) != nil || json.Unmarshal(value.AssignmentPackage, &newRows) != nil {
			return errors.New("W4 receipt assignments invalid")
		}
		old, oldErr := authority.Canonicalize(oldRows.Assignments)
		newPackage, newErr := authority.Canonicalize(newRows.Assignments)
		if oldErr != nil || newErr != nil || string(old) != string(newPackage) {
			return errors.New("W4 selection conflicts with existing receipt")
		}
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	canonical, err := receiptCanonical(value)
	if err != nil {
		return err
	}
	value.Signature = base64.RawURLEncoding.EncodeToString(ed25519.Sign(identity.PrivateKey, append(append([]byte(intentSupplyReceiptDomain), 0), canonical...)))
	if err := verifyIntentSupplyReceipt(value, identity, mandateID, digest); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(mandateDir, ".intent-supply-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := tmp.Write(append(raw, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return err
	}
	verifiedRaw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var verified intentSupplyReceipt
	if json.Unmarshal(verifiedRaw, &verified) != nil {
		return errors.New("W4 receipt unreadable")
	}
	return verifyIntentSupplyReceipt(verified, identity, mandateID, digest)
}
