package authority

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func capabilityIdentity(t *testing.T) *LocalIdentity {
	t.Helper()
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return &LocalIdentity{InstallationID: "123e4567-e89b-42d3-a456-426614174000", PublicKey: public, PrivateKey: private}
}

func capabilityDeclaration(identity *LocalIdentity, revision string, versions []string, now time.Time) map[string]any {
	return map[string]any{"organizationId": "org", "installationId": identity.InstallationID, "revision": revision, "supportedAuthoritySchemaVersions": versions, "source": "signed_update", "declaredAt": now.Format(time.RFC3339Nano)}
}

func verifyCapabilityUpdateSignature(t *testing.T, request installationCapabilityUpdate, public ed25519.PublicKey) {
	t.Helper()
	payload := struct {
		OrganizationID                   string   `json:"organization_id"`
		InstallationID                   string   `json:"installation_id"`
		RequestID                        string   `json:"request_id"`
		ExpectedRevision                 string   `json:"expected_revision"`
		SupportedAuthoritySchemaVersions []string `json:"supported_authority_schema_versions"`
		Timestamp                        string   `json:"timestamp"`
	}{request.OrganizationID, request.InstallationID, request.RequestID, request.ExpectedRevision, request.SupportedAuthoritySchemaVersions, request.Timestamp}
	raw, _ := json.Marshal(payload)
	canonical, err := Canonicalize(raw)
	if err != nil {
		t.Fatal(err)
	}
	signature, err := base64.StdEncoding.DecodeString(request.Signature)
	if err != nil || !ed25519.Verify(public, append(append([]byte(installationCapabilityDomain), 0), canonical...), signature) {
		t.Fatal("invalid capability update signature")
	}
}

func TestInstallationCapabilityAlreadyCompatibleDoesNotPut(t *testing.T) {
	identity := capabilityIdentity(t)
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	puts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Bloom-Installation-Id") != identity.InstallationID || r.Header.Get("X-Bloom-Signature") == "" || r.URL.Query().Get("org") != "org" {
			t.Error("missing authenticated installation binding")
		}
		if r.Method == http.MethodPut {
			puts++
		}
		_ = json.NewEncoder(w).Encode(capabilityDeclaration(identity, "4", []string{"1.0", "1.1"}, now))
	}))
	declaration, err := (&InstallationCapabilityClient{BaseURL: server.URL, OrganizationID: "org", Identity: identity, HTTP: server.Client(), Now: func() time.Time { return now }}).Ensure11(context.Background())
	server.Close()
	if err != nil || declaration.Revision != "4" || puts != 0 {
		t.Fatalf("declaration=%+v puts=%d err=%v", declaration, puts, err)
	}
}

func TestInstallationCapabilityBackfillAndBootstrapPublish11(t *testing.T) {
	for _, tc := range []struct {
		name, initialRevision string
		missingHead           bool
	}{
		{"backfilled", "1", false}, {"bootstrap", "0", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			identity := capabilityIdentity(t)
			now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
			revision, compatible, puts := tc.initialRevision, false, 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == http.MethodGet {
					if tc.missingHead && revision == "0" {
						w.WriteHeader(http.StatusNotFound)
						_, _ = w.Write([]byte(`{"error":"authority_installation_capability_unavailable","bootstrapExpectedRevision":"0"}`))
						return
					}
					versions := []string{"1.0"}
					if compatible {
						versions = []string{"1.0", "1.1"}
					}
					_ = json.NewEncoder(w).Encode(capabilityDeclaration(identity, revision, versions, now))
					return
				}
				puts++
				var body installationCapabilityUpdate
				_ = json.NewDecoder(r.Body).Decode(&body)
				verifyCapabilityUpdateSignature(t, body, identity.PublicKey)
				if body.ExpectedRevision != revision {
					t.Errorf("expectedRevision=%s want=%s", body.ExpectedRevision, revision)
				}
				compatible = true
				if revision == "0" {
					revision = "1"
				} else {
					revision = "2"
				}
				_ = json.NewEncoder(w).Encode(installationCapabilityUpdateResponse{identity.InstallationID, revision, []string{"1.0", "1.1"}})
			}))
			declaration, err := (&InstallationCapabilityClient{BaseURL: server.URL, OrganizationID: "org", Identity: identity, HTTP: server.Client(), Now: func() time.Time { return now }}).Ensure11(context.Background())
			server.Close()
			if err != nil || declaration == nil || !supportsAuthority11(declaration.SupportedAuthoritySchemaVersions) || puts != 1 {
				t.Fatalf("declaration=%+v puts=%d err=%v", declaration, puts, err)
			}
		})
	}
}

func TestInstallationCapabilityCASConflictConvergesWithOneRetry(t *testing.T) {
	identity := capabilityIdentity(t)
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	var mutex sync.Mutex
	revision, puts, gets := "1", 0, 0
	compatible := false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mutex.Lock()
		defer mutex.Unlock()
		if r.Method == http.MethodGet {
			gets++
			versions := []string{"1.0"}
			if compatible {
				versions = []string{"1.0", "1.1"}
			}
			_ = json.NewEncoder(w).Encode(capabilityDeclaration(identity, revision, versions, now))
			return
		}
		puts++
		var body installationCapabilityUpdate
		_ = json.NewDecoder(r.Body).Decode(&body)
		verifyCapabilityUpdateSignature(t, body, identity.PublicKey)
		if puts == 1 {
			revision = "2"
			w.WriteHeader(http.StatusConflict)
			_, _ = w.Write([]byte(`{"error":"authority_installation_capability_revision_conflict"}`))
			return
		}
		if body.ExpectedRevision != "2" {
			t.Errorf("retry expectedRevision=%s", body.ExpectedRevision)
		}
		revision, compatible = "3", true
		_ = json.NewEncoder(w).Encode(installationCapabilityUpdateResponse{identity.InstallationID, revision, []string{"1.0", "1.1"}})
	}))
	declaration, err := (&InstallationCapabilityClient{BaseURL: server.URL, OrganizationID: "org", Identity: identity, HTTP: server.Client(), Now: func() time.Time { return now }}).Ensure11(context.Background())
	server.Close()
	if err != nil || declaration.Revision != "3" || puts != 2 || gets != 3 {
		t.Fatalf("declaration=%+v puts=%d gets=%d err=%v", declaration, puts, gets, err)
	}
}

func TestInstallationCapabilityMalformedAndSignatureErrorsFailClosed(t *testing.T) {
	identity := capabilityIdentity(t)
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name string
		code int
		body string
	}{
		{"malformed get", http.StatusOK, `{"organizationId":"org"}`},
		{"signature rejected", http.StatusForbidden, `{"error":"authority_installation_capability_invalid_signature"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.code)
				_, _ = w.Write([]byte(tc.body))
			}))
			_, err := (&InstallationCapabilityClient{BaseURL: server.URL, OrganizationID: "org", Identity: identity, HTTP: server.Client(), Now: func() time.Time { return now }}).Ensure11(context.Background())
			server.Close()
			if err == nil {
				t.Fatal("invalid capability response accepted")
			}
		})
	}
}

func TestInstallationCapabilityMalformedPutFailsClosed(t *testing.T) {
	identity := capabilityIdentity(t)
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	gets, puts := 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			gets++
			_ = json.NewEncoder(w).Encode(capabilityDeclaration(identity, "1", []string{"1.0"}, now))
			return
		}
		puts++
		_, _ = w.Write([]byte(`{"installationId":"wrong","revision":"2","supportedAuthoritySchemaVersions":["1.0","1.1"]}`))
	}))
	_, err := (&InstallationCapabilityClient{BaseURL: server.URL, OrganizationID: "org", Identity: identity, HTTP: server.Client(), Now: func() time.Time { return now }}).Ensure11(context.Background())
	server.Close()
	if err == nil || gets != 1 || puts != 1 {
		t.Fatalf("malformed PUT was not fail-closed: gets=%d puts=%d err=%v", gets, puts, err)
	}
}
