package core

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

var canonicalProjectUUID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

type LocalProject struct {
	ProjectID string
	Name      string
}

// DiscoverActiveOrganizationProjects treats nucleus.json only as Conductor's
// local catalog. It never infers identity from name, path, or active_project_id.
func DiscoverActiveOrganizationProjects(active *ActiveOrgContext) ([]LocalProject, error) {
	if active == nil || active.OrgSlug == "" || active.OrganizationID == "" {
		return nil, errors.New("active organization context required")
	}
	path := filepath.Join(ResolveAppDataDir(), "config", "nucleus.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read project catalog: %w", err)
	}
	var doc struct {
		Onboarding struct {
			ActiveOrgSlug string `json:"active_org_slug"`
			Organizations []struct {
				OrgSlug        string `json:"org_slug"`
				OrganizationID string `json:"organization_id"`
				Projects       []struct {
					ProjectID   string `json:"project_id"`
					Name        string `json:"name"`
					ProjectName string `json:"project_name"`
				} `json:"projects"`
			} `json:"organizations"`
		} `json:"onboarding"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("invalid project catalog: %w", err)
	}
	if doc.Onboarding.ActiveOrgSlug != active.OrgSlug {
		return nil, errors.New("active organization slug changed")
	}
	for _, org := range doc.Onboarding.Organizations {
		if org.OrgSlug != active.OrgSlug {
			continue
		}
		if org.OrganizationID != active.OrganizationID {
			return nil, errors.New("active organization id mismatch")
		}
		seen := map[string]bool{}
		projects := make([]LocalProject, 0, len(org.Projects))
		for _, project := range org.Projects {
			if !canonicalProjectUUID.MatchString(project.ProjectID) {
				return nil, fmt.Errorf("invalid canonical project_id %q", project.ProjectID)
			}
			if seen[project.ProjectID] {
				return nil, fmt.Errorf("duplicate project_id %q", project.ProjectID)
			}
			seen[project.ProjectID] = true
			name := project.Name
			if name == "" {
				name = project.ProjectName
			}
			projects = append(projects, LocalProject{ProjectID: project.ProjectID, Name: name})
		}
		return projects, nil
	}
	return nil, errors.New("active organization missing from project catalog")
}
