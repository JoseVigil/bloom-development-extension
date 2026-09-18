package authority

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestClaimProjectSignsPathAndValidatesResponse(t *testing.T) {
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	id := "11111111-1111-4111-8111-111111111111"
	now := time.Date(2026, 9, 17, 12, 0, 0, 0, time.UTC)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "PUT" || r.URL.Path != "/v1/authority/projects/"+id+"/claim" || r.URL.Query().Get("org") != "org" || r.Header.Get("X-Bloom-Signature") == "" {
			t.Errorf("bad request: %s %s", r.Method, r.URL.String())
		}
		w.WriteHeader(201)
		_ = json.NewEncoder(w).Encode(ProjectClaim{Status: ProjectClaimed, OrganizationID: "org", TenantID: "tenant", ProjectID: id, Revision: "1", SourceRef: "installation:installation", EvidenceKind: "canonical", ClaimedAt: now})
	}))
	defer server.Close()
	c := &SyncClient{BaseURL: server.URL, Binding: Binding{OrganizationID: "org", InstallationID: "installation"}, InstallationPrivateKey: priv, Now: func() time.Time { return now }}
	claim, err := c.ClaimProject(context.Background(), id)
	if err != nil || claim.Status != ProjectClaimed {
		t.Fatalf("claim=%+v err=%v", claim, err)
	}
}
func TestClaimProjectRejectsContradictionAndClassifiesConflict(t *testing.T) {
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	id := "11111111-1111-4111-8111-111111111111"
	for _, tc := range []struct {
		name   string
		status int
		body   string
		code   string
	}{{"conflict", 409, `{}`, "project_claim_conflict"}, {"wrong project", 201, `{"status":"claimed","organizationId":"org","tenantId":"tenant","projectId":"22222222-2222-4222-8222-222222222222","revision":"1","sourceRef":"installation:installation","evidenceKind":"canonical","claimedAt":"2026-09-17T12:00:00Z"}`, "contradictory"}} {
		t.Run(tc.name, func(t *testing.T) {
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer s.Close()
			c := &SyncClient{BaseURL: s.URL, Binding: Binding{OrganizationID: "org", InstallationID: "installation"}, InstallationPrivateKey: priv}
			_, err := c.ClaimProject(context.Background(), id)
			if err == nil || !strings.Contains(err.Error(), tc.code) {
				t.Fatalf("expected %s, got %v", tc.code, err)
			}
		})
	}
}

func TestClaimProjectReplayAcceptsOriginalInstallationSource(t *testing.T) {
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	id := "11111111-1111-4111-8111-111111111111"
	now := time.Now().UTC()
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(ProjectClaim{Status: ProjectAlreadyClaimed, OrganizationID: "org", TenantID: "tenant", ProjectID: id, Revision: "1", SourceRef: "installation:original", EvidenceKind: "canonical", ClaimedAt: now.Add(-time.Hour)})
	}))
	defer s.Close()
	c := &SyncClient{BaseURL: s.URL, Binding: Binding{OrganizationID: "org", InstallationID: "second"}, InstallationPrivateKey: priv, Now: func() time.Time { return now }}
	if _, err := c.ClaimProject(context.Background(), id); err != nil {
		t.Fatal(err)
	}
}

func TestGetProjectBindingStrictValidationAndErrors(t *testing.T) {
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	id := "11111111-1111-4111-8111-111111111111"
	now := time.Date(2026, 9, 18, 1, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name   string
		status int
		body   string
		want   string
	}{
		{"valid", 200, `{"status":"bound","organizationId":"org","tenantId":"tenant","projectId":"11111111-1111-4111-8111-111111111111","revision":"1","sourceRef":"installation:original","evidenceKind":"canonical","claimedAt":"2026-09-17T00:00:00Z","validUntil":"2026-09-19T00:00:00Z","checkedAt":"2026-09-18T01:00:00Z"}`, ""},
		{"expired", 410, `{"error":"project_binding_expired"}`, "project_binding_expired"},
		{"revoked", 410, `{"error":"project_binding_revoked"}`, "project_binding_revoked"},
		{"duplicate", 200, `{"status":"bound","status":"bound"}`, "project_binding_conflict"},
		{"unknown", 200, `{"status":"bound","unknown":true}`, "project_binding_conflict"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != "GET" || r.URL.Path != "/v1/authority/projects/"+id+"/binding" || r.URL.Query().Get("org") != "org" {
					t.Errorf("wrong signed request %s", r.URL)
				}
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer s.Close()
			c := &SyncClient{BaseURL: s.URL, Binding: Binding{OrganizationID: "org", InstallationID: "second"}, InstallationPrivateKey: priv, Now: func() time.Time { return now }}
			_, err := c.GetProjectBinding(context.Background(), id)
			if tc.want == "" && err != nil {
				t.Fatal(err)
			}
			if tc.want != "" && (err == nil || !strings.Contains(err.Error(), tc.want)) {
				t.Fatalf("want %s got %v", tc.want, err)
			}
		})
	}
}
