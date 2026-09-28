package authority

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestMandateConsentClientBindsChallengeAndBrowserPacket(t *testing.T) {
	_, private, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/v1/authority/actor/challenge" || r.Header.Get("X-Bloom-Signature") == "" {
			t.Errorf("unsigned request: %s", r.URL)
			w.WriteHeader(403)
			return
		}
		var body ActorChallengeRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body.Operation != "approve" || body.MandateID != "m-1" || body.ContractDigest != "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" {
			t.Errorf("context: %#v", body)
		}
		w.WriteHeader(201)
		_ = json.NewEncoder(w).Encode(map[string]any{"challenge": "nonce", "organizationId": "org", "installationId": "install", "actorPublicKey": body.ActorPublicKey, "audience": body.Audience, "operation": body.Operation, "mandateId": body.MandateID, "contractDigest": body.ContractDigest, "expiresAt": now.Add(time.Minute)})
	}))
	defer server.Close()
	c := MandateConsentClient{BaseURL: server.URL, Binding: Binding{OrganizationID: "org", InstallationID: "install"}, InstallationPrivateKey: private, Now: func() time.Time { return now }}
	p, err := c.Begin(context.Background(), "approve", "m-1", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(p.URL)
	if err != nil {
		t.Fatal(err)
	}
	if u.Path != "/v1/authority/actor/mandate-consent" || u.Query().Get("packet") == "" {
		t.Fatalf("browser URL: %s", p.URL)
	}
	if _, err := c.Begin(context.Background(), "execute", "m-1", p.Digest); err == nil {
		t.Fatal("invalid operation accepted")
	}
}
