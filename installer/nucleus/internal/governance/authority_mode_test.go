package governance

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestEffectiveAuthorityModeIsLocalLegacy(t *testing.T) {
	mode, err := EffectiveAuthorityMode()
	if err != nil {
		t.Fatal(err)
	}
	if mode != ModeLocalLegacy {
		t.Fatalf("mode = %q, want %q", mode, ModeLocalLegacy)
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
