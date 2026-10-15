package genesisrecovery

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/gofrs/flock"
)

const SchemaVersion = 1

var ErrNoChange = errors.New("genesis project record unchanged")

type Attempt struct {
	MandateID             string `json:"mandateId"`
	MandateLaunchID       string `json:"mandateLaunchId,omitempty"`
	Kind                  string `json:"kind"`
	RelationshipStatus    string `json:"relationshipStatus"`
	CreatedAt             string `json:"createdAt"`
	AcknowledgedAt        string `json:"acknowledgedAt,omitempty"`
	SupersededAt          string `json:"supersededAt,omitempty"`
	SupersededByMandateID string `json:"supersededByMandateId,omitempty"`
	RecoveryRequestID     string `json:"recoveryRequestId,omitempty"`
}

type PendingRecovery struct {
	RecoveryRequestID         string `json:"recoveryRequestId"`
	ExpectedPreviousMandateID string `json:"expectedPreviousMandateId"`
	MandateLaunchID           string `json:"mandateLaunchId"`
	ProjectName               string `json:"projectName"`
	Source                    string `json:"source"`
	PreparedAt                string `json:"preparedAt"`
}

type ProjectRecord struct {
	SchemaVersion    int              `json:"schemaVersion"`
	ProjectID        string           `json:"projectId"`
	ProjectName      string           `json:"projectName"`
	Revision         int64            `json:"revision"`
	CurrentMandateID string           `json:"currentMandateId,omitempty"`
	PendingRecovery  *PendingRecovery `json:"pendingRecovery,omitempty"`
	Attempts         []Attempt        `json:"attempts"`
}

type Store struct{ Root string }

func NewStore(nucleusRoot string) *Store {
	return &Store{Root: filepath.Join(nucleusRoot, ".core", "genesis-projects")}
}

func (s *Store) path(projectID string) string { return filepath.Join(s.Root, projectID+".json") }

func (s *Store) WithLock(projectID string, fn func(*ProjectRecord) error) error {
	if err := os.MkdirAll(s.Root, 0700); err != nil {
		return err
	}
	lock := flock.New(s.path(projectID) + ".lock")
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	locked, err := lock.TryLockContext(ctx, 25*time.Millisecond)
	if err != nil {
		return err
	}
	if !locked {
		return fmt.Errorf("GENESIS_PROJECT_BUSY")
	}
	defer lock.Unlock()
	record, err := s.Load(projectID)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if record == nil {
		record = &ProjectRecord{SchemaVersion: SchemaVersion, ProjectID: projectID, Attempts: []Attempt{}}
	}
	if err := fn(record); err != nil {
		if errors.Is(err, ErrNoChange) {
			return nil
		}
		return err
	}
	record.SchemaVersion = SchemaVersion
	record.Revision++
	return s.save(record)
}

func (s *Store) Load(projectID string) (*ProjectRecord, error) {
	raw, err := os.ReadFile(s.path(projectID))
	if err != nil {
		return nil, err
	}
	var record ProjectRecord
	if err := json.Unmarshal(raw, &record); err != nil {
		return nil, fmt.Errorf("PROJECT_GENESIS_STATE_INVALID: %w", err)
	}
	// Existing project records used genesisLaunchId. Read them without changing
	// the stored file; the next authorized write emits mandateLaunchId.
	var legacy struct {
		PendingRecovery *struct {
			GenesisLaunchID string `json:"genesisLaunchId"`
		} `json:"pendingRecovery"`
		Attempts []struct {
			GenesisLaunchID string `json:"genesisLaunchId"`
		} `json:"attempts"`
	}
	if err := json.Unmarshal(raw, &legacy); err != nil {
		return nil, fmt.Errorf("PROJECT_GENESIS_STATE_INVALID: %w", err)
	}
	if record.PendingRecovery != nil && record.PendingRecovery.MandateLaunchID == "" && legacy.PendingRecovery != nil {
		record.PendingRecovery.MandateLaunchID = legacy.PendingRecovery.GenesisLaunchID
	}
	for i := range record.Attempts {
		if record.Attempts[i].MandateLaunchID == "" && i < len(legacy.Attempts) {
			record.Attempts[i].MandateLaunchID = legacy.Attempts[i].GenesisLaunchID
		}
	}
	if record.SchemaVersion != SchemaVersion || record.ProjectID != projectID {
		return nil, fmt.Errorf("PROJECT_GENESIS_STATE_INVALID")
	}
	return &record, nil
}

func (s *Store) save(record *ProjectRecord) error {
	raw, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path(record.ProjectID) + fmt.Sprintf(".tmp-%d", os.Getpid())
	if err := os.WriteFile(tmp, raw, 0600); err != nil {
		return err
	}
	if err := os.Rename(tmp, s.path(record.ProjectID)); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}
