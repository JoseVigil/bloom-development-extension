package authority

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
	"sort"
	"time"
)

const geneRatificationDomain = "BLOOM-GENE-CONTRIBUTION-RATIFICATION-v1"

var geneDigestPattern = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)

type GeneRatificationPayload struct {
	SchemaVersion        string    `json:"schema_version"`
	Issuer               string    `json:"issuer"`
	KeyID                string    `json:"key_id"`
	Permission           string    `json:"permission"`
	PrincipalID          string    `json:"principal_id"`
	ProjectID            string    `json:"project_id"`
	GeneID               string    `json:"gene_id"`
	ContributionID       string    `json:"contribution_id"`
	ContributionDigest   string    `json:"contribution_digest"`
	MandateID            string    `json:"mandate_id"`
	IntentID             string    `json:"intent_id"`
	DecisionID           string    `json:"decision_id"`
	RepositoryIDs        []string  `json:"repository_ids"`
	AuthorityVersion     string    `json:"authority_version"`
	AuthorityStateDigest string    `json:"authority_state_digest"`
	ControlRevisions     []string  `json:"control_revisions"`
	Outcome              string    `json:"outcome"`
	DecidedAt            time.Time `json:"decided_at"`
}

type GeneRatificationEnvelope struct {
	Payload   GeneRatificationPayload `json:"payload"`
	Digest    string                  `json:"digest"`
	Signature string                  `json:"signature"`
}

func validateGeneRatificationPayload(p GeneRatificationPayload) error {
	if p.SchemaVersion != "bloom.gene-ratification/v1" || p.Issuer == "" || p.KeyID == "" ||
		p.Permission != PermissionGeneContributionRatify || p.PrincipalID == "" || p.ProjectID == "" ||
		p.GeneID == "" || p.ContributionID == "" || !geneDigestPattern.MatchString(p.ContributionDigest) ||
		p.MandateID == "" || p.IntentID == "" || p.DecisionID == "" || p.AuthorityVersion == "" ||
		!geneDigestPattern.MatchString(p.AuthorityStateDigest) || p.Outcome != "ratified" || p.DecidedAt.IsZero() {
		return errors.New("invalid Gene ratification payload")
	}
	if !sort.StringsAreSorted(p.RepositoryIDs) || !sort.StringsAreSorted(p.ControlRevisions) {
		return errors.New("Gene ratification arrays must be sorted")
	}
	for i, id := range p.RepositoryIDs {
		if id == "" || (i > 0 && id == p.RepositoryIDs[i-1]) {
			return errors.New("invalid Gene ratification repository ids")
		}
	}
	return nil
}

func SignGeneRatification(p GeneRatificationPayload, private ed25519.PrivateKey) ([]byte, error) {
	if err := validateGeneRatificationPayload(p); err != nil || len(private) != ed25519.PrivateKeySize {
		if err != nil {
			return nil, err
		}
		return nil, errors.New("Gene ratification signing key required")
	}
	p.DecidedAt = p.DecidedAt.UTC()
	payloadRaw, err := json.Marshal(p)
	if err != nil {
		return nil, err
	}
	canonical, err := Canonicalize(payloadRaw)
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256(canonical)
	digest := "sha256:" + hex.EncodeToString(sum[:])
	sig := ed25519.Sign(private, append(append([]byte(geneRatificationDomain), 0), canonical...))
	env := GeneRatificationEnvelope{Payload: p, Digest: digest, Signature: base64.RawURLEncoding.EncodeToString(sig)}
	return json.Marshal(env)
}

type GeneRatificationVerifier struct {
	TrustedKeys map[string]ed25519.PublicKey
}

func (v GeneRatificationVerifier) VerifyGeneRatification(raw []byte, projectID, geneID, contributionID, contributionDigest, mandateID, intentID, decisionID string, repositoryIDs []string) (string, error) {
	if err := rejectDuplicateKeys(raw); err != nil {
		return "", err
	}
	var env GeneRatificationEnvelope
	if err := decodeStrict(raw, &env); err != nil {
		return "", err
	}
	p := env.Payload
	if err := validateGeneRatificationPayload(p); err != nil {
		return "", err
	}
	if p.ProjectID != projectID || p.GeneID != geneID || p.ContributionID != contributionID ||
		p.ContributionDigest != contributionDigest || p.MandateID != mandateID || p.IntentID != intentID || p.DecisionID != decisionID || !equalOrderedStrings(p.RepositoryIDs, repositoryIDs) {
		return "", errors.New("Gene ratification scope mismatch")
	}
	payloadRaw, err := json.Marshal(p)
	if err != nil {
		return "", err
	}
	canonical, err := Canonicalize(payloadRaw)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	digest := "sha256:" + hex.EncodeToString(sum[:])
	if env.Digest != digest {
		return "", errors.New("Gene ratification digest mismatch")
	}
	key := v.TrustedKeys[p.KeyID]
	sig, err := base64.RawURLEncoding.DecodeString(env.Signature)
	if err != nil || len(key) != ed25519.PublicKeySize || !ed25519.Verify(key, append(append([]byte(geneRatificationDomain), 0), canonical...), sig) {
		return "", errors.New("Gene ratification signature invalid")
	}
	return digest, nil
}

func equalOrderedStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
