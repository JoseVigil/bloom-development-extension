package authority

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/gofrs/flock"
)

type RepositoryBinding struct {
	SchemaVersion    string    `json:"schema_version"`
	ProjectID        string    `json:"project_id"`
	RepositoryID     string    `json:"repository_id"`
	Root             string    `json:"root"`
	InstallationID   string    `json:"installation_id"`
	AuthorityVersion string    `json:"authority_version"`
	AuthorizedBy     string    `json:"authorized_by"`
	Status           string    `json:"status"`
	Revision         uint64    `json:"revision"`
	AuthorizedAt     time.Time `json:"authorized_at"`
	BindingDigest    string    `json:"binding_digest"`
}

type RepositoryBindingStore struct{ Path string }
type repositoryBindingDocument struct {
	SchemaVersion string              `json:"schema_version"`
	Bindings      []RepositoryBinding `json:"bindings"`
}

func repositoryBindingDigest(b RepositoryBinding) (string, error) {
	b.BindingDigest = ""
	raw, err := json.Marshal(b)
	if err != nil {
		return "", err
	}
	canonical, err := Canonicalize(raw)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return "sha256:" + hex.EncodeToString(sum[:]), nil
}

func validateRepositoryBinding(b RepositoryBinding) error {
	if b.SchemaVersion != "bloom.repository-binding/v1" || b.ProjectID == "" || b.RepositoryID == "" || b.InstallationID == "" || b.AuthorityVersion == "" || b.AuthorizedBy == "" || b.Status != "active" || b.Revision == 0 || b.AuthorizedAt.IsZero() || !filepath.IsAbs(b.Root) {
		return errors.New("invalid repository binding")
	}
	clean, err := filepath.Abs(filepath.Clean(b.Root))
	if err != nil || clean != b.Root {
		return errors.New("repository binding root must be canonical absolute path")
	}
	d, err := repositoryBindingDigest(b)
	if err != nil || b.BindingDigest != d {
		return errors.New("repository binding digest mismatch")
	}
	return nil
}

func (s *RepositoryBindingStore) Save(binding RepositoryBinding) error {
	if s == nil || s.Path == "" {
		return errors.New("repository binding store required")
	}
	binding.Root, _ = filepath.Abs(filepath.Clean(binding.Root))
	binding.AuthorizedAt = binding.AuthorizedAt.UTC()
	binding.BindingDigest = ""
	var digestErr error
	binding.BindingDigest, digestErr = repositoryBindingDigest(binding)
	if digestErr != nil {
		return digestErr
	}
	if err := validateRepositoryBinding(binding); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.Path), 0700); err != nil {
		return err
	}
	lock := flock.New(s.Path + ".lock")
	if err := lock.Lock(); err != nil {
		return err
	}
	defer lock.Unlock()
	doc, err := s.loadUnlocked()
	if err != nil {
		return err
	}
	replaced := false
	for i := range doc.Bindings {
		if doc.Bindings[i].ProjectID == binding.ProjectID && doc.Bindings[i].RepositoryID == binding.RepositoryID {
			if binding.Revision <= doc.Bindings[i].Revision {
				return errors.New("repository binding revision must advance")
			}
			doc.Bindings[i] = binding
			replaced = true
		}
	}
	if !replaced {
		doc.Bindings = append(doc.Bindings, binding)
	}
	sort.Slice(doc.Bindings, func(i, j int) bool {
		if doc.Bindings[i].ProjectID == doc.Bindings[j].ProjectID {
			return doc.Bindings[i].RepositoryID < doc.Bindings[j].RepositoryID
		}
		return doc.Bindings[i].ProjectID < doc.Bindings[j].ProjectID
	})
	raw, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.Path), ".repository-bindings-*.tmp")
	if err != nil {
		return err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if _, err = tmp.Write(raw); err == nil {
		err = tmp.Sync()
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(name, s.Path)
}

func (s *RepositoryBindingStore) loadUnlocked() (repositoryBindingDocument, error) {
	raw, err := os.ReadFile(s.Path)
	if errors.Is(err, os.ErrNotExist) {
		return repositoryBindingDocument{SchemaVersion: "bloom.repository-binding-store/v1", Bindings: []RepositoryBinding{}}, nil
	}
	if err != nil {
		return repositoryBindingDocument{}, err
	}
	var doc repositoryBindingDocument
	if err = decodeStrict(raw, &doc); err != nil || doc.SchemaVersion != "bloom.repository-binding-store/v1" {
		return repositoryBindingDocument{}, errors.New("invalid repository binding store")
	}
	for _, b := range doc.Bindings {
		if err = validateRepositoryBinding(b); err != nil {
			return repositoryBindingDocument{}, err
		}
	}
	return doc, nil
}

func (s *RepositoryBindingStore) ResolveRepository(projectID, repositoryID string) (string, string, error) {
	if s == nil || s.Path == "" {
		return "", "", errors.New("repository binding store required")
	}
	lock := flock.New(s.Path + ".lock")
	if err := lock.Lock(); err != nil {
		return "", "", err
	}
	defer lock.Unlock()
	doc, err := s.loadUnlocked()
	if err != nil {
		return "", "", err
	}
	for _, b := range doc.Bindings {
		if b.ProjectID == projectID && b.RepositoryID == repositoryID && b.Status == "active" {
			if _, err = os.Stat(b.Root); err != nil {
				return "", "", errors.New("repository binding root unavailable")
			}
			return b.Root, b.BindingDigest, nil
		}
	}
	return "", "", errors.New("repository binding not found")
}
