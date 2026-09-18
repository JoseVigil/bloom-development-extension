package authority

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestProjectBindingStorePreservesReceipts(t *testing.T) {
	s := &ProjectBindingStore{Path: filepath.Join(t.TempDir(), "project-bindings.json")}
	now := time.Now().UTC()
	for _, id := range []string{"b", "a"} {
		if err := s.Save(ProjectClaim{Status: ProjectClaimed, OrganizationID: "org", TenantID: "tenant", ProjectID: id, Revision: "1", SourceRef: "installation:i", EvidenceKind: "canonical", ClaimedAt: now}, now); err != nil {
			t.Fatal(err)
		}
	}
	got, err := s.Load()
	if err != nil || len(got) != 2 || got[0].ProjectID != "a" {
		t.Fatalf("got=%+v err=%v", got, err)
	}
}

func TestProjectBindingStoreCannotCarryPrincipalAuthority(t *testing.T) {
	path := filepath.Join(t.TempDir(), "project-bindings.json")
	if err := os.WriteFile(path, []byte(`{"principal_id":"forged","project_bindings":[]}`), 0600); err != nil {
		t.Fatal(err)
	}
	s := &ProjectBindingStore{Path: path}
	now := time.Now().UTC()
	if err := s.Save(ProjectClaim{Status: ProjectClaimed, OrganizationID: "org", TenantID: "tenant", ProjectID: "p", Revision: "1", SourceRef: "installation:i", EvidenceKind: "canonical", ClaimedAt: now}, now); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) == "" || containsBytes(raw, []byte("principal_id")) {
		t.Fatalf("forged principal survived diagnostic rewrite: %s", raw)
	}
}

func containsBytes(value, needle []byte) bool {
	for i := 0; i+len(needle) <= len(value); i++ {
		match := true
		for j := range needle {
			if value[i+j] != needle[j] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
