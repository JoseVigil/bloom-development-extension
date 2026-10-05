package core

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var canonicalProjectUUID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
var projectPathStat = os.Stat

type LocalProject struct {
	ProjectID string
	Name      string
	Path      string
}

// ReadProjectLocation evaluates the selected path and material catalog without
// changing either source. Location and ID continuity remain independent.
func ReadProjectLocation(active *ActiveOrgContext, project *LocalProject) (map[string]any, map[string]any) {
	location := map[string]any{"status": "not_evaluable", "reason": "project_path_missing"}
	continuity := map[string]any{"status": "not_evaluable", "reason": "project_path_missing"}
	if active == nil || project == nil || project.Path == "" || !filepath.IsAbs(project.Path) {
		return location, continuity
	}
	path := filepath.Clean(project.Path)
	location["path"] = path
	location["source"] = "conductor_project_catalog"
	info, err := projectPathStat(path)
	switch {
	case err == nil && info.IsDir():
		location["status"] = "present"
		delete(location, "reason")
	case err == nil:
		location["status"] = "absent"
		location["reason"] = "project_path_not_directory"
	case os.IsNotExist(err):
		location["status"] = "absent"
		location["reason"] = "project_directory_absent"
	default:
		location["status"] = "inaccessible"
		location["reason"] = "project_path_inaccessible"
	}
	continuity["reason"] = "material_project_entry_absent"
	materialPath := filepath.Join(active.NucleusRoot, ".core", ".nucleus-config.json")
	continuity["source"] = "nucleus_material_project_catalog"
	continuity["catalogPath"] = materialPath
	raw, err := os.ReadFile(materialPath)
	if err != nil {
		continuity["reason"] = "material_project_catalog_unavailable"
		return location, continuity
	}
	var material struct {
		Projects []struct {
			ID           string `json:"id"`
			AbsolutePath string `json:"absolutePath"`
			LocalPath    string `json:"localPath"`
		} `json:"projects"`
	}
	if err := json.Unmarshal(raw, &material); err != nil || material.Projects == nil {
		continuity["reason"] = "material_project_catalog_invalid"
		return location, continuity
	}
	selectedPath := canonicalProjectPath(path)
	matchedID, matchedPath, exactMatches := false, false, 0
	for _, entry := range material.Projects {
		entryPath := entry.AbsolutePath
		if entryPath == "" && entry.LocalPath != "" {
			entryPath = filepath.Join(active.NucleusRoot, entry.LocalPath)
		}
		if entryPath == "" || !filepath.IsAbs(entryPath) || entry.ID == "" {
			continue
		}
		sameID := entry.ID == project.ProjectID
		samePath := sameProjectPath(selectedPath, canonicalProjectPath(entryPath))
		if sameID && samePath {
			exactMatches++
			continue
		}
		matchedID = matchedID || sameID
		matchedPath = matchedPath || samePath
	}
	if exactMatches > 1 || matchedID || matchedPath {
		continuity["status"] = "mismatch"
		if exactMatches > 1 {
			continuity["reason"] = "material_project_entry_duplicate"
		} else if matchedID && matchedPath {
			continuity["reason"] = "material_project_catalog_conflict"
		} else if matchedID {
			continuity["reason"] = "project_id_path_mismatch"
		} else {
			continuity["reason"] = "project_path_id_mismatch"
		}
	} else if exactMatches == 1 {
		continuity["status"] = "matched"
		delete(continuity, "reason")
	}
	return location, continuity
}

func canonicalProjectPath(path string) string {
	if resolved, err := filepath.EvalSymlinks(path); err == nil {
		return filepath.Clean(resolved)
	}
	return filepath.Clean(path)
}

func sameProjectPath(a, b string) bool {
	if os.PathSeparator == '\\' {
		return strings.EqualFold(a, b)
	}
	return a == b
}

// ResolveSelectedProject requires an explicit canonical ID in the active
// organization's local catalog. Names and paths are never identity evidence.
func ResolveSelectedProject(active *ActiveOrgContext, projectID string) (*LocalProject, error) {
	if !canonicalProjectUUID.MatchString(projectID) {
		return nil, errors.New("invalid selected project_id")
	}
	projects, err := DiscoverActiveOrganizationProjects(active)
	if err != nil {
		return nil, err
	}
	for i := range projects {
		if projects[i].ProjectID == projectID {
			return &projects[i], nil
		}
	}
	return nil, errors.New("selected project_id absent from active organization")
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
					ProjectPath string `json:"project_path"`
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
			projects = append(projects, LocalProject{ProjectID: project.ProjectID, Name: name, Path: project.ProjectPath})
		}
		return projects, nil
	}
	return nil, errors.New("active organization missing from project catalog")
}
