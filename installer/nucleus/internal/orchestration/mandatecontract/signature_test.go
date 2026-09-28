package mandatecontract

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"nucleus/internal/authority"
	"time"
)

func TestSignatureBindsEntireExecutableContract(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	identity := &authority.LocalIdentity{InstallationID: "installation-1", PublicKey: public, PrivateKey: private}
	envelope, err := Sign(fixtureContract(), identity)
	if err != nil {
		t.Fatal(err)
	}
	if err := Verify(envelope, identity.InstallationID, public); err != nil {
		t.Fatal(err)
	}
	altered := envelope
	altered.Contract.Inputs[0].SHA256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	if err := Verify(altered, identity.InstallationID, public); err == nil {
		t.Fatal("altered Files digest accepted")
	}
	if err := Verify(envelope, "other-installation", public); err == nil {
		t.Fatal("wrong installation accepted")
	}
}

func TestActReceiptPersistsOnceAndDetectsTamperingBeforeReplay(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	identity := &authority.LocalIdentity{InstallationID: "installation-1", PublicKey: public, PrivateKey: private}
	contract := fixtureContract()
	digest, err := Digest(contract)
	if err != nil {
		t.Fatal(err)
	}
	receipt, err := SignActReceipt(ActReceipt{Operation: "approve", MandateID: contract.MandateID, ContractDigest: digest, Contract: contract, OrganizationID: contract.OrganizationID, Decision: authority.AuthorityDecision{Outcome: authority.DecisionAllow}, RecordedAt: time.Now().UTC()}, identity)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err := SaveActReceipt(dir, receipt); err != nil {
		t.Fatal(err)
	}
	if err := SaveActReceipt(dir, receipt); err == nil {
		t.Fatal("duplicate act accepted")
	}
	loaded, err := LoadActReceipt(dir, "approve")
	if err != nil || loaded.ContractDigest != digest {
		t.Fatalf("loaded=%#v err=%v", loaded, err)
	}
	loaded.Contract.Inputs[0].SHA256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	if err := VerifyActReceipt(loaded, identity, nil, "approve", contract.MandateID, digest, contract.ProjectID); err == nil {
		t.Fatal("tampered receipt accepted")
	}
}

func TestRecordedMandateApprovalSurvivesRestartAndCannotActivate(t *testing.T) {
	rootPublic, rootPrivate, _ := ed25519.GenerateKey(rand.Reader)
	issuerPublic, issuerPrivate, _ := ed25519.GenerateKey(rand.Reader)
	installationPublic, installationPrivate, _ := ed25519.GenerateKey(rand.Reader)
	actorPublic, _, _ := ed25519.GenerateKey(rand.Reader)
	identity := &authority.LocalIdentity{InstallationID: "installation-1", PublicKey: installationPublic, PrivateKey: installationPrivate}
	now := time.Date(2026, 9, 9, 12, 0, 0, 0, time.UTC)
	contract := fixtureContract()
	digest, _ := Digest(contract)
	signedArtifact := func(payload any, domain, keyID string, private ed25519.PrivateKey) json.RawMessage {
		raw, _ := json.Marshal(payload)
		canonical, err := authority.Canonicalize(raw)
		if err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(canonical)
		signature := ed25519.Sign(private, append(append([]byte(domain), 0), canonical...))
		out, _ := json.Marshal(authority.Envelope{Payload: raw, Integrity: authority.Integrity{Canonicalization: "JCS-RFC8785", DigestAlgorithm: "SHA-256", Digest: base64.RawURLEncoding.EncodeToString(sum[:]), SignatureAlgorithm: "Ed25519", KeyID: keyID, Signature: base64.RawURLEncoding.EncodeToString(signature)}})
		return out
	}
	manifest := signedArtifact(authority.TrustManifestPayload{Schema: "bloom.authority.trust-manifest", SchemaVersion: "1.0", ManifestID: "manifest-1", Issuer: "issuer", OrganizationID: contract.OrganizationID, ManifestVersion: "1", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour), RootKeyID: "root", Keys: []authority.TrustKey{{KeyID: "issuer-key", PublicKey: base64.RawURLEncoding.EncodeToString(issuerPublic), Status: "active", ValidFrom: now.Add(-time.Minute)}}}, "BLOOM-AUTHORITY-TRUST-MANIFEST-v1", "root", rootPrivate)
	challenge := "one-time-challenge"
	challengeSum := sha256.Sum256([]byte(challenge))
	attestation := signedArtifact(authority.ActorAttestation{Schema: "bloom.authority.actor-attestation", SchemaVersion: "1.2", AttestationID: "att-1", Issuer: "issuer", OrganizationID: contract.OrganizationID, InstallationID: identity.InstallationID, PrincipalID: "human", ActorPublicKey: base64.RawURLEncoding.EncodeToString(actorPublic), Audience: "bloom.authority.mandate-consent", ChallengeDigest: base64.RawURLEncoding.EncodeToString(challengeSum[:]), IssuedAt: now, ExpiresAt: now.Add(time.Minute), Operation: "approve", MandateID: contract.MandateID, ContractDigest: digest}, "BLOOM-AUTHORITY-ACTOR-ATTESTATION-v1", "issuer-key", issuerPrivate)
	decision := authority.AuthorityDecision{Outcome: authority.DecisionAllow, Operation: "mandate.sign", PrincipalID: "human", Scope: authority.Scope{Type: "project", ID: contract.ProjectID}, EvaluatedAt: now.Add(time.Second)}
	receipt, err := SignActReceipt(ActReceipt{Operation: "approve", MandateID: contract.MandateID, ContractDigest: digest, Contract: contract, OrganizationID: contract.OrganizationID, Attestation: attestation, Manifest: manifest, ActorChallenge: challenge, ActorPublicKey: base64.RawURLEncoding.EncodeToString(actorPublic), Decision: decision, RecordedAt: now.Add(2 * time.Second)}, identity)
	if err != nil {
		t.Fatal(err)
	}
	roots := map[string]ed25519.PublicKey{"root": rootPublic}
	if err := VerifyActReceipt(receipt, identity, roots, "approve", contract.MandateID, digest, contract.ProjectID); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	if err := SaveActReceipt(dir, receipt); err != nil {
		t.Fatal(err)
	}
	reloaded, err := LoadActReceipt(dir, "approve")
	if err != nil {
		t.Fatal(err)
	}
	if err := VerifyActReceipt(reloaded, identity, roots, "approve", contract.MandateID, digest, contract.ProjectID); err != nil {
		t.Fatalf("restart verification: %v", err)
	}
	if err := VerifyActReceipt(reloaded, identity, roots, "activate", contract.MandateID, digest, contract.ProjectID); err == nil {
		t.Fatal("approval replayed as activation")
	}
	if err := VerifyActReceipt(reloaded, identity, roots, "approve", contract.MandateID, "changed", contract.ProjectID); err == nil {
		t.Fatal("approval replayed for another digest")
	}
}

func TestLoadVerifiedUsesPersistedContractAndLocalSigner(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	dir := filepath.Join(root, "mandate-1")
	if err := os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	identityPath := filepath.Join(root, "identity.json")
	identityRaw, _ := json.Marshal(map[string]string{"installation_id": "installation-1", "public_key": base64.StdEncoding.EncodeToString(public)})
	if err := os.WriteFile(identityPath, identityRaw, 0600); err != nil {
		t.Fatal(err)
	}
	envelope, err := Sign(fixtureContract(), &authority.LocalIdentity{InstallationID: "installation-1", PublicKey: public, PrivateKey: private})
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(envelope)
	mandatePath := filepath.Join(dir, "mandate.json")
	if err := os.WriteFile(mandatePath, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadVerified(dir, identityPath); err != nil {
		t.Fatal(err)
	}
	envelope.Contract.Inputs[0].SHA256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	raw, _ = json.Marshal(envelope)
	if err := os.WriteFile(mandatePath, raw, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadVerified(dir, identityPath); err == nil {
		t.Fatal("modified durable Files accepted")
	}
}
