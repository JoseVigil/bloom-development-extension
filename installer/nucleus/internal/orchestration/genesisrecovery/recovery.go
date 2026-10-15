package genesisrecovery

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

type WorkflowState string

const (
	WorkflowRunning  WorkflowState = "running"
	WorkflowNotFound WorkflowState = "not_found"
	WorkflowUnknown  WorkflowState = "unknown"
)

type WorkflowReader interface {
	GetMandateWorkflowStates(context.Context, string) (map[string]WorkflowState, error)
}

type Service struct {
	Store        *Store
	MandatesRoot string
	Workflows    WorkflowReader
	Now          func() time.Time
}

type PrepareInput struct{ ProjectID, ProjectName, Source, ExpectedPreviousMandateID, RecoveryRequestID string }
type PrepareResult struct {
	Success                   bool   `json:"success"`
	Replayed                  bool   `json:"replayed"`
	ProjectID                 string `json:"projectId"`
	Project                   string `json:"project"`
	Source                    string `json:"source"`
	ExpectedPreviousMandateID string `json:"expectedPreviousMandateId"`
	RecoveryRequestID         string `json:"recoveryRequestId"`
	MandateLaunchID           string `json:"mandateLaunchId"`
}

type ContractError struct {
	Code   string
	Detail string
}

func (e *ContractError) Error() string { return e.Code + ": " + e.Detail }
func fail(code, detail string) error   { return &ContractError{Code: code, Detail: detail} }

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
}

func (s *Service) verifyMandateProject(mandateID, projectID string) error {
	raw, err := os.ReadFile(filepath.Join(s.MandatesRoot, mandateID, "mandate_state.json"))
	if err != nil {
		return fail("PROJECT_MANDATE_UNVERIFIED", "mandate_state.json no está disponible")
	}
	var state struct {
		ProjectID      string `json:"projectId"`
		MandateType    string `json:"mandateType"`
		Reconciliation struct {
			Status string `json:"status"`
		} `json:"reconciliation"`
	}
	if json.Unmarshal(raw, &state) != nil || state.ProjectID != projectID || state.MandateType != "genesis" {
		return fail("PROJECT_MANDATE_UNVERIFIED", "el Mandate no pertenece inequívocamente al proyecto")
	}
	return nil
}

func (s *Service) ensureRecoverable(ctx context.Context, mandateID string) error {
	if s.Workflows == nil {
		return fail("WORKFLOW_STATE_UNAVAILABLE", "cliente Temporal no disponible")
	}
	allNotFound := true
	states, err := s.Workflows.GetMandateWorkflowStates(ctx, mandateID)
	if err != nil {
		return fail("WORKFLOW_STATE_UNAVAILABLE", err.Error())
	}
	for id, state := range states {
		if state == WorkflowUnknown {
			return fail("WORKFLOW_STATE_UNAVAILABLE", "no se pudo establecer el estado de "+id)
		}
		if state == WorkflowRunning {
			return fail("PREVIOUS_WORKFLOW_ACTIVE", id+" sigue activo")
		}
		if state != WorkflowNotFound {
			allNotFound = false
		}
	}
	if allNotFound {
		raw, err := os.ReadFile(filepath.Join(s.MandatesRoot, mandateID, "mandate_state.json"))
		if err != nil {
			return fail("PROJECT_MANDATE_UNVERIFIED", "no existe artefacto local para reconciliar")
		}
		var state struct {
			Reconciliation struct {
				Status string `json:"status"`
			} `json:"reconciliation"`
		}
		if json.Unmarshal(raw, &state) != nil || (state.Reconciliation.Status != "required" && state.Reconciliation.Status != "failed") {
			return fail("WORKFLOW_STATE_UNAVAILABLE", "Temporal no conserva el workflow y el artefacto local aún no fue reconciliado")
		}
	}
	return nil
}

func (s *Service) Prepare(ctx context.Context, in PrepareInput) (*PrepareResult, error) {
	if in.ProjectID == "" || in.ExpectedPreviousMandateID == "" || in.RecoveryRequestID == "" || in.ProjectName == "" {
		return nil, fail("RECOVERY_INPUT_INVALID", "faltan identidades requeridas")
	}
	if _, err := uuid.Parse(in.RecoveryRequestID); err != nil {
		return nil, fail("RECOVERY_INPUT_INVALID", "recoveryRequestId debe ser UUID")
	}
	// A prepared request is replayable even if Temporal is temporarily down:
	// the durable reservation is already the authority for its launch ID.
	if existing, err := s.Store.Load(in.ProjectID); err == nil && existing.PendingRecovery != nil {
		p := existing.PendingRecovery
		if p.RecoveryRequestID != in.RecoveryRequestID {
			return nil, fail("RECOVERY_IN_PROGRESS", "otro recovery está pendiente")
		}
		if p.ExpectedPreviousMandateID != in.ExpectedPreviousMandateID || p.ProjectName != in.ProjectName || p.Source != in.Source {
			return nil, fail("RECOVERY_REQUEST_CONFLICT", "recoveryRequestId reutilizado con argumentos distintos")
		}
		return &PrepareResult{true, true, in.ProjectID, p.ProjectName, p.Source, p.ExpectedPreviousMandateID, p.RecoveryRequestID, p.MandateLaunchID}, nil
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if err := s.verifyMandateProject(in.ExpectedPreviousMandateID, in.ProjectID); err != nil {
		return nil, err
	}
	if err := s.ensureRecoverable(ctx, in.ExpectedPreviousMandateID); err != nil {
		return nil, err
	}
	var result *PrepareResult
	err := s.Store.WithLock(in.ProjectID, func(r *ProjectRecord) error {
		if r.ProjectName == "" {
			r.ProjectName = in.ProjectName
		}
		if r.CurrentMandateID == "" {
			r.CurrentMandateID = in.ExpectedPreviousMandateID
			r.Attempts = append(r.Attempts, Attempt{MandateID: in.ExpectedPreviousMandateID, Kind: "legacy", RelationshipStatus: "current", CreatedAt: s.now().Format(time.RFC3339Nano)})
		}
		if r.CurrentMandateID != in.ExpectedPreviousMandateID {
			return fail("STALE_CURRENT_MANDATE", "el Mandate esperado ya no es el vigente")
		}
		if r.PendingRecovery != nil {
			p := r.PendingRecovery
			if p.RecoveryRequestID != in.RecoveryRequestID {
				return fail("RECOVERY_IN_PROGRESS", "otro recovery está pendiente")
			}
			if p.ExpectedPreviousMandateID != in.ExpectedPreviousMandateID || p.ProjectName != in.ProjectName || p.Source != in.Source {
				return fail("RECOVERY_REQUEST_CONFLICT", "recoveryRequestId reutilizado con argumentos distintos")
			}
			result = &PrepareResult{true, true, in.ProjectID, p.ProjectName, p.Source, p.ExpectedPreviousMandateID, p.RecoveryRequestID, p.MandateLaunchID}
			return ErrNoChange
		}
		launchID := uuid.NewString()
		r.PendingRecovery = &PendingRecovery{RecoveryRequestID: in.RecoveryRequestID, ExpectedPreviousMandateID: in.ExpectedPreviousMandateID, MandateLaunchID: launchID, ProjectName: in.ProjectName, Source: in.Source, PreparedAt: s.now().Format(time.RFC3339Nano)}
		result = &PrepareResult{true, false, in.ProjectID, in.ProjectName, in.Source, in.ExpectedPreviousMandateID, in.RecoveryRequestID, launchID}
		return nil
	})
	return result, err
}

func (s *Service) Acknowledge(projectID, recoveryRequestID, genesisLaunchID, mandateID string) (*ProjectRecord, error) {
	if err := s.verifyMandateProject(mandateID, projectID); err != nil {
		return nil, err
	}
	err := s.Store.WithLock(projectID, func(r *ProjectRecord) error {
		if r.PendingRecovery == nil {
			if r.CurrentMandateID == mandateID {
				return ErrNoChange
			}
			return fail("RECOVERY_ACK_CONFLICT", "no existe recovery pendiente correlacionado")
		}
		p := r.PendingRecovery
		if p.RecoveryRequestID != recoveryRequestID || p.MandateLaunchID != genesisLaunchID {
			return fail("RECOVERY_ACK_CONFLICT", "identidades de acknowledge no coinciden")
		}
		for i := range r.Attempts {
			if r.Attempts[i].MandateID == r.CurrentMandateID {
				r.Attempts[i].RelationshipStatus = "superseded"
				r.Attempts[i].SupersededByMandateID = mandateID
				r.Attempts[i].SupersededAt = s.now().Format(time.RFC3339Nano)
			}
		}
		r.Attempts = append(r.Attempts, Attempt{MandateID: mandateID, MandateLaunchID: genesisLaunchID, Kind: "contract_v1", RelationshipStatus: "current", CreatedAt: p.PreparedAt, AcknowledgedAt: s.now().Format(time.RFC3339Nano), RecoveryRequestID: recoveryRequestID})
		r.CurrentMandateID = mandateID
		r.PendingRecovery = nil
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Store.Load(projectID)
}

func (s *Service) AdoptInitial(projectID, projectName, genesisLaunchID, mandateID string) (*ProjectRecord, error) {
	if err := s.verifyMandateProject(mandateID, projectID); err != nil {
		return nil, err
	}
	err := s.Store.WithLock(projectID, func(r *ProjectRecord) error {
		if r.CurrentMandateID != "" && r.CurrentMandateID != mandateID {
			return fail("PROJECT_GENESIS_CONFLICT", "el proyecto ya tiene otro Genesis vigente")
		}
		for _, attempt := range r.Attempts {
			if attempt.MandateID == mandateID {
				return ErrNoChange
			}
		}
		r.ProjectName = projectName
		r.CurrentMandateID = mandateID
		r.Attempts = append(r.Attempts, Attempt{MandateID: mandateID, MandateLaunchID: genesisLaunchID, Kind: "contract_v1", RelationshipStatus: "current", CreatedAt: s.now().Format(time.RFC3339Nano), AcknowledgedAt: s.now().Format(time.RFC3339Nano)})
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.Store.Load(projectID)
}

func ErrorCode(err error) string {
	var e *ContractError
	if errors.As(err, &e) {
		return e.Code
	}
	return "GENESIS_RECOVERY_FAILED"
}
