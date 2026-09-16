package authority

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// Fix companion, Sovereign Tenant Fase 5 (Cierre_Implementacion_Endpoint_TenantSelf_v1_0.md,
// 2026-09-16): FetchOrganizationTenantID debe firmar la request con la identidad de
// instalación (X-Bloom-Installation-Id/-Timestamp/-Signature) y mandar ?org= explícito
// — no un Bearer estático. Este test hubiera atrapado el bug original: el fake server
// rechaza la request si falta cualquiera de las dos cosas.
func TestFetchOrganizationTenantIDUsesSignedInstallationRequest(t *testing.T) {
	_, installationPrivate, _ := ed25519.GenerateKey(rand.Reader)
	now := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)
	tenantID := "tenant-xyz"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/authority/tenant/self" || r.URL.Query().Get("org") != "org" ||
			r.Header.Get("X-Bloom-Installation-Id") != "installation" || r.Header.Get("X-Bloom-Signature") == "" ||
			r.Header.Get("X-Bloom-Timestamp") == "" {
			t.Error("unsigned or misbound request")
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"tenantId": tenantID})
	}))
	defer server.Close()

	binding := Binding{OrganizationID: "org", InstallationID: "installation"}
	got, err := FetchOrganizationTenantID(context.Background(), server.URL, "/v1/authority/tenant/self", binding, installationPrivate, server.Client(), now)
	if err != nil {
		t.Fatal(err)
	}
	if got == nil || *got != tenantID {
		t.Fatalf("tenantId inesperado: %+v", got)
	}
}

// La respuesta { "tenantId": null } es válida (organización sin tenant conocido
// todavía) — no es un error, debe propagarse como (nil, nil).
func TestFetchOrganizationTenantIDTreatsNullTenantAsNoError(t *testing.T) {
	_, installationPrivate, _ := ed25519.GenerateKey(rand.Reader)
	now := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"tenantId": nil})
	}))
	defer server.Close()

	binding := Binding{OrganizationID: "org", InstallationID: "installation"}
	got, err := FetchOrganizationTenantID(context.Background(), server.URL, "/v1/authority/tenant/self", binding, installationPrivate, server.Client(), now)
	if err != nil {
		t.Fatalf("tenantId null tratado como error: %v", err)
	}
	if got != nil {
		t.Fatalf("esperaba tenantId nil, obtuve %+v", *got)
	}
}
