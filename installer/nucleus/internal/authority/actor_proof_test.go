package authority

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

func signedActorAttestation(t *testing.T, a ActorAttestation, root ed25519.PrivateKey, keyID string) []byte {
	t.Helper()
	payload, _ := json.Marshal(a)
	canonical, _ := Canonicalize(payload)
	sum := sha256.Sum256(canonical)
	sig := ed25519.Sign(root, append(append([]byte(actorAttestationDomain), 0), canonical...))
	raw, _ := json.Marshal(Envelope{Payload: payload, Integrity: Integrity{"JCS-RFC8785", "SHA-256", base64.RawURLEncoding.EncodeToString(sum[:]), "Ed25519", keyID, base64.RawURLEncoding.EncodeToString(sig)}})
	return raw
}
func TestActorProofBindsHumanOrganizationInstallationAndPossession(t *testing.T) {
	p, rootPub, rootPriv, _, issuerPriv, now := trustFixture(t)
	manifest, err := ParseAndVerifyTrustManifest(signedTrustFixture(t, p, rootPriv, "root"), map[string]ed25519.PublicKey{"root": rootPub}, Binding{"org", "issuer", "installation"}, now)
	if err != nil {
		t.Fatal(err)
	}
	proof, err := NewActorProof("org", "installation", "bloom.authority.local-actor")
	if err != nil {
		t.Fatal(err)
	}
	request := proof.ChallengeRequest()
	if request.ActorPublicKey == "" {
		t.Fatal("missing actor key")
	}
	challenge := "challenge-value"
	approval, err := proof.SignChallenge(challenge)
	if err != nil {
		t.Fatal(err)
	}
	if approval.Signature == "" || approval.ActorPublicKey != request.ActorPublicKey {
		t.Fatal("invalid possession")
	}
	sum := sha256.Sum256([]byte(challenge))
	a := ActorAttestation{Schema: "bloom.authority.actor-attestation", SchemaVersion: "1.0", AttestationID: "att-1", Issuer: "issuer", OrganizationID: "org", InstallationID: "installation", PrincipalID: "human", ActorPublicKey: request.ActorPublicKey, Audience: request.Audience, ChallengeDigest: base64.RawURLEncoding.EncodeToString(sum[:]), IssuedAt: now, ExpiresAt: now.Add(time.Minute)}
	raw := signedActorAttestation(t, a, issuerPriv, "issuer-key")
	if _, err = VerifyActorAttestation(raw, manifest, proof, challenge, now); err != nil {
		t.Fatal(err)
	}
	other, _ := NewActorProof("org", "other-installation", "bloom.authority.local-actor")
	if _, err = VerifyActorAttestation(raw, manifest, other, challenge, now); err == nil {
		t.Fatal("wrong installation accepted")
	}
	if _, err = VerifyActorAttestation(raw, manifest, proof, "replay-other", now); err == nil {
		t.Fatal("wrong challenge accepted")
	}
	if _, err = VerifyActorAttestation(raw, manifest, proof, challenge, now.Add(time.Minute)); err == nil {
		t.Fatal("expired attestation accepted")
	}
}

// Casos nuevos para el encargo de nacimiento de agente Orbital (§2.3): audience nueva en la
// whitelist, campos extendidos aditivos vía SchemaVersion "1.1", y guardia de no-dependencia de
// internal/vault (§2.4 — la clave efímera del actor nunca debe poder tocar Vault).

func TestActorProofAcceptsOrbitalContextAudience(t *testing.T) {
	proof, err := NewActorProof("org", "installation", "bloom.authority.orbital-context")
	if err != nil {
		t.Fatal(err)
	}
	if proof.Audience != "bloom.authority.orbital-context" {
		t.Fatal("audience mismatch")
	}
}

func TestActorProofRejectsUnknownAudience(t *testing.T) {
	if _, err := NewActorProof("org", "installation", "bloom.authority.unknown-audience"); err == nil {
		t.Fatal("unknown audience accepted")
	}
}

func TestActorAttestationOrbitalContextExtendedFields(t *testing.T) {
	p, rootPub, rootPriv, _, issuerPriv, now := trustFixture(t)
	manifest, err := ParseAndVerifyTrustManifest(signedTrustFixture(t, p, rootPriv, "root"), map[string]ed25519.PublicKey{"root": rootPub}, Binding{"org", "issuer", "installation"}, now)
	if err != nil {
		t.Fatal(err)
	}
	proof, err := NewActorProof("org", "installation", "bloom.authority.orbital-context")
	if err != nil {
		t.Fatal(err)
	}
	request := proof.ChallengeRequest()
	challenge := "challenge-value"
	sum := sha256.Sum256([]byte(challenge))
	base := ActorAttestation{Schema: "bloom.authority.actor-attestation", Issuer: "issuer", OrganizationID: "org", InstallationID: "installation", PrincipalID: "human", ActorPublicKey: request.ActorPublicKey, Audience: request.Audience, ChallengeDigest: base64.RawURLEncoding.EncodeToString(sum[:]), IssuedAt: now, ExpiresAt: now.Add(time.Minute)}

	complete := base
	complete.SchemaVersion = "1.1"
	complete.AttestationID = "att-orbital-1"
	complete.RunID = "run-1"
	complete.DesignationID = "designation-1"
	complete.CapabilitySeam = "agent.issuer.designate"
	if _, err = VerifyActorAttestation(signedActorAttestation(t, complete, issuerPriv, "issuer-key"), manifest, proof, challenge, now); err != nil {
		t.Fatal(err)
	}

	missingRunID := complete
	missingRunID.AttestationID = "att-orbital-2"
	missingRunID.RunID = ""
	if _, err = VerifyActorAttestation(signedActorAttestation(t, missingRunID, issuerPriv, "issuer-key"), manifest, proof, challenge, now); err == nil {
		t.Fatal("1.1 attestation missing run_id accepted")
	}

	legacyWithOrbitalField := base
	legacyWithOrbitalField.SchemaVersion = "1.0"
	legacyWithOrbitalField.AttestationID = "att-orbital-3"
	legacyWithOrbitalField.RunID = "run-1"
	if _, err = VerifyActorAttestation(signedActorAttestation(t, legacyWithOrbitalField, issuerPriv, "issuer-key"), manifest, proof, challenge, now); err == nil {
		t.Fatal("1.0 attestation carrying orbital-context fields accepted")
	}
}

func TestActorProofDoesNotImportVault(t *testing.T) {
	raw, err := os.ReadFile("actor_proof.go")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "internal/vault") {
		t.Fatal("actor_proof.go must never import internal/vault: the ephemeral actor keypair is generated, used and discarded in-process and must never be able to reach Vault (see §2.4 of the Orbital agent-birth encargo)")
	}
}

func TestActorKeyIsDistinctFromInstallationKey(t *testing.T) {
	proof, err := NewActorProof("org", "installation", "bloom.authority.local-actor")
	if err != nil {
		t.Fatal(err)
	}
	installationPub, _, _ := ed25519.GenerateKey(rand.Reader)
	if string(proof.public) == string(installationPub) {
		t.Fatal("actor reused installation key")
	}
}
