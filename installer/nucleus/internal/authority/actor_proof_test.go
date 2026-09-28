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

func TestMandateActorProofRequiresSeparateExactConsent(t *testing.T) {
	p, rootPub, rootPriv, _, issuerPriv, now := trustFixture(t)
	manifest, err := ParseAndVerifyTrustManifest(signedTrustFixture(t, p, rootPriv, "root"), map[string]ed25519.PublicKey{"root": rootPub}, Binding{"org", "issuer", "installation"}, now)
	if err != nil {
		t.Fatal(err)
	}
	proof, err := NewActorProof("org", "installation", "bloom.authority.mandate-consent")
	if err != nil {
		t.Fatal(err)
	}
	digest := strings.Repeat("a", 64)
	request, err := proof.MandateChallengeRequest("approve", "m-1", digest)
	if err != nil || request.Operation != "approve" {
		t.Fatalf("request=%#v err=%v", request, err)
	}
	challenge := "mandate-nonce"
	sum := sha256.Sum256([]byte(challenge))
	a := ActorAttestation{Schema: "bloom.authority.actor-attestation", SchemaVersion: "1.2", AttestationID: "att-m", Issuer: "issuer", OrganizationID: "org", InstallationID: "installation", PrincipalID: "human", ActorPublicKey: request.ActorPublicKey, Audience: request.Audience, ChallengeDigest: base64.RawURLEncoding.EncodeToString(sum[:]), IssuedAt: now, ExpiresAt: now.Add(time.Minute), Operation: "approve", MandateID: "m-1", ContractDigest: digest}
	raw := signedActorAttestation(t, a, issuerPriv, "issuer-key")
	if _, err := VerifyMandateActorAttestation(raw, manifest, proof, challenge, now, "approve", "m-1", digest); err != nil {
		t.Fatal(err)
	}
	for _, wrong := range []struct{ op, id, digest string }{{"activate", "m-1", digest}, {"approve", "m-2", digest}, {"approve", "m-1", strings.Repeat("b", 64)}} {
		if _, err := VerifyMandateActorAttestation(raw, manifest, proof, challenge, now, wrong.op, wrong.id, wrong.digest); err == nil {
			t.Fatalf("accepted mismatched %+v", wrong)
		}
	}
	if _, err := VerifyMandateActorAttestation(raw, manifest, proof, challenge, now.Add(time.Minute), "approve", "m-1", digest); err == nil {
		t.Fatal("expired consent accepted")
	}
}

func TestMandateActorProofBackendInterop(t *testing.T) {
	path := os.Getenv("AUTHORITY_MANDATE_ARTIFACT")
	if path == "" {
		t.Skip("interop fixture supplied by Authority test")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
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
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	root, err := base64.RawURLEncoding.DecodeString(fixture.RootPublic)
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := ParseAndVerifyTrustManifest(fixture.Manifest, map[string]ed25519.PublicKey{fixture.RootKeyID: root}, Binding{OrganizationID: fixture.OrganizationID, Issuer: fixture.Issuer, InstallationID: fixture.InstallationID}, fixture.Now)
	if err != nil {
		t.Fatal(err)
	}
	actor, err := base64.RawURLEncoding.DecodeString(fixture.ActorPublicKey)
	if err != nil {
		t.Fatal(err)
	}
	proof := &ActorProof{OrganizationID: fixture.OrganizationID, InstallationID: fixture.InstallationID, Audience: "bloom.authority.mandate-consent", public: ed25519.PublicKey(actor)}
	if _, err := VerifyMandateActorAttestation(fixture.ActorAttestation, manifest, proof, fixture.ActorChallenge, fixture.Now, "approve", "m-1", strings.Repeat("a", 64)); err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyMandateActorAttestation(fixture.ActorAttestation, manifest, proof, fixture.ActorChallenge, fixture.Now, "activate", "m-1", strings.Repeat("a", 64)); err == nil {
		t.Fatal("approval reused for activation")
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
