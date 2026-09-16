package ownershipcontract

import (
	"errors"
	"testing"
	"time"
)

func TestAnalyzeRejectsDuplicateAmbiguousAndContradictoryInputWithoutPanic(t *testing.T) {
	cases := map[string][]byte{
		"duplicate":     []byte(`{"org_id":"a","org_id":"b","owner_id":"jose","created_at":"2026-09-04T10:00:00Z"}`),
		"contradictory": []byte(`{"owner":{"subject":"a"},"owner_id":"b","created_at":"2026-09-04T10:00:00Z"}`),
		"unknown":       []byte(`{"unexpected":true}`),
	}
	for name, raw := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := Analyze(raw); err == nil {
				t.Fatal("invalid ownership accepted")
			}
		})
	}
}

func TestNormalizeAndEffectiveLegacyView(t *testing.T) {
	analysis, err := Analyze([]byte(`{"org_id":"org","owner_id":"jose","created_at":"2026-09-04T10:00:00Z","team_members":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 4, 11, 0, 0, 0, time.UTC)
	doc, err := Normalize(analysis, NormalizationContext{InstallationID: "installation", MigrationID: "migration", SourceDigest: "digest", MigratedAt: now, EffectiveMarkers: []string{"master"}})
	if err != nil {
		t.Fatal(err)
	}
	view, err := EffectiveLegacyView(Analysis{Source: SourceCanonical, Canonical: doc})
	if err != nil {
		t.Fatal(err)
	}
	if view.Owner.Subject != "jose" || !view.MarkersDeclared || len(view.Markers) != 1 || view.Markers[0] != "master" {
		t.Fatalf("unexpected view: %+v", view)
	}
	doc.AuthorityMode = AuthorityModeRemoteEnforced
	doc.Binding.State = BindingStateRemoteLocked
	doc.LegacyAuthority = nil
	canonicalID, issuer := "org-canonical", "issuer"
	doc.Organization.CanonicalID = &canonicalID
	doc.Binding.IssuerID = &issuer
	doc.Binding.AcceptedAt = &now
	doc.Binding.RemoteLockedAt = &now
	doc.TrustBinding = &TrustBinding{IssuerID: issuer, TrustAnchorID: "root", TrustAnchorFingerprintSHA256: "digest", BoundOrganizationID: canonicalID, BoundInstallationID: doc.Installation.InstallationID, AcceptedAt: now}
	if _, err := EffectiveLegacyView(Analysis{Source: SourceCanonical, Canonical: doc}); !errors.Is(err, ErrLegacyAuthorityForbidden) {
		t.Fatalf("remote legacy authority not rejected: %v", err)
	}
}

// Sovereign Tenant Fase 5 — TenantID es puramente aditivo: un documento BOUND
// válido sigue siendo válido con TenantID == nil (endpoint de tenant caído o
// nunca disponible) y con TenantID poblado (sync exitoso). Ninguno de los dos
// casos debe cambiar el resultado de Validate() frente al comportamiento ya
// probado en TestOwnershipModeBindingMatrixAndNoLegacyAfterCutover (paquete
// governance) para el resto de los campos.
func TestValidateAcceptsBoundDocumentWithAndWithoutTenantID(t *testing.T) {
	now := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)
	canonicalID, issuer := "org-canonical", "issuer"
	build := func(tenantID *string) *Document {
		return &Document{
			Schema:          SchemaName,
			SchemaVersion:   SchemaVersion,
			AuthorityMode:   AuthorityModeLocalLegacy,
			Organization:    Organization{CanonicalID: &canonicalID, TenantID: tenantID},
			Installation:    Installation{InstallationID: "installation"},
			Binding:         Binding{State: BindingStateBound, IssuerID: &issuer, AcceptedAt: &now},
			TrustBinding:    &TrustBinding{IssuerID: issuer, TrustAnchorID: "root", TrustAnchorFingerprintSHA256: "digest", BoundOrganizationID: canonicalID, BoundInstallationID: "installation", AcceptedAt: now},
			LegacyAuthority: &LegacyAuthority{Owner: LegacyOwner{Source: "github_handle", Subject: "jose"}, EffectiveMarkers: []string{}},
			CreatedAt:       now,
			UpdatedAt:       now,
		}
	}
	if err := Validate(build(nil)); err != nil {
		t.Fatalf("BOUND without TenantID rejected: %v", err)
	}
	tenantID := "tenant-1"
	if err := Validate(build(&tenantID)); err != nil {
		t.Fatalf("BOUND with TenantID rejected: %v", err)
	}
}

func TestValidateModeBindingMatrix(t *testing.T) {
	legacy := &LegacyAuthority{Owner: LegacyOwner{Source: "github_handle", Subject: "jose"}, EffectiveMarkers: []string{}}
	if err := ValidateModeBinding(AuthorityModeLocalLegacy, Binding{State: BindingStateUnbound}, legacy); err != nil {
		t.Fatal(err)
	}
	if err := ValidateModeBinding(AuthorityModeShadowRemote, Binding{State: BindingStateBound}, legacy); err != nil {
		t.Fatal(err)
	}
	if err := ValidateModeBinding(AuthorityModeRemoteEnforced, Binding{State: BindingStateRemoteLocked}, nil); err != nil {
		t.Fatal(err)
	}
	if err := ValidateModeBinding(AuthorityModeRemoteEnforced, Binding{State: BindingStateRemoteLocked}, legacy); err == nil {
		t.Fatal("remote_enforced accepted legacy authority")
	}
}
