package gene

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestResolveAuthorizedAssetKinds(t *testing.T) {
	root := t.TempDir()
	project := "11111111-1111-4111-8111-111111111111"
	repo := "22222222-2222-4222-8222-222222222222"
	for _, p := range []string{"file.go", "doc.md", "thing_test.go"} {
		if err := os.WriteFile(filepath.Join(root, p), []byte(p), 0600); err != nil {
			t.Fatal(err)
		}
	}
	assets := []AssetRef{{ProjectID: project, RepositoryID: repo, Kind: "file", RepositoryRelativePath: "file.go"}, {ProjectID: project, RepositoryID: repo, Kind: "document", RepositoryRelativePath: "doc.md"}, {ProjectID: project, RepositoryID: repo, Kind: "test", RepositoryRelativePath: "thing_test.go"}}
	got, err := ResolveAssets(project, assets, map[string]string{repo: root})
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range got {
		if a.AssetID == "" || a.Observed.SHA256 == "" || a.Observed.SizeBytes == 0 {
			t.Fatalf("unresolved: %#v", a)
		}
	}
}

func TestResolveAssetsRejectsInvalidInputs(t *testing.T) {
	root := t.TempDir()
	project := "11111111-1111-4111-8111-111111111111"
	repo := "22222222-2222-4222-8222-222222222222"
	base := AssetRef{ProjectID: project, RepositoryID: repo, Kind: "file", RepositoryRelativePath: "missing"}
	if _, err := ResolveAssets(project, []AssetRef{base}, map[string]string{repo: root}); !errors.Is(err, ErrAssetMissing) {
		t.Fatalf("%v", err)
	}
	for _, p := range []string{"../escape", "/absolute", "a\\b"} {
		x := base
		x.RepositoryRelativePath = p
		if _, err := ResolveAssets(project, []AssetRef{x}, map[string]string{repo: root}); !errors.Is(err, ErrAssetPathInvalid) {
			t.Fatalf("%q: %v", p, err)
		}
	}
	base.RepositoryRelativePath = "missing"
	base.RepositoryID = ""
	if _, err := ResolveAssets(project, []AssetRef{base}, map[string]string{repo: root}); !errors.Is(err, ErrRepositoryIDRequired) {
		t.Fatal(err)
	}
	target := filepath.Join(root, "target")
	if err := os.WriteFile(target, []byte("x"), 0600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "link")
	if err := os.Symlink(target, link); err == nil {
		x := base
		x.RepositoryID = repo
		x.RepositoryRelativePath = "link"
		if _, err = ResolveAssets(project, []AssetRef{x}, map[string]string{repo: root}); !errors.Is(err, ErrAssetOutsideRepository) {
			t.Fatalf("symlink: %v", err)
		}
	}
}
