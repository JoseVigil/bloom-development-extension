package governance

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"nucleus/internal/authority"
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

// Sovereign Tenant Fase 5 — Validate() endurecido (Encargo_Implementacion_
// Endurecimiento_Validacion_TenantID_v1_0.md, decisión de Jose 2026-09-16): el
// primer bind de una instalación legada sin tenantID (endpoint de tenant aún
// no desplegado, o sync corrido antes de que exista) debe fallar — no puede
// persistir un documento BOUND sin tenant, sin excepción ni modo de gracia. El
// documento debe quedar en su estado previo (UNBOUND, el que
// migrateOwnershipLocked ya había persistido antes de intentar la
// reconciliación), nunca en BOUND.
func TestReconcileCanonicalOrganizationFailsFirstBindWithoutTenant(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".ownership.json")
	raw := []byte(`{"org_id":"org_legacy_local","owner_id":"jose","created_at":"2026-09-04T10:00:00Z","team_members":[]}`)
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	nucleusRoot := filepath.Dir(path)
	acceptedAt := time.Date(2026, 9, 16, 12, 0, 0, 0, time.UTC)

	if err := ReconcileCanonicalOrganization(nucleusRoot, "org-real", "installation-1", "issuer-1", "root-key", "root-fingerprint", nil, acceptedAt); err == nil {
		t.Fatal("primer bind sin tenantID aceptado")
	}
	document, err := LoadCanonicalOwnership(path)
	if err != nil {
		t.Fatal(err)
	}
	if document.Binding.State == ownershipcontract.BindingStateBound {
		t.Fatalf("binding state=%v tras fallo, no debería quedar BOUND sin tenant", document.Binding.State)
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

func TestCutoverRemoteEnforcedIsExplicitAtomicAndIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".ownership.json")
	if err := os.WriteFile(path, []byte(`{"org_id":"legacy","owner_id":"jose","created_at":"2026-09-04T10:00:00Z","team_members":[]}`), 0600); err != nil {
		t.Fatal(err)
	}
	root := filepath.Dir(path)
	tenant := "tenant"
	at := time.Date(2026, 9, 17, 12, 0, 0, 0, time.UTC)
	if err := ReconcileCanonicalOrganization(root, "org", "installation", "issuer", "root", "fingerprint", &tenant, at); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(path)
	state := &authority.DurableState{Binding: authority.Binding{OrganizationID: "org", Issuer: "issuer"}, Monotonic: authority.MonotonicState{HighWaterMark: "1", StateDigest: "digest"}, Emission: &authority.EmissionMetadata{OrganizationID: "org", Issuer: "issuer", AuthorityVersion: "1", NotBefore: at.Add(-time.Hour), ExpiresAt: at.Add(time.Hour)}, Projection: authority.FullContent{
		Principals:      []authority.Principal{{PrincipalID: "principal", Status: "active", ExternalIdentities: []authority.ExternalIdentity{{Subject: "jose", Status: "verified", VerifiedAt: at.Add(-time.Hour)}}}},
		Memberships:     []authority.Membership{{MembershipID: "membership", PrincipalID: "principal", OrganizationID: "org", Status: "active", ValidFrom: at.Add(-time.Hour), AcceptedAt: at.Add(-time.Hour)}},
		RoleAssignments: []authority.RoleAssignment{{AssignmentID: "assignment", MembershipID: "membership", RoleID: "master", RoleVersion: "1", Scope: authority.Scope{Type: "organization", ID: "org"}, Status: "active", ValidFrom: at.Add(-time.Hour), AcceptedAt: at.Add(-time.Hour)}},
		RoleDefinitions: []authority.RoleDefinition{{RoleID: "master", RoleVersion: "1", RoleOrigin: "builtin", Status: "active", Permissions: authority.BuiltinRoles[authority.RoleMaster]}},
	}}
	bad := RemoteEnforcedCutoverEvidence{OrganizationID: "org", TenantID: "tenant", IssuerID: "issuer", TrustAnchorID: "root", TrustAnchorFingerprint: "fingerprint", AuthorityVersion: "1", StateDigest: "digest", CheckpointHighWaterMark: "1", CheckpointStateDigest: "digest", PrincipalID: "principal", Snapshot: state, SnapshotExpiresAt: at.Add(time.Hour), RequiredProjectIDs: []string{"project"}}
	if err := CutoverRemoteEnforced(root, bad, at); err == nil {
		t.Fatal("cutover without project confirmation accepted")
	}
	after, _ := os.ReadFile(path)
	if string(before) != string(after) {
		t.Fatal("failed cutover changed ownership")
	}
	good := bad
	good.ProjectBindings = []authority.ProjectBinding{{Status: "bound", OrganizationID: "org", TenantID: "tenant", ProjectID: "project", Revision: "1", SourceRef: "installation:origin", EvidenceKind: "canonical", ClaimedAt: at.Add(-time.Hour), CheckedAt: at, ValidUntil: at.Add(time.Hour)}}
	if err := CutoverRemoteEnforced(root, good, at); err != nil {
		t.Fatal(err)
	}
	doc, err := LoadCanonicalOwnership(path)
	if err != nil {
		t.Fatal(err)
	}
	if doc.AuthorityMode != ownershipcontract.AuthorityModeRemoteEnforced || doc.Binding.State != ownershipcontract.BindingStateRemoteLocked || doc.LegacyAuthority != nil {
		t.Fatalf("invalid cutover: %+v", doc)
	}
	persisted, _ := os.ReadFile(path)
	if err := CutoverRemoteEnforced(root, good, at.Add(30*time.Minute)); err != nil {
		t.Fatal(err)
	}
	again, _ := os.ReadFile(path)
	if string(persisted) != string(again) {
		t.Fatal("idempotent cutover rewrote ownership")
	}
}

func TestCutoverRejectsConcreteEvidenceMismatchWithoutWriting(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".ownership.json")
	if err := os.WriteFile(path, []byte(`{"org_id":"legacy","owner_id":"jose","created_at":"2026-09-04T10:00:00Z","team_members":[]}`), 0600); err != nil {
		t.Fatal(err)
	}
	root, tenant, at := filepath.Dir(path), "tenant", time.Date(2026, 9, 17, 12, 0, 0, 0, time.UTC)
	if err := ReconcileCanonicalOrganization(root, "org", "installation", "issuer", "root", "fingerprint", &tenant, at); err != nil {
		t.Fatal(err)
	}
	state := &authority.DurableState{Binding: authority.Binding{OrganizationID: "org", Issuer: "issuer"}, Monotonic: authority.MonotonicState{HighWaterMark: "1", StateDigest: "digest"}, Emission: &authority.EmissionMetadata{OrganizationID: "org", Issuer: "issuer", AuthorityVersion: "1", NotBefore: at.Add(-time.Hour), ExpiresAt: at.Add(time.Hour)}, Projection: authority.FullContent{Principals: []authority.Principal{{PrincipalID: "principal", Status: "active", ExternalIdentities: []authority.ExternalIdentity{{Subject: "jose", Status: "verified", VerifiedAt: at.Add(-time.Hour)}}}}, Memberships: []authority.Membership{{MembershipID: "m", PrincipalID: "principal", OrganizationID: "org", Status: "active", ValidFrom: at.Add(-time.Hour), AcceptedAt: at.Add(-time.Hour)}}, RoleAssignments: []authority.RoleAssignment{{AssignmentID: "a", MembershipID: "m", RoleID: "master", RoleVersion: "1", Scope: authority.Scope{Type: "organization", ID: "org"}, Status: "active", ValidFrom: at.Add(-time.Hour), AcceptedAt: at.Add(-time.Hour)}}, RoleDefinitions: []authority.RoleDefinition{{RoleID: "master", RoleVersion: "1", RoleOrigin: "builtin", Status: "active", Permissions: authority.BuiltinRoles[authority.RoleMaster]}}}}
	base := RemoteEnforcedCutoverEvidence{OrganizationID: "org", TenantID: "tenant", IssuerID: "issuer", TrustAnchorID: "root", TrustAnchorFingerprint: "fingerprint", AuthorityVersion: "1", StateDigest: "digest", CheckpointHighWaterMark: "1", CheckpointStateDigest: "digest", PrincipalID: "principal", Snapshot: state, SnapshotExpiresAt: at.Add(time.Hour), RequiredProjectIDs: []string{"project"}, ProjectBindings: []authority.ProjectBinding{{Status: "bound", OrganizationID: "org", TenantID: "tenant", ProjectID: "project", Revision: "1", SourceRef: "installation:origin", EvidenceKind: "canonical", ClaimedAt: at.Add(-time.Hour), CheckedAt: at, ValidUntil: at.Add(time.Hour)}}}
	for _, mutate := range []func(*RemoteEnforcedCutoverEvidence){
		func(e *RemoteEnforcedCutoverEvidence) { e.CheckpointStateDigest = "other" },
		func(e *RemoteEnforcedCutoverEvidence) { e.ProjectBindings[0].CheckedAt = at.Add(time.Second) },
		func(e *RemoteEnforcedCutoverEvidence) { e.ProjectBindings = nil },
	} {
		e := base
		e.ProjectBindings = append([]authority.ProjectBinding(nil), base.ProjectBindings...)
		mutate(&e)
		before, _ := os.ReadFile(path)
		if err := CutoverRemoteEnforced(root, e, at); err == nil {
			t.Fatal("inconsistent evidence accepted")
		}
		after, _ := os.ReadFile(path)
		if string(before) != string(after) {
			t.Fatal("failed cutover changed ownership")
		}
	}
}
