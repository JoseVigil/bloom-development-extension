package authority

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRegisterInstallationStatusContract(t *testing.T) {
	identity := &LocalIdentity{InstallationID: "123e4567-e89b-42d3-a456-426614174000", PublicKey: make(ed25519.PublicKey, 32)}
	for _, tc := range []struct {
		name    string
		status  int
		body    string
		wantErr bool
	}{{"created", 201, `{"status":"registered"}`, false}, {"idempotent conflict", 409, `{"error":"installation_conflict"}`, false}, {"unauthorized", 401, `{"error":"invalid_service_token"}`, true}} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/v1/authority/installations/register" || r.URL.Query().Get("org") != "org" || r.Header.Get("Authorization") != "Bearer token" {
					t.Error("wrong registration request")
				}
				var body map[string]string
				_ = json.NewDecoder(r.Body).Decode(&body)
				if body["installation_id"] != identity.InstallationID || body["public_key_raw"] != base64.StdEncoding.EncodeToString(identity.PublicKey) {
					t.Error("wrong registration body")
				}
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()
			err := RegisterInstallation(context.Background(), server.URL, "token", "org", identity, server.Client())
			if (err != nil) != tc.wantErr {
				t.Fatalf("err=%v", err)
			}
		})
	}
}
