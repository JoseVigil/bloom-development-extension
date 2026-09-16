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
	if request.Scope.Type != "organization" || request.Scope.ID != orgID {
		t.Fatalf("unexpected scope: %+v", request.Scope)
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
