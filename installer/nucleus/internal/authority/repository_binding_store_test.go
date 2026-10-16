package authority

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRepositoryBindingStoreResolvesExactProjectRepository(t *testing.T) {
	root := t.TempDir()
	store := &RepositoryBindingStore{Path: filepath.Join(t.TempDir(), "bindings.json")}
	b := RepositoryBinding{SchemaVersion: "bloom.repository-binding/v1", ProjectID: "project", RepositoryID: "repository", Root: root, InstallationID: "installation", AuthorityVersion: "1", AuthorizedBy: "principal", Status: "active", Revision: 1, AuthorizedAt: time.Now().UTC()}
	if err := store.Save(b); err != nil {
		t.Fatal(err)
	}
	got, digest, err := store.ResolveRepository("project", "repository")
	if err != nil || got != root || digest == "" {
		t.Fatalf("root=%q digest=%q err=%v", got, digest, err)
	}
	if _, _, err = store.ResolveRepository("other", "repository"); err == nil {
		t.Fatal("cross-project binding accepted")
	}
	raw, _ := os.ReadFile(store.Path)
	raw[len(raw)-2] ^= 1
	_ = os.WriteFile(store.Path, raw, 0600)
	if _, _, err = store.ResolveRepository("project", "repository"); err == nil {
		t.Fatal("corrupt store accepted")
	}
}

func TestRepositoryBindingRevisionMustAdvance(t *testing.T) {
	root := t.TempDir()
	store := &RepositoryBindingStore{Path: filepath.Join(t.TempDir(), "bindings.json")}
	b := RepositoryBinding{SchemaVersion: "bloom.repository-binding/v1", ProjectID: "p", RepositoryID: "r", Root: root, InstallationID: "i", AuthorityVersion: "1", AuthorizedBy: "a", Status: "active", Revision: 1, AuthorizedAt: time.Now().UTC()}
	if err := store.Save(b); err != nil {
		t.Fatal(err)
	}
	if err := store.Save(b); err == nil {
		t.Fatal("non-advancing revision accepted")
	}
}
