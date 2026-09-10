package authority

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestFetchAndVerifyTrustManifestUsesSignedInstallationRequest(t *testing.T) {
	rootPublic, rootPrivate, _ := ed25519.GenerateKey(rand.Reader)
	issuerPublic, _, _ := ed25519.GenerateKey(rand.Reader)
	_, installationPrivate, _ := ed25519.GenerateKey(rand.Reader)
	now := time.Date(2026, 9, 10, 12, 0, 0, 0, time.UTC)
	payload := TrustManifestPayload{Schema: "bloom.authority.trust-manifest", SchemaVersion: "1.0", ManifestID: "manifest", Issuer: "issuer", OrganizationID: "org", ManifestVersion: "1", IssuedAt: now.Add(-time.Minute), NotBefore: now.Add(-time.Minute), ExpiresAt: now.Add(time.Hour), RootKeyID: "root", Keys: []TrustKey{{KeyID: "issuer-key", PublicKey: base64.RawURLEncoding.EncodeToString(issuerPublic), Status: "active", ValidFrom: now.Add(-time.Hour)}}}
	payloadRaw, _ := json.Marshal(payload)
	canonical, _ := Canonicalize(payloadRaw)
	digest := sha256.Sum256(canonical)
	signature := ed25519.Sign(rootPrivate, append(append([]byte(trustManifestDomain), 0), canonical...))
	envelope, _ := json.Marshal(Envelope{Payload: payloadRaw, Integrity: Integrity{Canonicalization: "JCS-RFC8785", DigestAlgorithm: "SHA-256", Digest: base64.RawURLEncoding.EncodeToString(digest[:]), SignatureAlgorithm: "Ed25519", KeyID: "root", Signature: base64.RawURLEncoding.EncodeToString(signature)}})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/authority/trust-manifest" || r.URL.Query().Get("org") != "org" || r.Header.Get("X-Bloom-Installation-Id") != "installation" || r.Header.Get("X-Bloom-Signature") == "" {
			t.Error("unsigned or misbound request")
		}
		_, _ = w.Write(envelope)
	}))
	defer server.Close()
	manifest, trust, err := FetchAndVerifyTrustManifest(context.Background(), server.URL, Binding{OrganizationID: "org", InstallationID: "installation"}, installationPrivate, map[string]ed25519.PublicKey{"root": rootPublic}, server.Client(), now)
	if err != nil {
		t.Fatal(err)
	}
	if manifest.Payload.Issuer != "issuer" || len(trust["issuer"]["issuer-key"]) != ed25519.PublicKeySize {
		t.Fatal("verified trust not returned")
	}
}
