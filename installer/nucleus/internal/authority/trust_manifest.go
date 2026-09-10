package authority

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"
)

const trustManifestDomain = "BLOOM-AUTHORITY-TRUST-MANIFEST-v1"

type TrustKey struct {
	KeyID      string     `json:"key_id"`
	PublicKey  string     `json:"public_key"`
	Status     string     `json:"status"`
	ValidFrom  time.Time  `json:"valid_from"`
	ValidUntil *time.Time `json:"valid_until"`
}
type TrustManifestPayload struct {
	Schema          string     `json:"schema"`
	SchemaVersion   string     `json:"schema_version"`
	ManifestID      string     `json:"manifest_id"`
	Issuer          string     `json:"issuer"`
	OrganizationID  string     `json:"organization_id"`
	ManifestVersion string     `json:"manifest_version"`
	IssuedAt        time.Time  `json:"issued_at"`
	NotBefore       time.Time  `json:"not_before"`
	ExpiresAt       time.Time  `json:"expires_at"`
	RootKeyID       string     `json:"root_key_id"`
	Keys            []TrustKey `json:"keys"`
}
type VerifiedTrustManifest struct {
	Payload   TrustManifestPayload
	Digest    string
	rootKeyID string
	root      ed25519.PublicKey
}

func ParseAndVerifyTrustManifest(raw []byte, roots map[string]ed25519.PublicKey, binding Binding, now time.Time) (*VerifiedTrustManifest, error) {
	if len(raw) == 0 || len(raw) > 4<<20 {
		return nil, errors.New("invalid trust manifest size")
	}
	if err := rejectDuplicateKeys(raw); err != nil {
		return nil, err
	}
	var env Envelope
	if err := decodeWire(raw, &env); err != nil {
		return nil, err
	}
	if env.Integrity.Canonicalization != "JCS-RFC8785" || env.Integrity.DigestAlgorithm != "SHA-256" || env.Integrity.SignatureAlgorithm != "Ed25519" {
		return nil, errors.New("unsupported trust integrity")
	}
	root, ok := roots[env.Integrity.KeyID]
	if !ok || len(root) != ed25519.PublicKeySize {
		return nil, errors.New("untrusted root key")
	}
	canonical, err := Canonicalize(env.Payload)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(canonical)
	if base64.RawURLEncoding.EncodeToString(sum[:]) != env.Integrity.Digest {
		return nil, errors.New("trust manifest digest mismatch")
	}
	sig, err := base64.RawURLEncoding.DecodeString(env.Integrity.Signature)
	if err != nil || len(sig) != ed25519.SignatureSize || !ed25519.Verify(root, append(append([]byte(trustManifestDomain), 0), canonical...), sig) {
		return nil, errors.New("invalid trust manifest signature")
	}
	var p TrustManifestPayload
	if err = decodeWire(env.Payload, &p); err != nil {
		return nil, err
	}
	if p.Schema != "bloom.authority.trust-manifest" || p.SchemaVersion != "1.0" || p.ManifestID == "" || p.RootKeyID != env.Integrity.KeyID {
		return nil, errors.New("invalid trust manifest")
	}
	if p.OrganizationID != binding.OrganizationID || p.Issuer != binding.Issuer || p.RootKeyID == "" {
		return nil, errors.New("trust manifest binding mismatch")
	}
	if _, err = strictVersion(p.ManifestVersion); err != nil {
		return nil, err
	}
	if p.IssuedAt.After(p.NotBefore) || !p.NotBefore.Before(p.ExpiresAt) || now.Before(p.NotBefore) || !now.Before(p.ExpiresAt) {
		return nil, errors.New("trust manifest outside validity")
	}
	seen := map[string]bool{}
	if len(p.Keys) == 0 {
		return nil, errors.New("trust manifest has no keys")
	}
	for i := range p.Keys {
		k := &p.Keys[i]
		if k.KeyID == "" || seen[k.KeyID] || (k.Status != "active" && k.Status != "retired") || (k.ValidUntil != nil && !k.ValidFrom.Before(*k.ValidUntil)) {
			return nil, errors.New("invalid trust key")
		}
		decoded, e := base64.RawURLEncoding.DecodeString(k.PublicKey)
		if e != nil || len(decoded) != ed25519.PublicKeySize || base64.RawURLEncoding.EncodeToString(decoded) != k.PublicKey {
			return nil, errors.New("invalid trust public key")
		}
		seen[k.KeyID] = true
	}
	if !sort.SliceIsSorted(p.Keys, func(i, j int) bool { return wireLess(p.Keys[i].KeyID, p.Keys[j].KeyID) }) {
		return nil, errors.New("trust keys not canonical order")
	}
	return &VerifiedTrustManifest{Payload: p, Digest: env.Integrity.Digest, rootKeyID: p.RootKeyID, root: append(ed25519.PublicKey(nil), root...)}, nil
}

func (m *VerifiedTrustManifest) SnapshotTrust(at time.Time) (TrustBundle, error) {
	if m == nil {
		return nil, errors.New("trust manifest required")
	}
	keys := map[string]ed25519.PublicKey{}
	for _, k := range m.Payload.Keys {
		if k.Status != "active" || at.Before(k.ValidFrom) || (k.ValidUntil != nil && !at.Before(*k.ValidUntil)) {
			continue
		}
		raw, _ := base64.RawURLEncoding.DecodeString(k.PublicKey)
		keys[k.KeyID] = ed25519.PublicKey(raw)
	}
	if len(keys) == 0 {
		return nil, fmt.Errorf("no active authority key at %s", at.UTC().Format(time.RFC3339Nano))
	}
	return TrustBundle{m.Payload.Issuer: keys}, nil
}

func (m *VerifiedTrustManifest) Root() (string, ed25519.PublicKey) {
	return m.rootKeyID, append(ed25519.PublicKey(nil), m.root...)
}

func MarshalTrustManifestPayload(p TrustManifestPayload) ([]byte, error) { return json.Marshal(p) }
