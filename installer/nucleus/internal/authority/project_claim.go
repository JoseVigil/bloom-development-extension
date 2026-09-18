package authority

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type ProjectClaimStatus string

const (
	ProjectClaimed        ProjectClaimStatus = "claimed"
	ProjectAlreadyClaimed ProjectClaimStatus = "already_claimed"
)

type ProjectClaim struct {
	Status         ProjectClaimStatus `json:"status"`
	OrganizationID string             `json:"organizationId"`
	TenantID       string             `json:"tenantId"`
	ProjectID      string             `json:"projectId"`
	Revision       string             `json:"revision"`
	SourceRef      string             `json:"sourceRef"`
	EvidenceKind   string             `json:"evidenceKind"`
	ClaimedAt      time.Time          `json:"claimedAt"`
}

type ProjectBinding struct {
	Status         string    `json:"status"`
	OrganizationID string    `json:"organizationId"`
	TenantID       string    `json:"tenantId"`
	ProjectID      string    `json:"projectId"`
	Revision       string    `json:"revision"`
	SourceRef      string    `json:"sourceRef"`
	EvidenceKind   string    `json:"evidenceKind"`
	ClaimedAt      time.Time `json:"claimedAt"`
	ValidUntil     time.Time `json:"validUntil"`
	CheckedAt      time.Time `json:"checkedAt"`
}

type ProjectClaimError struct {
	Status    int
	Code      string
	Retryable bool
}

func (e *ProjectClaimError) Error() string { return e.Code }

func (c *SyncClient) ClaimProject(ctx context.Context, projectID string) (ProjectClaim, error) {
	path := "/v1/authority/projects/" + url.PathEscape(projectID) + "/claim"
	req, err := c.signedRequest(ctx, http.MethodPut, path, url.Values{"org": {c.Binding.OrganizationID}})
	if err != nil {
		return ProjectClaim{}, err
	}
	response, err := c.client().Do(req)
	if err != nil {
		return ProjectClaim{}, &ProjectClaimError{Status: 0, Code: "project_claim_transport", Retryable: true}
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusConflict {
		return ProjectClaim{}, &ProjectClaimError{Status: response.StatusCode, Code: "project_claim_conflict"}
	}
	if response.StatusCode != http.StatusCreated && response.StatusCode != http.StatusOK {
		return ProjectClaim{}, &ProjectClaimError{Status: response.StatusCode, Code: "project_claim_rejected", Retryable: response.StatusCode >= 500}
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return ProjectClaim{}, err
	}
	if rejectDuplicateKeys(raw) != nil {
		return ProjectClaim{}, errors.New("invalid project claim JSON")
	}
	var claim ProjectClaim
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&claim); err != nil {
		return ProjectClaim{}, fmt.Errorf("invalid project claim: %w", err)
	}
	if claim.OrganizationID != c.Binding.OrganizationID || claim.ProjectID != projectID || claim.TenantID == "" ||
		claim.Revision != "1" || !validInstallationSource(claim.SourceRef) || claim.EvidenceKind != "canonical" || claim.ClaimedAt.IsZero() ||
		(claim.Status != ProjectClaimed && claim.Status != ProjectAlreadyClaimed) {
		return ProjectClaim{}, errors.New("contradictory project claim response")
	}
	if claim.Status == ProjectClaimed && claim.SourceRef != "installation:"+c.Binding.InstallationID {
		return ProjectClaim{}, errors.New("contradictory project claim response")
	}
	if response.StatusCode == http.StatusCreated && claim.Status != ProjectClaimed || response.StatusCode == http.StatusOK && claim.Status != ProjectAlreadyClaimed {
		return ProjectClaim{}, errors.New("project claim status mismatch")
	}
	return claim, nil
}

func validInstallationSource(value string) bool {
	return strings.HasPrefix(value, "installation:") && len(value) > len("installation:")
}

func (c *SyncClient) GetProjectBinding(ctx context.Context, projectID string) (ProjectBinding, error) {
	path := "/v1/authority/projects/" + url.PathEscape(projectID) + "/binding"
	req, err := c.signedRequest(ctx, http.MethodGet, path, url.Values{"org": {c.Binding.OrganizationID}})
	if err != nil {
		return ProjectBinding{}, &ProjectClaimError{Code: "project_binding_unavailable", Retryable: true}
	}
	response, err := c.client().Do(req)
	if err != nil {
		return ProjectBinding{}, &ProjectClaimError{Code: "project_binding_unavailable", Retryable: true}
	}
	defer response.Body.Close()
	code := map[int]string{http.StatusNotFound: "project_binding_required", http.StatusGone: "project_binding_expired", http.StatusConflict: "project_binding_conflict", http.StatusForbidden: "project_binding_conflict"}[response.StatusCode]
	if response.StatusCode != http.StatusOK {
		if code == "" {
			code = "project_binding_unavailable"
		}
		raw, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
		var body struct {
			Error string `json:"error"`
		}
		if rejectDuplicateKeys(raw) == nil && decodeStrict(raw, &body) == nil {
			switch body.Error {
			case "project_binding_expired":
				code = body.Error
			case "project_binding_revoked":
				code = body.Error
			case "project_binding_inconsistent", "project_binding_cross_organization":
				code = "project_binding_conflict"
			case "project_binding_not_found":
				code = "project_binding_required"
			}
		}
		return ProjectBinding{}, &ProjectClaimError{Status: response.StatusCode, Code: code, Retryable: response.StatusCode >= 500}
	}
	raw, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return ProjectBinding{}, &ProjectClaimError{Code: "project_binding_unavailable", Retryable: true}
	}
	if rejectDuplicateKeys(raw) != nil {
		return ProjectBinding{}, errors.New("project_binding_conflict")
	}
	var binding ProjectBinding
	if decodeStrict(raw, &binding) != nil {
		return ProjectBinding{}, errors.New("project_binding_conflict")
	}
	now := c.now()
	if binding.Status != "bound" || binding.OrganizationID != c.Binding.OrganizationID || binding.ProjectID != projectID || binding.TenantID == "" || binding.Revision != "1" || binding.EvidenceKind != "canonical" || !validInstallationSource(binding.SourceRef) || binding.ClaimedAt.IsZero() || binding.ClaimedAt.After(binding.CheckedAt) || binding.ValidUntil.IsZero() || binding.CheckedAt.IsZero() || binding.CheckedAt.After(now) {
		return ProjectBinding{}, errors.New("project_binding_conflict")
	}
	if !now.Before(binding.ValidUntil) {
		return ProjectBinding{}, &ProjectClaimError{Status: http.StatusGone, Code: "project_binding_expired"}
	}
	return binding, nil
}
