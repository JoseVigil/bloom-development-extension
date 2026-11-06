package vault

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/zalando/go-keyring"
)

// CredentialReferenceEvidence is a non-authorizing availability observation.
// It deliberately contains neither the requested key ID nor credential data.
// Authority and AITAP still decide whether a reference may be used.
type CredentialReferenceEvidence struct {
	CredentialRef string    `json:"credential_ref"`
	Usable        bool      `json:"usable"`
	Fingerprint   string    `json:"fingerprint"`
	ValidUntil    time.Time `json:"valid_until"`
	Code          string    `json:"-"`
	ObservedAt    time.Time `json:"-"`
}

const credentialEvidenceTTL = 30 * time.Second

var credentialReferenceKeys = map[string]string{
	"credential-ref://anthropic/default": "anthropic-key:default",
	"credential-ref://gemini/default":    "gemini-key:default",
}

// ObserveCredentialReference checks the OS keyring without returning the
// credential. The reference-to-key binding is fixed inside Vault; callers
// cannot pair an arbitrary public reference with a different key ID.
func ObserveCredentialReference(vaultStatusPath, credentialRef string, at, ceiling time.Time) (CredentialReferenceEvidence, error) {
	at = at.UTC()
	ceiling = ceiling.UTC()
	keyID, known := credentialReferenceKeys[credentialRef]
	if vaultStatusPath == "" || !known || at.IsZero() || ceiling.IsZero() || !at.Before(ceiling) {
		return CredentialReferenceEvidence{}, errors.New("CREDENTIAL_EVIDENCE_INVALID")
	}
	validUntil := at.Add(credentialEvidenceTTL)
	if ceiling.Before(validUntil) {
		validUntil = ceiling
	}
	evidence := CredentialReferenceEvidence{CredentialRef: credentialRef, Code: "VAULT_UNAVAILABLE", ObservedAt: at, ValidUntil: validUntil}
	status, err := getVaultStatusAt(vaultStatusPath)
	if err != nil {
		return sealCredentialEvidence(evidence), nil
	}
	if status.Locked {
		evidence.Code = "VAULT_LOCKED"
		return sealCredentialEvidence(evidence), nil
	}
	value, err := osKeyring.Get(vaultServiceName(), keyID)
	if errors.Is(err, keyring.ErrNotFound) || (err == nil && value == "") {
		evidence.Code = "CREDENTIAL_NOT_FOUND"
		return sealCredentialEvidence(evidence), nil
	}
	if err != nil {
		return sealCredentialEvidence(evidence), nil
	}
	// Do not retain credential material beyond the availability comparison.
	value = ""
	evidence.Usable = true
	evidence.Code = ""
	return sealCredentialEvidence(evidence), nil
}

func sealCredentialEvidence(evidence CredentialReferenceEvidence) CredentialReferenceEvidence {
	identity := strings.Join([]string{
		"BLOOM-NUCLEUS-CREDENTIAL-EVIDENCE-v1", evidence.CredentialRef,
		evidence.Code, evidence.ObservedAt.Format(time.RFC3339Nano), evidence.ValidUntil.Format(time.RFC3339Nano),
	}, "\n")
	digest := sha256.Sum256([]byte(identity))
	evidence.Fingerprint = "sha256:" + hex.EncodeToString(digest[:])
	return evidence
}
