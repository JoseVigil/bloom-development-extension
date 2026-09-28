package mandatecontract

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gofrs/flock"
	"os"
	"path/filepath"
	"time"

	"nucleus/internal/authority"
)

const signatureDomain = "BLOOM-MANDATE-CONTRACT-v1"
const actReceiptDomain = "BLOOM-MANDATE-AUTHORIZED-ACT-v1"

type ActReceipt struct {
	Operation      string                      `json:"operation"`
	MandateID      string                      `json:"mandateId"`
	ContractDigest string                      `json:"contractDigest"`
	Contract       Contract                    `json:"contract"`
	OrganizationID string                      `json:"organizationId"`
	Attestation    json.RawMessage             `json:"attestation"`
	Manifest       json.RawMessage             `json:"manifest"`
	ActorChallenge string                      `json:"actorChallenge"`
	ActorPublicKey string                      `json:"actorPublicKey"`
	Decision       authority.AuthorityDecision `json:"decision"`
	RecordedAt     time.Time                   `json:"recordedAt"`
	SignatureKeyID string                      `json:"signatureKeyId"`
	Signature      string                      `json:"signature"`
}

func receiptBytes(value ActReceipt) ([]byte, error) {
	value.Signature = ""
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return authority.Canonicalize(raw)
}

func SignActReceipt(value ActReceipt, identity *authority.LocalIdentity) (ActReceipt, error) {
	if identity == nil || len(identity.PrivateKey) != ed25519.PrivateKeySize || value.Operation == "" || value.MandateID == "" || value.ContractDigest == "" || value.Decision.Outcome != authority.DecisionAllow {
		return ActReceipt{}, errors.New("authorized Mandate act and installation signer required")
	}
	value.SignatureKeyID = identity.InstallationID
	canonical, err := receiptBytes(value)
	if err != nil {
		return ActReceipt{}, err
	}
	value.Signature = base64.RawURLEncoding.EncodeToString(ed25519.Sign(identity.PrivateKey, append(append([]byte(actReceiptDomain), 0), canonical...)))
	return value, nil
}

func VerifyActReceipt(value ActReceipt, identity *authority.LocalIdentity, roots map[string]ed25519.PublicKey, operation, mandateID, digest, projectID string) error {
	if identity == nil || value.SignatureKeyID != identity.InstallationID || value.Operation != operation || value.MandateID != mandateID || value.ContractDigest != digest || value.OrganizationID == "" || value.RecordedAt.IsZero() {
		return errors.New("Mandate act receipt binding mismatch")
	}
	if candidateDigest, err := Digest(value.Contract); err != nil || candidateDigest != digest || value.Contract.ProjectID != projectID || value.Contract.MandateID != mandateID || value.Contract.OrganizationID != value.OrganizationID {
		return errors.New("Mandate act receipt contract mismatch")
	}
	canonical, err := receiptBytes(value)
	if err != nil {
		return err
	}
	sig, err := base64.RawURLEncoding.DecodeString(value.Signature)
	if err != nil || !ed25519.Verify(identity.PublicKey, append(append([]byte(actReceiptDomain), 0), canonical...), sig) {
		return errors.New("Mandate act receipt signature invalid")
	}
	var manifestHeader struct {
		Payload struct {
			Issuer string `json:"issuer"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(value.Manifest, &manifestHeader); err != nil {
		return err
	}
	manifest, err := authority.ParseAndVerifyTrustManifest(value.Manifest, roots, authority.Binding{OrganizationID: value.OrganizationID, Issuer: manifestHeader.Payload.Issuer, InstallationID: identity.InstallationID}, value.RecordedAt)
	if err != nil {
		return err
	}
	att, err := authority.VerifyRecordedMandateConsent(value.Attestation, manifest, value.OrganizationID, identity.InstallationID, value.ActorPublicKey, value.ActorChallenge, value.RecordedAt, operation, mandateID, digest)
	if err != nil {
		return err
	}
	permission := "mandate.sign"
	if operation == "activate" {
		permission = "mandate.install"
	}
	if value.Decision.Outcome != authority.DecisionAllow || value.Decision.Operation != permission || value.Decision.PrincipalID != att.PrincipalID || value.Decision.Scope.Type != "project" || value.Decision.Scope.ID != projectID || value.Decision.EvaluatedAt.Before(att.IssuedAt) || value.Decision.EvaluatedAt.After(value.RecordedAt) || value.RecordedAt.Sub(value.Decision.EvaluatedAt) > time.Minute {
		return errors.New("Mandate act authority decision mismatch")
	}
	return nil
}

func ActReceiptPath(dir, operation string) string {
	return filepath.Join(dir, "mandate_"+operation+".json")
}
func LoadActReceipt(dir, operation string) (ActReceipt, error) {
	var value ActReceipt
	raw, err := os.ReadFile(ActReceiptPath(dir, operation))
	if err != nil {
		return value, err
	}
	err = json.Unmarshal(raw, &value)
	return value, err
}
func SaveActReceipt(dir string, value ActReceipt) error {
	if value.Operation != "approve" && value.Operation != "activate" {
		return errors.New("invalid Mandate act")
	}
	path := ActReceiptPath(dir, value.Operation)
	lock := flock.New(path + ".lock")
	if err := lock.Lock(); err != nil {
		return err
	}
	defer lock.Unlock()
	if _, err := os.Stat(path); err == nil {
		return errors.New("Mandate act already recorded")
	} else if !os.IsNotExist(err) {
		return err
	}
	raw, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".mandate-act-*")
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
	return os.Rename(tmp.Name(), path)
}

type Envelope struct {
	Contract         Contract `json:"contract"`
	ContractDigest   string   `json:"contractDigest"`
	SignatureKeyID   string   `json:"signatureKeyId"`
	Signature        string   `json:"signature"`
	SignatureProfile string   `json:"signatureProfile"`
}

func CanonicalBytes(contract Contract) ([]byte, error) {
	if err := contract.Validate(); err != nil {
		return nil, err
	}
	raw, err := json.Marshal(contract)
	if err != nil {
		return nil, err
	}
	return authority.Canonicalize(raw)
}

func Digest(contract Contract) (string, error) {
	canonical, err := CanonicalBytes(contract)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:]), nil
}

// Sign requires an already authorized caller. It never infers human approval
// from the local installation key or from a principal ID supplied by the CLI.
func Sign(contract Contract, installation *authority.LocalIdentity) (Envelope, error) {
	if installation == nil || installation.InstallationID == "" || len(installation.PrivateKey) != ed25519.PrivateKeySize {
		return Envelope{}, errors.New("local installation signer unavailable")
	}
	canonical, err := CanonicalBytes(contract)
	if err != nil {
		return Envelope{}, err
	}
	sum := sha256.Sum256(canonical)
	message := append(append([]byte(signatureDomain), 0), canonical...)
	return Envelope{Contract: contract, ContractDigest: hex.EncodeToString(sum[:]), SignatureKeyID: installation.InstallationID,
		Signature:        base64.RawURLEncoding.EncodeToString(ed25519.Sign(installation.PrivateKey, message)),
		SignatureProfile: "I-JSON/JCS-RFC8785/SHA-256/Ed25519"}, nil
}

func Verify(envelope Envelope, installationID string, publicKey ed25519.PublicKey) error {
	if envelope.SignatureProfile != "I-JSON/JCS-RFC8785/SHA-256/Ed25519" ||
		envelope.SignatureKeyID == "" || envelope.SignatureKeyID != installationID || len(publicKey) != ed25519.PublicKeySize {
		return errors.New("Mandate signature profile or signer mismatch")
	}
	canonical, err := CanonicalBytes(envelope.Contract)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(canonical)
	if envelope.ContractDigest != hex.EncodeToString(sum[:]) {
		return errors.New("Mandate contract digest mismatch")
	}
	signature, err := base64.RawURLEncoding.DecodeString(envelope.Signature)
	if err != nil || len(signature) != ed25519.SignatureSize || !ed25519.Verify(publicKey,
		append(append([]byte(signatureDomain), 0), canonical...), signature) {
		return errors.New("Mandate contract signature invalid")
	}
	return nil
}

// LoadVerified reads the durable contract and the already-existing local
// installation identity. Verification never creates an identity or trusts a
// public key supplied by a workflow signal.
func LoadVerified(mandateDir, identityPath string) (Envelope, error) {
	identityRaw, err := os.ReadFile(identityPath)
	if err != nil {
		return Envelope{}, fmt.Errorf("read installation identity: %w", err)
	}
	var identity struct {
		InstallationID string `json:"installation_id"`
		PublicKey      string `json:"public_key"`
	}
	if err := json.Unmarshal(identityRaw, &identity); err != nil {
		return Envelope{}, fmt.Errorf("decode installation identity: %w", err)
	}
	publicKey, err := base64.StdEncoding.Strict().DecodeString(identity.PublicKey)
	if err != nil || len(publicKey) != ed25519.PublicKeySize {
		return Envelope{}, errors.New("invalid installation public key")
	}
	raw, err := os.ReadFile(filepath.Join(mandateDir, "mandate.json"))
	if err != nil {
		return Envelope{}, fmt.Errorf("read signed Mandate: %w", err)
	}
	var envelope Envelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return Envelope{}, fmt.Errorf("decode signed Mandate: %w", err)
	}
	if err := Verify(envelope, identity.InstallationID, publicKey); err != nil {
		return Envelope{}, err
	}
	if envelope.Contract.MandateID != filepath.Base(mandateDir) {
		return Envelope{}, errors.New("Mandate directory and signed identity mismatch")
	}
	return envelope, nil
}
