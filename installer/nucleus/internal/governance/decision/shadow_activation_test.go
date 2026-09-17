package decision

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeLocalLegacyFixture(t *testing.T, nucleusRoot, ownerID string) {
	t.Helper()
	ownership := `{"org_id":"org","owner_id":"` + ownerID + `","owner_name":"Owner","created_at":"` + time.Now().UTC().Format(time.RFC3339Nano) + `","signed_hash":"","team_members":[]}`
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".ownership.json"), []byte(ownership), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".master"), []byte("master"), 0600); err != nil {
		t.Fatal(err)
	}
}

func TestShadowDecisionRequestUsesOwnershipOwnerAsPrincipal(t *testing.T) {
	nucleusRoot := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", nucleusRoot)
	writeLocalLegacyFixture(t, nucleusRoot, "owner-x")

	orgID := "org-a"
	version := uint64(3)
	request := shadowDecisionRequest(OpCreateProject, "proj-1", &orgID, &version)

	if request.Operation != string(OpCreateProject) {
		t.Fatalf("operation = %q", request.Operation)
	}
	if request.PrincipalID == "" {
		t.Fatal("expected a non-empty PrincipalID from .ownership.json")
	}
	// .ownership.json legado (pre-migración canónica) no tiene Organization.CanonicalID
	// reconciliado todavía — Scope debe quedar vacío, nunca caer de vuelta al org_<timestamp>
	// local (orgID/parentID), que nunca coincide con state.Binding.OrganizationID. Ver
	// Propuesta_Diseno_Correccion_ScopeID_CreateProject_InstallShadow_v0_1.md.
	if request.Scope.Type != "" || request.Scope.ID != "" {
		t.Fatalf("expected empty Scope without a reconciled CanonicalID, got %+v", request.Scope)
	}
}

// writeCanonicalOwnershipFixture escribe un .ownership.json ya en forma canónica, con
// Organization.CanonicalID poblado — el estado que deja ReconcileCanonicalOrganization tras
// un "nucleus authority sync" exitoso (Sovereign Tenant Fase 5). A diferencia de
// writeLocalLegacyFixture, que escribe la forma legada pre-migración.
func writeCanonicalOwnershipFixture(t *testing.T, nucleusRoot, ownerID, canonicalID string) {
	t.Helper()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	doc := `{"schema":"bloom.organization.ownership","schema_version":"1.0","authority_mode":"local_legacy",` +
		`"organization":{"canonical_id":"` + canonicalID + `","legacy_org_id":null,"legacy_locator":null,"slug":null,"display_name":null,"tenant_id":null},` +
		`"installation":{"installation_id":"installation-x"},` +
		`"binding":{"state":"UNBOUND","issuer_id":null,"accepted_at":null,"remote_locked_at":null},` +
		`"trust_binding":null,` +
		`"legacy_authority":{"owner":{"source":"github_handle","subject":"` + ownerID + `","display_name":null},"team_members":[],"effective_markers":[]},` +
		`"migration":null,"created_at":"` + now + `","updated_at":"` + now + `"}`
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".ownership.json"), []byte(doc), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nucleusRoot, ".master"), []byte("master"), 0600); err != nil {
		t.Fatal(err)
	}
}

func TestShadowDecisionRequestScopeUsesReconciledCanonicalID(t *testing.T) {
	nucleusRoot := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", nucleusRoot)
	writeCanonicalOwnershipFixture(t, nucleusRoot, "owner-x", "org-canonical-xyz")

	// parentID es intencionalmente distinto de canonicalID — es el org_<timestamp> local que
	// authorizeGravityNodeCreationLocal usa para la estructura del árbol de Gravity, nunca lo
	// que Scope.ID debe llevar.
	parentID := "org_1700000000"
	version := uint64(1)
	request := shadowDecisionRequest(OpCreateProject, "proj-1", &parentID, &version)

	if request.Scope.Type != "organization" || request.Scope.ID != "org-canonical-xyz" {
		t.Fatalf("expected Scope.ID from reconciled CanonicalID, got %+v", request.Scope)
	}
}

func TestShadowDecisionRequestScopeEmptyForCreateOrganization(t *testing.T) {
	nucleusRoot := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", nucleusRoot)
	writeCanonicalOwnershipFixture(t, nucleusRoot, "owner-x", "org-canonical-xyz")

	request := shadowDecisionRequest(OpCreateOrganization, "org-node-1", nil, nil)
	if request.Scope.Type != "" || request.Scope.ID != "" {
		t.Fatalf("create_organization must never get a Scope — see Investigacion_Reapertura_CreateOrganization_Post_Reconciliacion_v0_1.md, got %+v", request.Scope)
	}
}

func TestShadowDecisionRequestDegradesWithoutOwnership(t *testing.T) {
	nucleusRoot := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", nucleusRoot)
	// Sin .ownership.json ni .master: debe degradar a PrincipalID vacío, no reventar.

	request := shadowDecisionRequest(OpCreateProject, "proj-1", nil, nil)
	if request.PrincipalID != "" {
		t.Fatalf("expected empty PrincipalID without ownership fixture, got %q", request.PrincipalID)
	}
}

func TestDefaultShadowConfigurationConnectedReflectsFilePresence(t *testing.T) {
	dir := t.TempDir()
	cfg := DefaultShadowConfiguration(dir)
	if cfg.Connected {
		t.Fatal("expected Connected=false when state/checkpoint are absent")
	}

	authorityDir := filepath.Join(dir, "authority")
	if err := os.MkdirAll(authorityDir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(authorityDir, "state.json"), []byte("{}"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(authorityDir, "checkpoint.json"), []byte("{}"), 0600); err != nil {
		t.Fatal(err)
	}
	cfg = DefaultShadowConfiguration(dir)
	if !cfg.Connected {
		t.Fatal("expected Connected=true once state/checkpoint exist")
	}
	if cfg.Sink == nil || cfg.Evaluator == nil || cfg.Request == nil {
		t.Fatal("expected Evaluator/Sink/Request to be wired")
	}
}
