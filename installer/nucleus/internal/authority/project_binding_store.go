package authority

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/gofrs/flock"
)

type ProjectBindingReceipt struct {
	OrganizationID string    `json:"organization_id"`
	TenantID       string    `json:"tenant_id"`
	ProjectID      string    `json:"project_id"`
	Revision       string    `json:"revision"`
	SourceRef      string    `json:"source_ref"`
	EvidenceKind   string    `json:"evidence_kind"`
	ClaimedAt      time.Time `json:"claimed_at"`
	ConfirmedAt    time.Time `json:"confirmed_at"`
	ValidUntil     time.Time `json:"valid_until,omitempty"`
	CheckedAt      time.Time `json:"checked_at,omitempty"`
}
type ProjectBindingStore struct{ Path string }
type projectBindingDocument struct {
	ProjectBindings []ProjectBindingReceipt `json:"project_bindings"`
}

func (s *ProjectBindingStore) Save(claim ProjectClaim, confirmedAt time.Time) error {
	if s == nil || s.Path == "" {
		return errors.New("project binding store required")
	}
	if err := os.MkdirAll(filepath.Dir(s.Path), 0700); err != nil {
		return err
	}
	lock := flock.New(s.Path + ".lock")
	if err := lock.Lock(); err != nil {
		return err
	}
	defer lock.Unlock()
	doc, _ := s.loadDocumentUnlocked()
	receipts := doc.ProjectBindings
	found := false
	for i := range receipts {
		if receipts[i].ProjectID == claim.ProjectID {
			receipts[i] = receiptFromClaim(claim, confirmedAt)
			found = true
		}
	}
	if !found {
		receipts = append(receipts, receiptFromClaim(claim, confirmedAt))
	}
	sort.Slice(receipts, func(i, j int) bool { return receipts[i].ProjectID < receipts[j].ProjectID })
	doc.ProjectBindings = receipts
	raw, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.Path), ".project-bindings.*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err = tmp.Write(append(raw, '\n')); err == nil {
		err = tmp.Sync()
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(tmpPath, s.Path)
}
func receiptFromClaim(c ProjectClaim, at time.Time) ProjectBindingReceipt {
	return ProjectBindingReceipt{OrganizationID: c.OrganizationID, TenantID: c.TenantID, ProjectID: c.ProjectID, Revision: c.Revision, SourceRef: c.SourceRef, EvidenceKind: c.EvidenceKind, ClaimedAt: c.ClaimedAt, ConfirmedAt: at.UTC()}
}
func (s *ProjectBindingStore) Load() ([]ProjectBindingReceipt, error) {
	if s == nil || s.Path == "" {
		return nil, errors.New("project binding store required")
	}
	lock := flock.New(s.Path + ".lock")
	if err := lock.Lock(); err != nil {
		return nil, err
	}
	defer lock.Unlock()
	return s.loadUnlocked()
}
func (s *ProjectBindingStore) loadUnlocked() ([]ProjectBindingReceipt, error) {
	doc, err := s.loadDocumentUnlocked()
	return doc.ProjectBindings, err
}
func (s *ProjectBindingStore) loadDocumentUnlocked() (projectBindingDocument, error) {
	raw, err := os.ReadFile(s.Path)
	if os.IsNotExist(err) {
		return projectBindingDocument{ProjectBindings: []ProjectBindingReceipt{}}, nil
	}
	if err != nil {
		return projectBindingDocument{}, err
	}
	var doc projectBindingDocument
	if json.Unmarshal(raw, &doc) != nil {
		return projectBindingDocument{}, errors.New("invalid project binding store")
	}
	return doc, nil
}
