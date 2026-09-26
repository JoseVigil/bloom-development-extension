package authority

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"time"
)

var ErrVaultServiceGrantDenied = errors.New("VAULT_ACCESS_DENIED")

type VaultServiceGrantEvidence struct {
	GrantID        string    `json:"grant_id"`
	InstallationID string    `json:"installation_id"`
	KeyID          string    `json:"key_id"`
	Purpose        string    `json:"purpose"`
	ValidUntil     time.Time `json:"valid_until"`
}

// ActiveVaultServiceGrantEvidence supports a read-only preflight. It never
// reads Vault, and it uses the same accepted state/checkpoint pair as resolve.
func ActiveVaultServiceGrantEvidence(store *Store, checkpoint *CheckpointStore, organizationID string, at time.Time) ([]VaultServiceGrantEvidence, error) {
	if store == nil || checkpoint == nil || organizationID == "" {
		return nil, ErrVaultServiceGrantDenied
	}
	state, err := (DecisionEvaluator{Store: store, Checkpoint: checkpoint}).load()
	if err != nil || state == nil || state.Emission == nil || state.Binding.OrganizationID != organizationID || at.Before(state.Emission.NotBefore) || !at.Before(state.Emission.ExpiresAt) {
		return nil, ErrVaultServiceGrantDenied
	}
	result := []VaultServiceGrantEvidence{}
	for _, g := range state.Projection.VaultServiceGrants {
		if g.OrganizationID != organizationID || g.InstallationID != state.Binding.InstallationID || at.Before(g.ValidFrom) || !at.Before(g.ValidUntil) {
			continue
		}
		revoked := false
		for _, r := range state.Projection.Revocations {
			if r.TargetType == "vault_service_grant" && r.TargetID == g.GrantID && !at.Before(r.EffectiveAt) {
				revoked = true
				break
			}
		}
		if !revoked {
			result = append(result, VaultServiceGrantEvidence{g.GrantID, g.InstallationID, g.KeyID, g.Purpose, g.ValidUntil})
		}
	}
	return result, nil
}

// ResolveVaultServiceGrant reads only a verifier-accepted snapshot paired with
// its checkpoint. No caller-provided role or local marker is consulted.
func ResolveVaultServiceGrant(store *Store, checkpoint *CheckpointStore, organizationID, installationID, grantID, keyID, purpose string, at time.Time) (ed25519.PublicKey, error) {
	deny := func() (ed25519.PublicKey, error) { return nil, ErrVaultServiceGrantDenied }
	if store == nil || checkpoint == nil || organizationID == "" || installationID == "" || grantID == "" || keyID == "" || purpose == "" {
		return deny()
	}
	state, err := (DecisionEvaluator{Store: store, Checkpoint: checkpoint}).load()
	if err != nil || state == nil || state.Emission == nil || state.Binding.OrganizationID != organizationID || state.Binding.InstallationID != installationID || state.Emission.OrganizationID != organizationID || at.Before(state.Emission.NotBefore) || !at.Before(state.Emission.ExpiresAt) {
		return deny()
	}
	for _, g := range state.Projection.VaultServiceGrants {
		if g.GrantID != grantID {
			continue
		}
		if g.OrganizationID != organizationID || g.InstallationID != installationID || g.Consumer != "aitap" || g.Permission != "vault.key.read" || g.KeyID != keyID || g.Purpose != purpose || at.Before(g.ValidFrom) || !at.Before(g.ValidUntil) {
			return deny()
		}
		for _, r := range state.Projection.Revocations {
			if r.TargetType == "vault_service_grant" && r.TargetID == grantID && !at.Before(r.EffectiveAt) {
				return deny()
			}
		}
		key, err := base64.RawURLEncoding.DecodeString(g.ServicePublicKey)
		if err != nil || len(key) != ed25519.PublicKeySize {
			return deny()
		}
		return ed25519.PublicKey(key), nil
	}
	return deny()
}
