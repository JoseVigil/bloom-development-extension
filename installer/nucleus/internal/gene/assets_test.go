package gene

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type staticBindingResolver struct {
	root, digest        string
	project, repository string
}

func (r staticBindingResolver) ResolveRepository(project, repository string) (string, string, error) {
	if project != r.project || repository != r.repository {
		return "", "", ErrRepositoryBinding
	}
	return r.root, r.digest, nil
}

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

func TestResolveAuthorizedAssetsUsesExactBinding(t *testing.T) {
	root := t.TempDir()
	_ = os.WriteFile(filepath.Join(root, "file.go"), []byte("package fixture\n"), 0600)
	project := "11111111-1111-4111-8111-111111111111"
	repo := "22222222-2222-4222-8222-222222222222"
	digest := "sha256:" + strings.Repeat("a", 64)
	asset := AssetRef{ProjectID: project, RepositoryID: repo, Kind: "file", RepositoryRelativePath: "file.go"}
	got, bindings, err := ResolveAuthorizedAssets(project, []AssetRef{asset}, staticBindingResolver{root: root, digest: digest, project: project, repository: repo})
	if err != nil || len(got) != 1 || len(bindings) != 1 || bindings[0] != digest {
		t.Fatalf("got=%+v bindings=%v err=%v", got, bindings, err)
	}
	if _, _, err = ResolveAuthorizedAssets("99999999-9999-4999-8999-999999999999", []AssetRef{asset}, staticBindingResolver{root: root, digest: digest, project: project, repository: repo}); !errors.Is(err, ErrProjectMismatch) {
		t.Fatalf("%v", err)
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
