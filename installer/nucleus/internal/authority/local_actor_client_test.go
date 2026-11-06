package authority

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type localActorRoundTripper func(*http.Request) (*http.Response, error)

func (f localActorRoundTripper) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestLocalActorClientKeepsProofInMemoryAndBindsChallenge(t *testing.T) {
	_, private, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)
	client := &http.Client{Transport: localActorRoundTripper(func(r *http.Request) (*http.Response, error) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1/authority/actor/challenge" || r.Header.Get("X-Bloom-Signature") == "" {
			return &http.Response{StatusCode: http.StatusForbidden, Body: io.NopCloser(strings.NewReader(`{}`)), Header: make(http.Header)}, nil
		}
		var body ActorChallengeRequest
		if json.NewDecoder(r.Body).Decode(&body) != nil || body.Audience != "bloom.authority.local-actor" || body.Mode != "list" || body.MandateID != "mandate" {
			return &http.Response{StatusCode: http.StatusBadRequest, Body: io.NopCloser(strings.NewReader(`{}`)), Header: make(http.Header)}, nil
		}
		response, _ := json.Marshal(map[string]any{"challenge": "nonce", "organizationId": "org", "installationId": "installation", "actorPublicKey": body.ActorPublicKey, "audience": body.Audience, "expiresAt": now.Add(2 * time.Minute), "mode": "list", "mandateId": "mandate", "preparedContractDigest": body.PreparedContractDigest})
		return &http.Response{StatusCode: http.StatusCreated, Body: io.NopCloser(strings.NewReader(string(response))), Header: make(http.Header)}, nil
	})}
	digest := "sha256:" + strings.Repeat("a", 64)
	pending, err := (LocalActorClient{BaseURL: "https://authority.test", Binding: Binding{OrganizationID: "org", InstallationID: "installation"}, InstallationPrivateKey: private, HTTP: client, Now: func() time.Time { return now }}).Begin(context.Background(), "list", "mandate", digest)
	if err != nil {
		t.Fatal(err)
	}
	if pending.Proof == nil || pending.Challenge != "nonce" || pending.Approval.Signature == "" || pending.Approval.Audience != "bloom.authority.local-actor" || pending.ConsentURL == "" || pending.ChallengeDigest == "" {
		t.Fatalf("pending=%+v", pending)
	}
}

func TestLocalActorClientRejectsMismatchedChallenge(t *testing.T) {
	_, private, _ := ed25519.GenerateKey(nil)
	now := time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)
	client := &http.Client{Transport: localActorRoundTripper(func(r *http.Request) (*http.Response, error) {
		var body ActorChallengeRequest
		_ = json.NewDecoder(r.Body).Decode(&body)
		response, _ := json.Marshal(map[string]any{"challenge": "nonce", "organizationId": "other", "installationId": "installation", "actorPublicKey": body.ActorPublicKey, "audience": body.Audience, "expiresAt": now.Add(time.Minute), "mode": "list", "mandateId": "mandate", "preparedContractDigest": body.PreparedContractDigest})
		return &http.Response{StatusCode: http.StatusCreated, Body: io.NopCloser(strings.NewReader(string(response))), Header: make(http.Header)}, nil
	})}
	_, err := (LocalActorClient{BaseURL: "https://authority.test", Binding: Binding{OrganizationID: "org", InstallationID: "installation"}, InstallationPrivateKey: private, HTTP: client, Now: func() time.Time { return now }}).Begin(context.Background(), "list", "mandate", "sha256:"+strings.Repeat("a", 64))
	if err == nil {
		t.Fatal("mismatched challenge accepted")
	}
}

func TestLocalActorClientPollUsesInstallationAuthAndSingleDeliveryEndpoint(t *testing.T) {
	_, private, _ := ed25519.GenerateKey(nil)
	proof, _ := NewActorProof("org", "installation", "bloom.authority.local-actor")
	calls := 0
	client := &http.Client{Transport: localActorRoundTripper(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.Method != http.MethodGet || r.URL.Path != "/v1/authority/actor/attestation" || r.URL.Query().Get("org") != "org" || r.URL.Query().Get("challenge_digest") != "digest" || r.Header.Get("X-Bloom-Signature") == "" {
			t.Fatalf("unexpected poll request: %s headers=%v", r.URL, r.Header)
		}
		if calls == 1 {
			return &http.Response{StatusCode: http.StatusAccepted, Body: io.NopCloser(strings.NewReader(`{"status":"pending"}`)), Header: make(http.Header)}, nil
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(`{"payload":{},"integrity":{}}`)), Header: make(http.Header)}, nil
	})}
	actorClient := LocalActorClient{BaseURL: "https://authority.test", Binding: Binding{OrganizationID: "org", InstallationID: "installation"}, InstallationPrivateKey: private, HTTP: client}
	pending := LocalActorPending{Proof: proof, ChallengeDigest: "digest"}
	if raw, waiting, err := actorClient.Poll(context.Background(), pending); err != nil || !waiting || raw != nil {
		t.Fatalf("pending poll raw=%s waiting=%t err=%v", raw, waiting, err)
	}
	raw, waiting, err := actorClient.Poll(context.Background(), pending)
	if err != nil || waiting || string(raw) != `{"payload":{},"integrity":{}}` {
		t.Fatalf("delivered poll raw=%s waiting=%t err=%v", raw, waiting, err)
	}
}
