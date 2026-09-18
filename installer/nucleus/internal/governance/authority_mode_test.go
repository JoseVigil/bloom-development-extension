package governance

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestEffectiveAuthorityModeIsLocalLegacy(t *testing.T) {
	validLocalLegacyRoot(t)
	mode, err := EffectiveAuthorityMode()
	if err != nil {
		t.Fatal(err)
	}
	if mode != ModeLocalLegacy {
		t.Fatalf("mode = %q, want %q", mode, ModeLocalLegacy)
	}
}

func TestInstallingShadowCannotChangeEffectiveMode(t *testing.T) {
	validLocalLegacyRoot(t)
	restore := InstallAuthorityShadow(&ShadowConfiguration{})
	defer restore()
	mode, err := EffectiveAuthorityMode()
	if err != nil || mode != ModeLocalLegacy {
		t.Fatalf("shadow changed effective mode: %q %v", mode, err)
	}
}

func TestEffectiveAuthorityModeFailsClosedWhenRootCannotResolve(t *testing.T) {
	t.Setenv("BLOOM_NUCLEUS_ROOT", filepath.Join(t.TempDir(), "missing"))
	if mode, err := EffectiveAuthorityMode(); err == nil || mode != "" {
		t.Fatalf("expected authority_mode_invalid, mode=%q err=%v", mode, err)
	}
	if _, err := AuthorizeGravityNodeCreation(OpCreateOrganization, "org", nil, nil); err == nil {
		t.Fatal("legacy authorization called after mode resolution failure")
	}
}

func TestEffectiveAuthorityModeNeverFallsBackForInvalidOwnership(t *testing.T) {
	for _, tc := range []struct{ name, raw string }{
		{"absent", ""},
		{"invalid json", "{"},
		{"unknown schema", `{"schema":"unknown","schema_version":"1","authority_mode":"local_legacy"}`},
		{"invalid mode binding", `{"schema":"bloom.organization.ownership","schema_version":"1.0","authority_mode":"remote_enforced","organization":{"canonical_id":null,"legacy_org_id":"legacy","legacy_locator":null,"slug":null,"display_name":null,"tenant_id":null},"installation":{"installation_id":"i"},"binding":{"state":"UNBOUND","issuer_id":null,"accepted_at":null,"remote_locked_at":null},"trust_binding":null,"legacy_authority":null,"migration":null,"created_at":"2026-09-18T00:00:00Z","updated_at":"2026-09-18T00:00:00Z"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			t.Setenv("BLOOM_NUCLEUS_ROOT", root)
			if tc.raw != "" {
				writeRegularFile(t, filepath.Join(root, ".ownership.json"), tc.raw)
			}
			if mode, err := EffectiveAuthorityMode(); err == nil || mode != "" {
				t.Fatalf("unexpected fallback: mode=%q err=%v", mode, err)
			}
			if _, err := AuthorizeGravityNodeCreation(OpCreateOrganization, "org", nil, nil); err == nil {
				t.Fatal("legacy path authorized invalid ownership")
			}
		})
	}
}

func TestAuthorizeGravityNodeCreationLocalLegacy(t *testing.T) {
	root := validLocalLegacyRoot(t)
	parent := "org"
	version := uint64(7)
	decision, err := AuthorizeGravityNodeCreation(OpCreateProject, "project", &parent, &version)
	if err != nil {
		t.Fatal(err)
	}
	if decision.Operation() != OpCreateProject || decision.NodeID() != "project" || decision.Basis() != BasisLocalLegacy {
		t.Fatalf("unexpected decision: operation=%q node=%q basis=%q", decision.Operation(), decision.NodeID(), decision.Basis())
	}
	wantRoot, _ := filepath.Abs(filepath.Join(root, ".gravity"))
	if decision.GravityRoot() != wantRoot || decision.DecidedAt().IsZero() {
		t.Fatalf("unexpected root/time: root=%q decidedAt=%v", decision.GravityRoot(), decision.DecidedAt())
	}
	gotParent := decision.ParentID()
	gotVersion := decision.ParentObservedVersion()
	if gotParent == nil || *gotParent != parent || gotVersion == nil || *gotVersion != version {
		t.Fatalf("unexpected parent observation: parent=%v version=%v", gotParent, gotVersion)
	}
	*gotParent = "mutated"
	*gotVersion = 99
	if *decision.ParentID() != parent || *decision.ParentObservedVersion() != version {
		t.Fatal("decision pointer getters exposed mutable internal state")
	}
}

func TestAuthorizeGravityNodeCreationDeniesInvalidLocalLegacyState(t *testing.T) {
	tests := []struct {
		name  string
		setup func(t *testing.T, root string)
	}{
		{"ownership absent", func(t *testing.T, root string) { writeRegularFile(t, filepath.Join(root, ".master"), "master") }},
		{"ownership unreadable", func(t *testing.T, root string) {
			writeRegularFile(t, filepath.Join(root, ".ownership.json"), "{")
			writeRegularFile(t, filepath.Join(root, ".master"), "master")
		}},
		{"ownership fields missing", func(t *testing.T, root string) {
			writeRegularFile(t, filepath.Join(root, ".ownership.json"), `{"org_id":"","owner_id":"owner","created_at":"2026-09-03T00:00:00Z"}`)
			writeRegularFile(t, filepath.Join(root, ".master"), "master")
		}},
		{"master absent", func(t *testing.T, root string) { writeValidOwnership(t, root) }},
		{"master not regular", func(t *testing.T, root string) {
			writeValidOwnership(t, root)
			if err := os.Mkdir(filepath.Join(root, ".master"), 0755); err != nil {
				t.Fatal(err)
			}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			root := t.TempDir()
			t.Setenv("BLOOM_NUCLEUS_ROOT", root)
			tt.setup(t, root)
			if _, err := AuthorizeGravityNodeCreation(OpCreateOrganization, "org", nil, nil); err == nil {
				t.Fatal("expected authorization denial")
			}
		})
	}
}

func TestAuthorizeGravityNodeCreationCopiesInputs(t *testing.T) {
	validLocalLegacyRoot(t)
	parent := "org"
	version := uint64(1)
	decision, err := AuthorizeGravityNodeCreation(OpCreateProject, "project", &parent, &version)
	if err != nil {
		t.Fatal(err)
	}
	parent = "changed"
	version = 2
	if *decision.ParentID() != "org" || *decision.ParentObservedVersion() != 1 {
		t.Fatal("decision did not immobilize parent observation")
	}
}

func validLocalLegacyRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	t.Setenv("BLOOM_NUCLEUS_ROOT", root)
	writeValidOwnership(t, root)
	writeRegularFile(t, filepath.Join(root, ".master"), "master")
	return root
}

func writeValidOwnership(t *testing.T, root string) {
	t.Helper()
	record := `{"org_id":"org","owner_id":"owner","owner_name":"Owner","created_at":"` + time.Now().UTC().Format(time.RFC3339Nano) + `","signed_hash":"","team_members":[]}`
	writeRegularFile(t, filepath.Join(root, ".ownership.json"), record)
}

func writeRegularFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
}
