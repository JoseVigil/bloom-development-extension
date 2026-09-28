package authority

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"
)

func LoadExistingLocalIdentity(path string) (*LocalIdentity, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return parseLocalIdentity(raw)
}

func FetchMandateTrustEnvelope(ctx context.Context, baseURL string, binding Binding, identity *LocalIdentity, roots map[string]ed25519.PublicKey, now time.Time) ([]byte, *VerifiedTrustManifest, error) {
	if identity == nil {
		return nil, nil, errors.New("installation identity required")
	}
	client := &SyncClient{BaseURL: baseURL, Binding: binding, InstallationPrivateKey: identity.PrivateKey, Now: func() time.Time { return now }}
	req, err := client.signedRequest(ctx, http.MethodGet, "/v1/authority/trust-manifest", url.Values{"org": {binding.OrganizationID}})
	if err != nil {
		return nil, nil, err
	}
	response, err := client.client().Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer response.Body.Close()
	if response.StatusCode/100 != 2 {
		return nil, nil, errors.New("Authority trust manifest unavailable")
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, (4<<20)+1))
	if err != nil {
		return nil, nil, err
	}
	if len(raw) > 4<<20 {
		return nil, nil, errors.New("trust manifest too large")
	}
	var probe struct {
		Payload struct {
			Issuer string `json:"issuer"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(raw, &probe); err != nil {
		return nil, nil, err
	}
	binding.Issuer = probe.Payload.Issuer
	manifest, err := ParseAndVerifyTrustManifest(raw, roots, binding, now)
	if err != nil {
		return nil, nil, err
	}
	return raw, manifest, nil
}

// MandateConsentClient uses installation authentication for the challenge.
// The human action itself occurs in Authority's authenticated browser page.
type MandateConsentClient struct {
	BaseURL                string
	Binding                Binding
	InstallationPrivateKey ed25519.PrivateKey
	HTTP                   *http.Client
	Now                    func() time.Time
}

type MandateConsentPending struct {
	Proof     *ActorProof
	Challenge string
	URL       string
	Operation string
	MandateID string
	Digest    string
}

func (c MandateConsentClient) Begin(ctx context.Context, operation, mandateID, digest string) (MandateConsentPending, error) {
	proof, err := NewActorProof(c.Binding.OrganizationID, c.Binding.InstallationID, "bloom.authority.mandate-consent")
	if err != nil {
		return MandateConsentPending{}, err
	}
	request, err := proof.MandateChallengeRequest(operation, mandateID, digest)
	if err != nil {
		return MandateConsentPending{}, err
	}
	client := &SyncClient{BaseURL: c.BaseURL, Binding: c.Binding, InstallationPrivateKey: c.InstallationPrivateKey, HTTP: c.HTTP, Now: c.Now}
	httpRequest, err := client.signedRequest(ctx, http.MethodPost, "/v1/authority/actor/challenge", url.Values{"org": {c.Binding.OrganizationID}})
	if err != nil {
		return MandateConsentPending{}, err
	}
	data, err := json.Marshal(request)
	if err != nil {
		return MandateConsentPending{}, err
	}
	httpRequest.Body = io.NopCloser(bytes.NewReader(data))
	httpRequest.ContentLength = int64(len(data))
	httpRequest.Header.Set("Content-Type", "application/json")
	response, err := client.client().Do(httpRequest)
	if err != nil {
		return MandateConsentPending{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		return MandateConsentPending{}, errors.New("Authority Mandate challenge rejected")
	}
	var challenge struct {
		Challenge      string    `json:"challenge"`
		OrganizationID string    `json:"organizationId"`
		InstallationID string    `json:"installationId"`
		ActorPublicKey string    `json:"actorPublicKey"`
		Audience       string    `json:"audience"`
		Operation      string    `json:"operation"`
		MandateID      string    `json:"mandateId"`
		ContractDigest string    `json:"contractDigest"`
		ExpiresAt      time.Time `json:"expiresAt"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 8192)).Decode(&challenge); err != nil {
		return MandateConsentPending{}, err
	}
	if challenge.Challenge == "" || challenge.OrganizationID != c.Binding.OrganizationID || challenge.InstallationID != c.Binding.InstallationID || challenge.ActorPublicKey != request.ActorPublicKey || challenge.Audience != request.Audience || challenge.Operation != operation || challenge.MandateID != mandateID || challenge.ContractDigest != digest || !client.now().Before(challenge.ExpiresAt) {
		return MandateConsentPending{}, errors.New("Authority Mandate challenge binding mismatch")
	}
	packet, err := proof.SignChallenge(challenge.Challenge)
	if err != nil {
		return MandateConsentPending{}, err
	}
	encoded, err := json.Marshal(packet)
	if err != nil {
		return MandateConsentPending{}, err
	}
	base, err := url.Parse(c.BaseURL)
	if err != nil {
		return MandateConsentPending{}, err
	}
	base.Path = "/v1/authority/actor/mandate-consent"
	base.RawQuery = url.Values{"packet": {base64.RawURLEncoding.EncodeToString(encoded)}}.Encode()
	return MandateConsentPending{Proof: proof, Challenge: challenge.Challenge, URL: base.String(), Operation: operation, MandateID: mandateID, Digest: digest}, nil
}

func (pending MandateConsentPending) Verify(raw []byte, manifest *VerifiedTrustManifest, now time.Time) (ActorAttestation, error) {
	return VerifyMandateActorAttestation(raw, manifest, pending.Proof, pending.Challenge, now, pending.Operation, pending.MandateID, pending.Digest)
}

func VerifyRecordedMandateConsent(raw []byte, manifest *VerifiedTrustManifest, org, installation, actorPublic, challenge string, at time.Time, operation, mandateID, digest string) (ActorAttestation, error) {
	public, err := base64.RawURLEncoding.DecodeString(actorPublic)
	if err != nil || len(public) != ed25519.PublicKeySize {
		return ActorAttestation{}, errors.New("recorded actor key invalid")
	}
	proof := &ActorProof{OrganizationID: org, InstallationID: installation, Audience: "bloom.authority.mandate-consent", public: ed25519.PublicKey(public)}
	return VerifyMandateActorAttestation(raw, manifest, proof, challenge, at, operation, mandateID, digest)
}
