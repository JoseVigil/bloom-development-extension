package authority

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"
)

const actorProofDomain = "BLOOM-AUTHORITY-ACTOR-PROOF-v1"
const actorAttestationDomain = "BLOOM-AUTHORITY-ACTOR-ATTESTATION-v1"

type ActorProof struct {
	OrganizationID string
	InstallationID string
	Audience       string
	public         ed25519.PublicKey
	private        ed25519.PrivateKey
}
type ActorChallengeRequest struct {
	OrganizationID string `json:"organizationId"`
	ActorPublicKey string `json:"actorPublicKey"`
	Audience       string `json:"audience"`
}
type ActorChallengeApproval struct {
	OrganizationID string `json:"organizationId"`
	InstallationID string `json:"installationId"`
	ActorPublicKey string `json:"actorPublicKey"`
	Audience       string `json:"audience"`
	Challenge      string `json:"challenge"`
	Signature      string `json:"signature"`
}
type actorPossession struct {
	Challenge      string `json:"challenge"`
	OrganizationID string `json:"organization_id"`
	InstallationID string `json:"installation_id"`
	Audience       string `json:"audience"`
}
type ActorAttestation struct {
	Schema          string    `json:"schema"`
	SchemaVersion   string    `json:"schema_version"`
	AttestationID   string    `json:"attestation_id"`
	Issuer          string    `json:"issuer"`
	OrganizationID  string    `json:"organization_id"`
	InstallationID  string    `json:"installation_id"`
	PrincipalID     string    `json:"principal_id"`
	ActorPublicKey  string    `json:"actor_public_key"`
	Audience        string    `json:"audience"`
	ChallengeDigest string    `json:"challenge_digest"`
	IssuedAt        time.Time `json:"issued_at"`
	ExpiresAt       time.Time `json:"expires_at"`
	// Aditivo, SchemaVersion "1.1" (§2.3 del encargo de nacimiento de agente Orbital). Wire fields son
	// obligatorios en este paquete (ver decodeWire, envelope.go) — nunca omitempty, aunque en "1.0"
	// viajen como "" (VerifyActorAttestation exige que sea así, ver más abajo).
	RunID          string `json:"run_id"`
	DesignationID  string `json:"designation_id"`
	CapabilitySeam string `json:"capability_seam"`
}

// allowedActorProofAudiences es una whitelist, no una eliminación del chequeo: agrega
// "bloom.authority.orbital-context" a "bloom.authority.local-actor" sin abrir la validación a
// cualquier audience arbitraria (§2.3 del encargo de nacimiento de agente Orbital).
var allowedActorProofAudiences = map[string]struct{}{
	"bloom.authority.local-actor":     {},
	"bloom.authority.orbital-context": {},
}

func NewActorProof(org, installation, audience string) (*ActorProof, error) {
	if _, ok := allowedActorProofAudiences[audience]; org == "" || installation == "" || !ok {
		return nil, errors.New("invalid actor proof binding")
	}
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	return &ActorProof{org, installation, audience, pub, priv}, nil
}
func (p *ActorProof) ChallengeRequest() ActorChallengeRequest {
	return ActorChallengeRequest{p.OrganizationID, base64.RawURLEncoding.EncodeToString(p.public), p.Audience}
}
func (p *ActorProof) SignChallenge(challenge string) (ActorChallengeApproval, error) {
	if p == nil || challenge == "" || len(p.private) != ed25519.PrivateKeySize {
		return ActorChallengeApproval{}, errors.New("actor proof unavailable")
	}
	pos := actorPossession{challenge, p.OrganizationID, p.InstallationID, p.Audience}
	raw, _ := json.Marshal(pos)
	canonical, err := Canonicalize(raw)
	if err != nil {
		return ActorChallengeApproval{}, err
	}
	sig := ed25519.Sign(p.private, append(append([]byte(actorProofDomain), 0), canonical...))
	return ActorChallengeApproval{p.OrganizationID, p.InstallationID, base64.RawURLEncoding.EncodeToString(p.public), p.Audience, challenge, base64.RawURLEncoding.EncodeToString(sig)}, nil
}
func VerifyActorAttestation(raw []byte, manifest *VerifiedTrustManifest, proof *ActorProof, challenge string, now time.Time) (ActorAttestation, error) {
	var zero ActorAttestation
	if manifest == nil || proof == nil {
		return zero, errors.New("actor attestation prerequisites required")
	}
	if err := rejectDuplicateKeys(raw); err != nil {
		return zero, err
	}
	var env Envelope
	if err := decodeWire(raw, &env); err != nil {
		return zero, err
	}
	trust, err := manifest.SnapshotTrust(now)
	if err != nil {
		return zero, err
	}
	key, ok := trust[manifest.Payload.Issuer][env.Integrity.KeyID]
	if !ok || env.Integrity.Canonicalization != "JCS-RFC8785" || env.Integrity.DigestAlgorithm != "SHA-256" || env.Integrity.SignatureAlgorithm != "Ed25519" {
		return zero, errors.New("actor attestation integrity mismatch")
	}
	canonical, err := Canonicalize(env.Payload)
	if err != nil {
		return zero, err
	}
	sum := sha256.Sum256(canonical)
	if base64.RawURLEncoding.EncodeToString(sum[:]) != env.Integrity.Digest {
		return zero, errors.New("actor attestation digest mismatch")
	}
	sig, err := base64.RawURLEncoding.DecodeString(env.Integrity.Signature)
	if err != nil || !ed25519.Verify(key, append(append([]byte(actorAttestationDomain), 0), canonical...), sig) {
		return zero, errors.New("invalid actor attestation signature")
	}
	var a ActorAttestation
	if err = decodeWire(env.Payload, &a); err != nil {
		return zero, err
	}
	challengeSum := sha256.Sum256([]byte(challenge))
	if a.Schema != "bloom.authority.actor-attestation" || (a.SchemaVersion != "1.0" && a.SchemaVersion != "1.1") || a.AttestationID == "" || a.PrincipalID == "" || a.Issuer != manifest.Payload.Issuer || a.OrganizationID != proof.OrganizationID || a.InstallationID != proof.InstallationID || a.Audience != proof.Audience || a.ActorPublicKey != base64.RawURLEncoding.EncodeToString(proof.public) || a.ChallengeDigest != base64.RawURLEncoding.EncodeToString(challengeSum[:]) || a.IssuedAt.After(now) || !now.Before(a.ExpiresAt) {
		return zero, errors.New("actor attestation binding or validity mismatch")
	}
	// "1.0" nunca lleva los campos de Orbital (ningún consumidor existente de bloom.authority.local-actor
	// los completa hoy); "1.1" los exige completos — son el motivo de ser de esa versión de schema.
	if a.SchemaVersion == "1.0" && (a.RunID != "" || a.DesignationID != "" || a.CapabilitySeam != "") {
		return zero, errors.New("actor attestation schema version mismatch")
	}
	if a.SchemaVersion == "1.1" && (a.RunID == "" || a.DesignationID == "" || a.CapabilitySeam == "") {
		return zero, errors.New("actor attestation orbital context fields required")
	}
	return a, nil
}
