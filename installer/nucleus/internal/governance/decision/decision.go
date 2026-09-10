package decision

import (
	"errors"
	"fmt"
	"nucleus/internal/authority"
	"nucleus/internal/core"
	ownershipcontract "nucleus/internal/governance/ownershipcontract"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type AuthorityMode string

const ModeLocalLegacy AuthorityMode = "local_legacy"
const ModeShadowRemote AuthorityMode = "shadow_remote"

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
	shadow                *authority.ShadowRecord
}

func (d GovernedCreationDecision) Operation() GovernedOperation { return d.operation }
func (d GovernedCreationDecision) GravityRoot() string          { return d.gravityRoot }
func (d GovernedCreationDecision) NodeID() string               { return d.nodeID }
func (d GovernedCreationDecision) Basis() DecisionBasis         { return d.basis }
func (d GovernedCreationDecision) DecidedAt() time.Time         { return d.decidedAt }
func (d GovernedCreationDecision) ShadowEvidence() *authority.ShadowRecord {
	if d.shadow == nil {
		return nil
	}
	copy := *d.shadow
	return &copy
}

func (d GovernedCreationDecision) ParentID() *string {
	return cloneStringPointer(d.parentID)
}

func (d GovernedCreationDecision) ParentObservedVersion() *uint64 {
	return cloneUint64Pointer(d.parentObservedVersion)
}

func EffectiveAuthorityMode() (AuthorityMode, error) {
	return ModeLocalLegacy, nil
}

type RemoteEvaluator interface {
	Evaluate(authority.DecisionRequest) authority.AuthorityDecision
}
type ShadowConfiguration struct {
	Evaluator   RemoteEvaluator
	Request     func(GovernedOperation, string, *string, *uint64) authority.DecisionRequest
	Sink        authority.ShadowSink
	Now         func() time.Time
	CommittedAt func(authority.AuthorityDecision) time.Time
	Connected   bool
}

var shadowState struct {
	sync.RWMutex
	configuration *ShadowConfiguration
}

// InstallShadow enables observation only. It cannot change EffectiveAuthorityMode and
// returns a cleanup closure so tests and callers cannot accidentally retain a config.
func InstallShadow(configuration *ShadowConfiguration) func() {
	shadowState.Lock()
	previous := shadowState.configuration
	shadowState.configuration = configuration
	shadowState.Unlock()
	return func() { shadowState.Lock(); shadowState.configuration = previous; shadowState.Unlock() }
}
func currentShadow() *ShadowConfiguration {
	shadowState.RLock()
	defer shadowState.RUnlock()
	if shadowState.configuration == nil {
		return nil
	}
	copy := *shadowState.configuration
	return &copy
}

func AuthorizeGravityNodeCreation(operation GovernedOperation, nodeID string, parentID *string, parentObservedVersion *uint64) (GovernedCreationDecision, error) {
	local, localErr := authorizeGravityNodeCreationLocal(operation, nodeID, parentID, parentObservedVersion)
	configuration := currentShadow()
	if configuration == nil {
		return local, localErr
	}
	now := time.Now().UTC()
	if configuration.Now != nil {
		now = configuration.Now().UTC()
	}
	remote := authority.AuthorityDecision{Outcome: authority.DecisionNotEvaluable, Reason: "state_unavailable", Operation: string(operation), EvaluatedAt: now}
	if configuration.Evaluator != nil && configuration.Request != nil {
		remote = configuration.Evaluator.Evaluate(configuration.Request(operation, nodeID, parentID, parentObservedVersion))
	} else if configuration.Request == nil {
		remote.Reason = "operation_permission_unmapped"
	}
	committed := now
	if configuration.CommittedAt != nil {
		committed = configuration.CommittedAt(remote)
	}
	value, err, record := authority.PreserveShadow(local, localErr, remote, authority.ShadowInput{Operation: string(operation), Class: operationClass(operation), CommittedAt: committed, ObservedAt: now, Connected: configuration.Connected}, configuration.Sink)
	if localErr == nil {
		value.shadow = &record
	}
	return value, err
}

func authorizeGravityNodeCreationLocal(operation GovernedOperation, nodeID string, parentID *string, parentObservedVersion *uint64) (GovernedCreationDecision, error) {
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
	analysis, err := ownershipcontract.Analyze(ownershipRaw)
	if err != nil {
		return GovernedCreationDecision{}, fmt.Errorf("validate local legacy ownership: %w", err)
	}
	view, err := ownershipcontract.EffectiveLegacyView(analysis)
	if err != nil {
		return GovernedCreationDecision{}, fmt.Errorf("resolve local legacy authority: %w", err)
	}
	if view.Owner.Subject == "" {
		return GovernedCreationDecision{}, errors.New("local legacy ownership has no owner subject")
	}
	if view.MarkersDeclared && !contains(view.Markers, "master") {
		return GovernedCreationDecision{}, errors.New("canonical ownership does not declare the master marker")
	}
	masterPath := filepath.Join(nucleusRoot, ".master")
	masterInfo, err := os.Lstat(masterPath)
	if err != nil {
		return GovernedCreationDecision{}, fmt.Errorf("inspect local legacy master marker: %w", err)
	}
	if !masterInfo.Mode().IsRegular() {
		return GovernedCreationDecision{}, errors.New("local legacy master marker is not a regular file")
	}
	marker, err := os.ReadFile(masterPath)
	if err != nil || string(marker) != "master" {
		return GovernedCreationDecision{}, errors.New("local legacy master marker contains incompatible state")
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

func operationClass(operation GovernedOperation) authority.OperationClass {
	if operation == OpCreateOrganization {
		return authority.ClassCritical
	}
	return authority.ClassPrivileged
}

func contains(values []string, wanted string) bool {
	for _, value := range values {
		if value == wanted {
			return true
		}
	}
	return false
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
