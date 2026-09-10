package authority

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"os"
	"testing"
	"time"
)

func signedTrustFixture(t *testing.T, p TrustManifestPayload, root ed25519.PrivateKey, keyID string) []byte {
	t.Helper()
	payload, _ := json.Marshal(p)
	canonical, err := Canonicalize(payload)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(canonical)
	sig := ed25519.Sign(root, append(append([]byte(trustManifestDomain), 0), canonical...))
	raw, _ := json.Marshal(Envelope{Payload: payload, Integrity: Integrity{"JCS-RFC8785", "SHA-256", base64.RawURLEncoding.EncodeToString(sum[:]), "Ed25519", keyID, base64.RawURLEncoding.EncodeToString(sig)}})
	return raw
}
func trustFixture(t *testing.T) (TrustManifestPayload, ed25519.PublicKey, ed25519.PrivateKey, ed25519.PublicKey, ed25519.PrivateKey, time.Time) {
	t.Helper()
	rootPub, rootPriv, _ := ed25519.GenerateKey(rand.Reader)
	issuerPub, issuerPriv, _ := ed25519.GenerateKey(rand.Reader)
	now := time.Date(2026, 9, 9, 12, 1, 0, 0, time.UTC)
	p := TrustManifestPayload{Schema: "bloom.authority.trust-manifest", SchemaVersion: "1.0", ManifestID: "manifest-1", Issuer: "issuer", OrganizationID: "org", ManifestVersion: "1", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour), RootKeyID: "root", Keys: []TrustKey{{KeyID: "issuer-key", PublicKey: base64.RawURLEncoding.EncodeToString(issuerPub), Status: "active", ValidFrom: now.Add(-time.Minute)}}}
	return p, rootPub, rootPriv, issuerPub, issuerPriv, now
}
func TestTrustManifestRejectsUnrootedRollbackAndRetiredIssuance(t *testing.T) {
	p, rootPub, rootPriv, _, _, now := trustFixture(t)
	raw := signedTrustFixture(t, p, rootPriv, "root")
	m, err := ParseAndVerifyTrustManifest(raw, map[string]ed25519.PublicKey{"root": rootPub}, Binding{"org", "issuer", "installation"}, now)
	if err != nil {
		t.Fatal(err)
	}
	other, _, _ := ed25519.GenerateKey(rand.Reader)
	if _, err = ParseAndVerifyTrustManifest(raw, map[string]ed25519.PublicKey{"root": other}, Binding{"org", "issuer", "installation"}, now); err == nil {
		t.Fatal("unrooted manifest accepted")
	}
	p.ManifestVersion = "2"
	p.Keys[0].Status = "retired"
	until := now
	p.Keys[0].ValidUntil = &until
	m2, err := ParseAndVerifyTrustManifest(signedTrustFixture(t, p, rootPriv, "root"), map[string]ed25519.PublicKey{"root": rootPub}, Binding{"org", "issuer", "installation"}, now.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = m2.SnapshotTrust(now.Add(time.Second)); err == nil {
		t.Fatal("retired key authorized a new emission")
	}
	if _, err = m.SnapshotTrust(now); err != nil {
		t.Fatal(err)
	}
}
func TestTrustManifestBackendInterop(t *testing.T) {
	path := os.Getenv("AUTHORITY_TRUST_ARTIFACT")
	if path == "" {
		t.Skip("AUTHORITY_TRUST_ARTIFACT not set")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var a struct {
		Manifest         json.RawMessage `json:"manifest"`
		RootKeyID        string          `json:"root_key_id"`
		RootPublic       string          `json:"root_public_key"`
		Now              time.Time       `json:"now"`
		OrganizationID   string          `json:"organization_id"`
		Issuer           string          `json:"issuer"`
		ActorAttestation json.RawMessage `json:"actor_attestation"`
		ActorChallenge   string          `json:"actor_challenge"`
		ActorPublicKey   string          `json:"actor_public_key"`
		InstallationID   string          `json:"installation_id"`
	}
	if err = json.Unmarshal(raw, &a); err != nil {
		t.Fatal(err)
	}
	root, err := base64.RawURLEncoding.DecodeString(a.RootPublic)
	if err != nil {
		t.Fatal(err)
	}
	m, err := ParseAndVerifyTrustManifest(a.Manifest, map[string]ed25519.PublicKey{a.RootKeyID: root}, Binding{a.OrganizationID, a.Issuer, "installation-a"}, a.Now)
	if err != nil {
		t.Fatal(err)
	}
	if m.Payload.ManifestVersion != "1" || len(m.Payload.Keys) != 1 {
		t.Fatalf("unexpected manifest: %+v", m.Payload)
	}
	actorPublic, err := base64.RawURLEncoding.DecodeString(a.ActorPublicKey)
	if err != nil {
		t.Fatal(err)
	}
	proof := &ActorProof{OrganizationID: a.OrganizationID, InstallationID: a.InstallationID, Audience: "bloom.authority.local-actor", public: ed25519.PublicKey(actorPublic)}
	if _, err = VerifyActorAttestation(a.ActorAttestation, m, proof, a.ActorChallenge, a.Now); err != nil {
		t.Fatal(err)
	}
	mutated := append([]byte(nil), a.Manifest...)
	for i := range mutated {
		if mutated[i] == 'i' {
			mutated[i] = 'j'
			break
		}
	}
	if _, err = ParseAndVerifyTrustManifest(mutated, map[string]ed25519.PublicKey{a.RootKeyID: root}, Binding{a.OrganizationID, a.Issuer, "installation-a"}, a.Now); err == nil {
		t.Fatal("altered manifest accepted")
	}
}
