package governance

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"nucleus/internal/governance/ownershipcontract"
)

func TestReconcileCanonicalOrganizationBindsFromLegacyAndIsIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".ownership.json")
	raw := []byte(`{"org_id":"org_legacy_local","owner_id":"jose","created_at":"2026-09-04T10:00:00Z","team_members":[]}`)
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	nucleusRoot := filepath.Dir(path)
	tenant := "tenant-1"
	acceptedAt := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)

	if err := ReconcileCanonicalOrganization(nucleusRoot, "org-real", "installation-1", "issuer-1", "root-key", "root-fingerprint", &tenant, acceptedAt); err != nil {
		t.Fatalf("primera reconciliación falló: %v", err)
	}
	document, err := LoadCanonicalOwnership(path)
	if err != nil {
		t.Fatal(err)
	}
	if document.Binding.State != ownershipcontract.BindingStateBound {
		t.Fatalf("binding state=%v, esperaba BOUND", document.Binding.State)
	}
	if document.Organization.CanonicalID == nil || *document.Organization.CanonicalID != "org-real" {
		t.Fatalf("canonical_id no reconciliado: %+v", document.Organization)
	}
	if document.Organization.TenantID == nil || *document.Organization.TenantID != "tenant-1" {
		t.Fatalf("tenant_id no reconciliado: %+v", document.Organization)
	}
	// TrustBinding.BoundInstallationID no es el installationID que pasamos (ver
	// comentario en ownership_reconciliation.go) — es el Installation.InstallationID
	// que la propia migración ya le había asignado a este documento.
	if document.TrustBinding == nil || document.TrustBinding.BoundInstallationID != document.Installation.InstallationID {
		t.Fatalf("trust binding no coincide con Installation.InstallationID: %+v", document.TrustBinding)
	}

	persisted, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	// Idempotencia: mismos valores, mismo tenant → no reescribe el archivo.
	if err := ReconcileCanonicalOrganization(nucleusRoot, "org-real", "installation-1", "issuer-1", "root-key", "root-fingerprint", &tenant, acceptedAt.Add(time.Hour)); err != nil {
		t.Fatalf("segunda reconciliación (idempotente) falló: %v", err)
	}
	again, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(persisted) != string(again) {
		t.Fatal("reconciliación idempotente reescribió el archivo")
	}

	// tenantID = nil (endpoint de tenant caído): no borra el tenant ya guardado.
	if err := ReconcileCanonicalOrganization(nucleusRoot, "org-real", "installation-1", "issuer-1", "root-key", "root-fingerprint", nil, acceptedAt.Add(2*time.Hour)); err != nil {
		t.Fatalf("reconciliación sin tenant falló: %v", err)
	}
	stillTenant, err := LoadCanonicalOwnership(path)
	if err != nil {
		t.Fatal(err)
	}
	if stillTenant.Organization.TenantID == nil || *stillTenant.Organization.TenantID != "tenant-1" {
		t.Fatalf("tenant_id fue borrado por un lookup caído: %+v", stillTenant.Organization)
	}

	// tenantID distinto al guardado: se sobreescribe sin pasar por DIVERGENT (Fase 5
	// §3.2 — puramente informativo, nada lo consume todavía para gatear una decisión).
	newTenant := "tenant-2"
	if err := ReconcileCanonicalOrganization(nucleusRoot, "org-real", "installation-1", "issuer-1", "root-key", "root-fingerprint", &newTenant, acceptedAt.Add(3*time.Hour)); err != nil {
		t.Fatalf("reconciliación con tenant nuevo falló: %v", err)
	}
	updatedTenant, err := LoadCanonicalOwnership(path)
	if err != nil {
		t.Fatal(err)
	}
	if updatedTenant.Binding.State != ownershipcontract.BindingStateBound {
		t.Fatalf("un cambio de tenant disparó un estado distinto de BOUND: %v", updatedTenant.Binding.State)
	}
	if updatedTenant.Organization.TenantID == nil || *updatedTenant.Organization.TenantID != "tenant-2" {
		t.Fatalf("tenant_id no se actualizó: %+v", updatedTenant.Organization)
	}
}

func TestReconcileCanonicalOrganizationNeverOverwritesSilentlyOnOrganizationChange(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".ownership.json")
	raw := []byte(`{"org_id":"org_legacy_local","owner_id":"jose","created_at":"2026-09-04T10:00:00Z","team_members":[]}`)
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	nucleusRoot := filepath.Dir(path)
	tenant := "tenant-a"
	acceptedAt := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)

	if err := ReconcileCanonicalOrganization(nucleusRoot, "org-a", "installation-1", "issuer-1", "root-key", "root-fingerprint", &tenant, acceptedAt); err != nil {
		t.Fatalf("primera reconciliación falló: %v", err)
	}

	// Misma instalación, organización canónica DISTINTA: nunca pisa en silencio.
	if err := ReconcileCanonicalOrganization(nucleusRoot, "org-b", "installation-1", "issuer-1", "root-key", "root-fingerprint", nil, acceptedAt.Add(time.Hour)); err != nil {
		t.Fatalf("reconciliación divergente falló: %v", err)
	}
	document, err := LoadCanonicalOwnership(path)
	if err != nil {
		t.Fatal(err)
	}
	if document.Binding.State != ownershipcontract.BindingStateDivergent {
		t.Fatalf("binding state=%v, esperaba DIVERGENT", document.Binding.State)
	}
	if document.Organization.CanonicalID == nil || *document.Organization.CanonicalID != "org-a" {
		t.Fatalf("canonical_id fue pisado en silencio: %+v", document.Organization)
	}
	if document.Organization.TenantID == nil || *document.Organization.TenantID != "tenant-a" {
		t.Fatalf("tenant_id fue tocado durante un DIVERGENT: %+v", document.Organization)
	}

	// Repetir la misma organización "nueva" mientras sigue DIVERGENT: no reescribe de
	// nuevo (no hay una segunda escritura por cada sync de rutina mientras nadie
	// resuelve la divergencia a mano).
	persisted, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := ReconcileCanonicalOrganization(nucleusRoot, "org-b", "installation-1", "issuer-1", "root-key", "root-fingerprint", nil, acceptedAt.Add(2*time.Hour)); err != nil {
		t.Fatalf("segunda reconciliación divergente falló: %v", err)
	}
	again, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(persisted) != string(again) {
		t.Fatal("DIVERGENT ya establecido fue reescrito de nuevo")
	}
}
