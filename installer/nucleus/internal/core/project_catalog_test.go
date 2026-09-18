package core

import (
	"os"
	"path/filepath"
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
