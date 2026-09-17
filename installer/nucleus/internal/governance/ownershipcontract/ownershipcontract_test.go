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
	// Sovereign Tenant Fase 5 endurecido: Validate() exige TenantID no vacío para
	// todo documento BOUND/REMOTE_LOCKED — sin esto, este doc REMOTE_LOCKED sería
	// rechazado antes de llegar al corte de legacy authority que el test ejercita.
	tenantID := "tenant-test"
	doc.Organization.TenantID = &tenantID
	doc.Binding.IssuerID = &issuer
	doc.Binding.AcceptedAt = &now
	doc.Binding.RemoteLockedAt = &now
	doc.TrustBinding = &TrustBinding{IssuerID: issuer, TrustAnchorID: "root", TrustAnchorFingerprintSHA256: "digest", BoundOrganizationID: canonicalID, BoundInstallationID: doc.Installation.InstallationID, AcceptedAt: now}
	if _, err := EffectiveLegacyView(Analysis{Source: SourceCanonical, Canonical: doc}); !errors.Is(err, ErrLegacyAuthorityForbidden) {
		t.Fatalf("remote legacy authority not rejected: %v", err)
	}
}

// Sovereign Tenant Fase 5 — endurecido por decisión de Jose (2026-09-16,
// Propuesta_Secuenciacion_Endurecimiento_Validacion_TenantID_v0_1.md,
// Encargo_Implementacion_Endurecimiento_Validacion_TenantID_v1_0.md): TenantID
// deja de ser puramente aditivo. Un documento BOUND o REMOTE_LOCKED sin
// TenantID (nil o cadena vacía) ahora es rechazado por Validate() — sin
// excepción ni modo de gracia. Sólo un TenantID válido y no vacío permite que
// el documento sea aceptado.
func TestValidateRequiresTenantIDForBoundDocument(t *testing.T) {
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
	if err := Validate(build(nil)); err == nil {
		t.Fatal("BOUND without TenantID accepted")
	}
	empty := ""
	if err := Validate(build(&empty)); err == nil {
		t.Fatal("BOUND with empty TenantID accepted")
	}
	tenantID := "tenant-1"
	if err := Validate(build(&tenantID)); err != nil {
		t.Fatalf("BOUND with valid TenantID rejected: %v", err)
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
