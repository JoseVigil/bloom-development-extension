package authority

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"time"
)

// LocalActorClient creates only the ephemeral proof and installation-signed
// challenge. Human approval remains a browser action owned by Authority.
type LocalActorClient struct {
	BaseURL                string
	Binding                Binding
	InstallationPrivateKey ed25519.PrivateKey
	HTTP                   *http.Client
	Now                    func() time.Time
}

type LocalActorPending struct {
	Proof                  *ActorProof
	Challenge              string
	Approval               ActorChallengeApproval
	ExpiresAt              time.Time
	ConsentURL             string
	ChallengeDigest        string
	Mode                   string
	MandateID              string
	PreparedContractDigest string
}

func (c LocalActorClient) Begin(ctx context.Context, mode, mandateID, preparedDigest string) (LocalActorPending, error) {
	if (mode != "list" && mode != "validate") || mandateID == "" || len(preparedDigest) != 71 || preparedDigest[:7] != "sha256:" {
		return LocalActorPending{}, errors.New("invalid Intent Supply actor context")
	}
	proof, err := NewActorProof(c.Binding.OrganizationID, c.Binding.InstallationID, "bloom.authority.local-actor")
	if err != nil {
		return LocalActorPending{}, err
	}
	client := &SyncClient{BaseURL: c.BaseURL, Binding: c.Binding, InstallationPrivateKey: c.InstallationPrivateKey, HTTP: c.HTTP, Now: c.Now}
	request, err := client.signedRequest(ctx, http.MethodPost, "/v1/authority/actor/challenge", url.Values{"org": {c.Binding.OrganizationID}})
	if err != nil {
		return LocalActorPending{}, err
	}
	challengeRequest := proof.ChallengeRequest()
	challengeRequest.Mode, challengeRequest.MandateID, challengeRequest.PreparedContractDigest = mode, mandateID, preparedDigest
	raw, err := json.Marshal(challengeRequest)
	if err != nil {
		return LocalActorPending{}, err
	}
	request.Body = io.NopCloser(bytes.NewReader(raw))
	request.ContentLength = int64(len(raw))
	request.Header.Set("Content-Type", "application/json")
	response, err := client.client().Do(request)
	if err != nil {
		return LocalActorPending{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		return LocalActorPending{}, errors.New("Authority local actor challenge rejected")
	}
	var challenge struct {
		Challenge              string    `json:"challenge"`
		OrganizationID         string    `json:"organizationId"`
		InstallationID         string    `json:"installationId"`
		ActorPublicKey         string    `json:"actorPublicKey"`
		Audience               string    `json:"audience"`
		ExpiresAt              time.Time `json:"expiresAt"`
		Mode                   string    `json:"mode"`
		MandateID              string    `json:"mandateId"`
		PreparedContractDigest string    `json:"preparedContractDigest"`
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 8192))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&challenge) != nil || decoder.Decode(new(any)) != io.EOF {
		return LocalActorPending{}, errors.New("Authority local actor challenge malformed")
	}
	expected := proof.ChallengeRequest()
	if challenge.Challenge == "" || challenge.OrganizationID != c.Binding.OrganizationID || challenge.InstallationID != c.Binding.InstallationID ||
		challenge.ActorPublicKey != expected.ActorPublicKey || challenge.Audience != expected.Audience || !client.now().Before(challenge.ExpiresAt) {
		return LocalActorPending{}, errors.New("Authority local actor challenge binding mismatch")
	}
	if challenge.Mode != mode || challenge.MandateID != mandateID || challenge.PreparedContractDigest != preparedDigest {
		return LocalActorPending{}, errors.New("Authority local actor operation binding mismatch")
	}
	approval, err := proof.SignChallenge(challenge.Challenge)
	if err != nil {
		return LocalActorPending{}, err
	}
	packet, err := json.Marshal(approval)
	if err != nil {
		return LocalActorPending{}, err
	}
	base, err := url.Parse(c.BaseURL)
	if err != nil {
		return LocalActorPending{}, err
	}
	base.Path = "/v1/authority/actor/intent-supply-consent"
	base.RawQuery = url.Values{"packet": {base64.RawURLEncoding.EncodeToString(packet)}}.Encode()
	digest := sha256.Sum256([]byte(challenge.Challenge))
	return LocalActorPending{Proof: proof, Challenge: challenge.Challenge, Approval: approval, ExpiresAt: challenge.ExpiresAt,
		ConsentURL: base.String(), ChallengeDigest: base64.RawURLEncoding.EncodeToString(digest[:]), Mode: mode, MandateID: mandateID, PreparedContractDigest: preparedDigest}, nil
}

// Poll retrieves the signed attestation through installation authentication.
// Authority owns single delivery (202 pending, 200 delivered, 410 consumed).
func (c LocalActorClient) Poll(ctx context.Context, pending LocalActorPending) ([]byte, bool, error) {
	if pending.Proof == nil || pending.ChallengeDigest == "" {
		return nil, false, errors.New("local actor pending context required")
	}
	client := &SyncClient{BaseURL: c.BaseURL, Binding: c.Binding, InstallationPrivateKey: c.InstallationPrivateKey, HTTP: c.HTTP, Now: c.Now}
	request, err := client.signedRequest(ctx, http.MethodGet, "/v1/authority/actor/attestation", url.Values{"org": {c.Binding.OrganizationID}, "challenge_digest": {pending.ChallengeDigest}})
	if err != nil {
		return nil, false, err
	}
	response, err := client.client().Do(request)
	if err != nil {
		return nil, false, err
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusAccepted {
		return nil, true, nil
	}
	if response.StatusCode != http.StatusOK {
		return nil, false, errors.New("Authority local actor attestation unavailable")
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, (4<<20)+1))
	if err != nil || len(raw) == 0 || len(raw) > 4<<20 {
		return nil, false, errors.New("Authority local actor attestation malformed")
	}
	return raw, false, nil
}

func (p LocalActorPending) Verify(raw []byte, manifest *VerifiedTrustManifest, now time.Time) (ActorAttestation, error) {
	return VerifyActorAttestation(raw, manifest, p.Proof, p.Challenge, now)
}
