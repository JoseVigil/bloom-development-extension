package decision

import (
	"encoding/json"
	"errors"
	"fmt"
	"nucleus/internal/core"
	"os"
	"path/filepath"
	"time"
)

type AuthorityMode string

const ModeLocalLegacy AuthorityMode = "local_legacy"

type GovernedOperation string

const (
	OpCreateOrganization GovernedOperation = "create_organization"
	OpCreateProject      GovernedOperation = "create_project"
)

type DecisionBasis string

const BasisLocalLegacy DecisionBasis = "local_legacy"

// GovernedCreationDecision is sealed: its zero value is invalid, and only
// this package can populate its fields after local-legacy verification.
type GovernedCreationDecision struct {
	operation             GovernedOperation
	gravityRoot           string
	nodeID                string
	parentID              *string
	parentObservedVersion *uint64
	basis                 DecisionBasis
	decidedAt             time.Time
}

func (d GovernedCreationDecision) Operation() GovernedOperation { return d.operation }
func (d GovernedCreationDecision) GravityRoot() string          { return d.gravityRoot }
func (d GovernedCreationDecision) NodeID() string               { return d.nodeID }
func (d GovernedCreationDecision) Basis() DecisionBasis         { return d.basis }
func (d GovernedCreationDecision) DecidedAt() time.Time         { return d.decidedAt }

func (d GovernedCreationDecision) ParentID() *string {
	return cloneStringPointer(d.parentID)
}

func (d GovernedCreationDecision) ParentObservedVersion() *uint64 {
	return cloneUint64Pointer(d.parentObservedVersion)
}

func EffectiveAuthorityMode() (AuthorityMode, error) {
	return ModeLocalLegacy, nil
}

func AuthorizeGravityNodeCreation(operation GovernedOperation, nodeID string, parentID *string, parentObservedVersion *uint64) (GovernedCreationDecision, error) {
	mode, err := EffectiveAuthorityMode()
	if err != nil {
		return GovernedCreationDecision{}, err
	}
	if mode != ModeLocalLegacy {
		return GovernedCreationDecision{}, fmt.Errorf("authority mode %q does not permit local legacy creation", mode)
	}
	if operation != OpCreateOrganization && operation != OpCreateProject {
		return GovernedCreationDecision{}, fmt.Errorf("unsupported governed operation %q", operation)
	}
	if nodeID == "" {
		return GovernedCreationDecision{}, errors.New("nodeID is required")
	}
	if operation == OpCreateOrganization && (parentID != nil || parentObservedVersion != nil) {
		return GovernedCreationDecision{}, errors.New("create_organization does not accept an explicit parent or parent version")
	}
	if operation == OpCreateProject && (parentID == nil || *parentID == "" || parentObservedVersion == nil) {
		return GovernedCreationDecision{}, errors.New("create_project requires parentID and parentObservedVersion")
	}

	nucleusRoot, err := core.ResolveNucleusRoot("")
	if err != nil {
		return GovernedCreationDecision{}, fmt.Errorf("resolve active Nucleus root: %w", err)
	}
	ownershipRaw, err := os.ReadFile(filepath.Join(nucleusRoot, ".ownership.json"))
	if err != nil {
		return GovernedCreationDecision{}, fmt.Errorf("read local legacy ownership: %w", err)
	}
	var ownership struct {
		OrgID     string    `json:"org_id"`
		OwnerID   string    `json:"owner_id"`
		CreatedAt time.Time `json:"created_at"`
	}
	if err := json.Unmarshal(ownershipRaw, &ownership); err != nil {
		return GovernedCreationDecision{}, fmt.Errorf("parse local legacy ownership: %w", err)
	}
	if ownership.OrgID == "" || ownership.OwnerID == "" || ownership.CreatedAt.IsZero() {
		return GovernedCreationDecision{}, errors.New("local legacy ownership is missing required fields")
	}
	masterInfo, err := os.Stat(filepath.Join(nucleusRoot, ".master"))
	if err != nil {
		return GovernedCreationDecision{}, fmt.Errorf("inspect local legacy master marker: %w", err)
	}
	if !masterInfo.Mode().IsRegular() {
		return GovernedCreationDecision{}, errors.New("local legacy master marker is not a regular file")
	}
	gravityRoot, err := filepath.Abs(filepath.Join(nucleusRoot, ".gravity"))
	if err != nil {
		return GovernedCreationDecision{}, fmt.Errorf("resolve Gravity root: %w", err)
	}
	return GovernedCreationDecision{
		operation:             operation,
		gravityRoot:           gravityRoot,
		nodeID:                nodeID,
		parentID:              cloneStringPointer(parentID),
		parentObservedVersion: cloneUint64Pointer(parentObservedVersion),
		basis:                 BasisLocalLegacy,
		decidedAt:             time.Now().UTC(),
	}, nil
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneUint64Pointer(value *uint64) *uint64 {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
