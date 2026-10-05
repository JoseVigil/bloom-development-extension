package core

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDiscoverActiveOrganizationProjects(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", dir)
	if err := os.MkdirAll(filepath.Join(dir, "config"), 0700); err != nil {
		t.Fatal(err)
	}
	raw := `{"onboarding":{"active_org_slug":"acme","active_project_id":"ignored","organizations":[{"org_slug":"acme","organization_id":"org-a","projects":[{"project_id":"11111111-1111-4111-8111-111111111111","name":"one"},{"project_id":"22222222-2222-4222-8222-222222222222","name":"two"}]},{"org_slug":"sibling","organization_id":"org-b","projects":[{"project_id":"33333333-3333-4333-8333-333333333333"}]}]}}`
	if err := os.WriteFile(filepath.Join(dir, "config", "nucleus.json"), []byte(raw), 0600); err != nil {
		t.Fatal(err)
	}
	projects, err := DiscoverActiveOrganizationProjects(&ActiveOrgContext{OrgSlug: "acme", OrganizationID: "org-a"})
	if err != nil {
		t.Fatal(err)
	}
	if len(projects) != 2 || projects[0].ProjectID != "11111111-1111-4111-8111-111111111111" {
		t.Fatalf("unexpected projects: %+v", projects)
	}
}
func TestDiscoverActiveOrganizationProjectsRejectsInvalidOrDuplicate(t *testing.T) {
	for _, projects := range []string{`[{"project_id":""}]`, `[{"project_id":"UPPER"}]`, `[{"project_id":"11111111-1111-4111-8111-111111111111"},{"project_id":"11111111-1111-4111-8111-111111111111"}]`} {
		t.Run(projects, func(t *testing.T) {
			dir := t.TempDir()
			t.Setenv("BLOOM_APPDATA_DIR", dir)
			_ = os.MkdirAll(filepath.Join(dir, "config"), 0700)
			raw := `{"onboarding":{"active_org_slug":"acme","organizations":[{"org_slug":"acme","organization_id":"org-a","projects":` + projects + `}]}}`
			_ = os.WriteFile(filepath.Join(dir, "config", "nucleus.json"), []byte(raw), 0600)
			if _, err := DiscoverActiveOrganizationProjects(&ActiveOrgContext{OrgSlug: "acme", OrganizationID: "org-a"}); err == nil {
				t.Fatal("expected rejection")
			}
		})
	}
}

func TestResolveSelectedProjectRequiresExactIDInActiveOrganization(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("BLOOM_APPDATA_DIR", dir)
	if err := os.MkdirAll(filepath.Join(dir, "config"), 0700); err != nil {
		t.Fatal(err)
	}
	raw := `{"onboarding":{"active_org_slug":"acme","organizations":[{"org_slug":"acme","organization_id":"org-a","projects":[{"project_id":"11111111-1111-4111-8111-111111111111","name":"same"}]},{"org_slug":"other","organization_id":"org-b","projects":[{"project_id":"22222222-2222-4222-8222-222222222222","name":"same"}]}]}}`
	if err := os.WriteFile(filepath.Join(dir, "config", "nucleus.json"), []byte(raw), 0600); err != nil {
		t.Fatal(err)
	}
	active := &ActiveOrgContext{OrgSlug: "acme", OrganizationID: "org-a"}
	if selected, err := ResolveSelectedProject(active, "11111111-1111-4111-8111-111111111111"); err != nil || selected.ProjectID != "11111111-1111-4111-8111-111111111111" {
		t.Fatalf("selected=%+v err=%v", selected, err)
	}
	for _, id := range []string{"", "same", "22222222-2222-4222-8222-222222222222"} {
		if _, err := ResolveSelectedProject(active, id); err == nil {
			t.Fatalf("accepted %q", id)
		}
	}
}

func TestReadProjectLocationAndContinuity(t *testing.T) {
	const selectedID = "11111111-1111-4111-8111-111111111111"
	const otherID = "22222222-2222-4222-8222-222222222222"
	for _, tc := range []struct {
		name, pathMode, material, location, continuity, reason string
	}{
		{"matched", "directory", `[{"id":"` + selectedID + `","absolutePath":"PATH"}]`, "present", "matched", ""},
		{"matched relative material path", "directory", `[{"id":"` + selectedID + `","localPath":"../../selected"}]`, "present", "matched", ""},
		{"same ID different path", "directory", `[{"id":"` + selectedID + `","absolutePath":"OTHER"}]`, "present", "mismatch", "project_id_path_mismatch"},
		{"same path different ID", "directory", `[{"id":"` + otherID + `","absolutePath":"PATH"}]`, "present", "mismatch", "project_path_id_mismatch"},
		{"unrelated entry", "directory", `[{"id":"` + otherID + `","absolutePath":"OTHER"}]`, "present", "not_evaluable", "material_project_entry_absent"},
		{"conflicting entries", "directory", `[{"id":"` + selectedID + `","absolutePath":"PATH"},{"id":"` + otherID + `","absolutePath":"PATH"}]`, "present", "mismatch", "project_path_id_mismatch"},
		{"duplicate entries", "directory", `[{"id":"` + selectedID + `","absolutePath":"PATH"},{"id":"` + selectedID + `","absolutePath":"PATH"}]`, "present", "mismatch", "material_project_entry_duplicate"},
		{"missing folder", "missing", `[{"id":"` + selectedID + `","absolutePath":"PATH"}]`, "absent", "matched", ""},
		{"file not folder", "file", `[{"id":"` + selectedID + `","absolutePath":"PATH"}]`, "absent", "matched", ""},
		{"invalid catalog", "directory", `{}`, "present", "not_evaluable", "material_project_catalog_invalid"},
		{"malformed catalog", "directory", `broken`, "present", "not_evaluable", "material_project_catalog_invalid"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			workspace := t.TempDir()
			path := filepath.Join(workspace, "selected")
			other := filepath.Join(workspace, "other")
			if err := os.Mkdir(other, 0700); err != nil {
				t.Fatal(err)
			}
			if tc.pathMode == "directory" {
				if err := os.Mkdir(path, 0700); err != nil {
					t.Fatal(err)
				}
			}
			if tc.pathMode == "file" {
				if err := os.WriteFile(path, []byte("file"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			root := filepath.Join(workspace, ".bloom", ".nucleus-acme")
			if err := os.MkdirAll(filepath.Join(root, ".core"), 0700); err != nil {
				t.Fatal(err)
			}
			material := tc.material
			if material != `{}` {
				material = `{"projects":` + material + `}`
			}
			material = strings.ReplaceAll(strings.ReplaceAll(material, "PATH", filepath.ToSlash(path)), "OTHER", filepath.ToSlash(other))
			catalog := filepath.Join(root, ".core", ".nucleus-config.json")
			if err := os.WriteFile(catalog, []byte(material), 0600); err != nil {
				t.Fatal(err)
			}
			before, err := os.ReadFile(catalog)
			if err != nil {
				t.Fatal(err)
			}
			location, continuity := ReadProjectLocation(&ActiveOrgContext{NucleusRoot: root}, &LocalProject{ProjectID: selectedID, Path: path})
			if location["status"] != tc.location || continuity["status"] != tc.continuity || (tc.reason != "" && continuity["reason"] != tc.reason) {
				t.Fatalf("location=%v continuity=%v", location, continuity)
			}
			after, err := os.ReadFile(catalog)
			if err != nil {
				t.Fatal(err)
			}
			if string(before) != string(after) {
				t.Fatal("material catalog changed")
			}
			if _, err := os.Stat(filepath.Join(root, "project-bindings.json")); !os.IsNotExist(err) {
				t.Fatal("read created binding data")
			}
		})
	}
}

func TestReadProjectLocationMissingMaterialOrPath(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "selected")
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	location, continuity := ReadProjectLocation(&ActiveOrgContext{NucleusRoot: root}, &LocalProject{ProjectID: "id", Path: path})
	if location["status"] != "present" || continuity["reason"] != "material_project_catalog_unavailable" {
		t.Fatalf("%v %v", location, continuity)
	}
	location, continuity = ReadProjectLocation(&ActiveOrgContext{NucleusRoot: root}, &LocalProject{ProjectID: "id"})
	if location["status"] != "not_evaluable" || continuity["status"] != "not_evaluable" {
		t.Fatalf("%v %v", location, continuity)
	}
}

func TestReadProjectLocationInaccessibleIsIndependent(t *testing.T) {
	root := t.TempDir()
	selected := filepath.Join(root, "selected")
	materialDir := filepath.Join(root, ".core")
	if err := os.Mkdir(materialDir, 0700); err != nil {
		t.Fatal(err)
	}
	const id = "11111111-1111-4111-8111-111111111111"
	material := `{"projects":[{"id":"` + id + `","absolutePath":"` + filepath.ToSlash(selected) + `"}]}`
	if err := os.WriteFile(filepath.Join(materialDir, ".nucleus-config.json"), []byte(material), 0600); err != nil {
		t.Fatal(err)
	}
	previous := projectPathStat
	projectPathStat = func(string) (os.FileInfo, error) { return nil, errors.New("access denied") }
	t.Cleanup(func() { projectPathStat = previous })
	location, continuity := ReadProjectLocation(&ActiveOrgContext{NucleusRoot: root}, &LocalProject{ProjectID: id, Path: selected})
	if location["status"] != "inaccessible" || continuity["status"] != "matched" {
		t.Fatalf("%v %v", location, continuity)
	}
}
