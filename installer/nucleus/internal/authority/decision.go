package authority

import (
	"errors"
	"github.com/gofrs/flock"
	"os"
	"sort"
	"time"
)

type DecisionOutcome string

const (
	DecisionAllow        DecisionOutcome = "allow"
	DecisionDeny         DecisionOutcome = "deny"
	DecisionNotEvaluable DecisionOutcome = "not_evaluable"
)

type ControlEvidence struct {
	Present  bool   `json:"present"`
	Allowed  bool   `json:"allowed"`
	Revision string `json:"revision"`
}

type DecisionRequest struct {
	Operation        string                     `json:"operation"`
	PrincipalID      string                     `json:"principal_id"`
	Scope            Scope                      `json:"scope"`
	RequiredControls []string                   `json:"required_controls"`
	Controls         map[string]ControlEvidence `json:"controls"`
	At               time.Time                  `json:"at"`
}

type AuthorityDecision struct {
	Outcome          DecisionOutcome `json:"outcome"`
	Reason           string          `json:"reason"`
	Operation        string          `json:"operation"`
	PrincipalID      string          `json:"principal_id"`
	Scope            Scope           `json:"scope"`
	AuthorityVersion string          `json:"authority_version,omitempty"`
	StateDigest      string          `json:"state_digest,omitempty"`
	EvaluatedAt      time.Time       `json:"evaluated_at"`
	ControlRevisions []string        `json:"control_revisions"`
}

type DecisionEvaluator struct {
	Store      *Store
	Checkpoint *CheckpointStore
	Manifest   *VerifiedTrustManifest
	Now        func() time.Time
	state      *DurableState // package-private fixture; production must load the accepted pair.
}

func (e DecisionEvaluator) Evaluate(request DecisionRequest) AuthorityDecision {
	now := request.At.UTC()
	if now.IsZero() {
		now = time.Now().UTC()
		if e.Now != nil {
			now = e.Now().UTC()
		}
	}
	decision := AuthorityDecision{Outcome: DecisionNotEvaluable, Reason: "state_unavailable", Operation: request.Operation, PrincipalID: request.PrincipalID, Scope: request.Scope, EvaluatedAt: now, ControlRevisions: []string{}}
	state, err := e.load()
	if err != nil || state == nil {
		return decision
	}
	decision.AuthorityVersion = state.Monotonic.HighWaterMark
	decision.StateDigest = state.Monotonic.StateDigest
	if state.Emission == nil || now.Before(state.Emission.NotBefore) {
		decision.Reason = "state_not_yet_valid"
		return decision
	}
	if !now.Before(state.Emission.ExpiresAt) {
		decision.Outcome = DecisionDeny
		decision.Reason = "state_expired"
		return decision
	}
	if request.PrincipalID == "" {
		decision.Reason = "principal_required"
		return decision
	}
	if _, ok := PermissionsV1[request.Operation]; !ok {
		decision.Reason = "operation_permission_unmapped"
		return decision
	}
	if _, ok := ScopeTypes[request.Scope.Type]; !ok || request.Scope.ID == "" {
		decision.Reason = "scope_invalid"
		return decision
	}
	if request.Scope.Type == "organization" && request.Scope.ID != state.Binding.OrganizationID {
		decision.Outcome = DecisionDeny
		decision.Reason = "scope_outside_binding"
		return decision
	}

	required := append([]string(nil), request.RequiredControls...)
	sort.Strings(required)
	for index, name := range required {
		if name == "" || (index > 0 && name == required[index-1]) {
			decision.Reason = "required_controls_invalid"
			return decision
		}
		control, ok := request.Controls[name]
		if !ok || !control.Present || control.Revision == "" {
			decision.Reason = "required_control_absent:" + name
			return decision
		}
		decision.ControlRevisions = append(decision.ControlRevisions, name+":"+control.Revision)
		if !control.Allowed {
			decision.Outcome = DecisionDeny
			decision.Reason = "required_control_denied:" + name
			return decision
		}
	}

	principal := findPrincipal(state.Projection.Principals, request.PrincipalID)
	if principal == nil || principal.Status != "active" || isRevoked(state.Projection.Revocations, "principal", request.PrincipalID, now) {
		decision.Outcome = DecisionDeny
		decision.Reason = "principal_inactive"
		return decision
	}
	if principal.PrincipalType == "human" && !hasVerifiedExternalIdentity(*principal, now) {
		decision.Outcome = DecisionDeny
		decision.Reason = "principal_identity_unverified"
		return decision
	}
	roleEvidenceMissing := false
	for _, membership := range state.Projection.Memberships {
		if membership.PrincipalID != request.PrincipalID || membership.OrganizationID != state.Binding.OrganizationID || membership.Status != "active" || now.Before(membership.ValidFrom) || (membership.ValidUntil != nil && !now.Before(*membership.ValidUntil)) || now.Before(membership.AcceptedAt) || isRevoked(state.Projection.Revocations, "membership", membership.MembershipID, now) {
			continue
		}
		for _, assignment := range state.Projection.RoleAssignments {
			if assignment.MembershipID != membership.MembershipID || assignment.Status != "active" || now.Before(assignment.ValidFrom) || (assignment.ValidUntil != nil && !now.Before(*assignment.ValidUntil)) || now.Before(assignment.AcceptedAt) || isRevoked(state.Projection.Revocations, "role_assignment", assignment.AssignmentID, now) || !scopeIncludes(assignment.Scope, request.Scope) {
				continue
			}
			role := findRole(state.Projection.RoleDefinitions, assignment.RoleID, assignment.RoleVersion)
			if role == nil || role.Status != "active" || isRevoked(state.Projection.Revocations, "role_definition", roleKey(assignment.RoleID, assignment.RoleVersion), now) || isRevoked(state.Projection.Revocations, "role_definition", assignment.RoleID, now) || ValidateRoleDefinition(*role) != nil {
				roleEvidenceMissing = true
				continue
			}
			for _, permission := range role.Permissions {
				if permission == request.Operation {
					decision.Outcome = DecisionAllow
					decision.Reason = "permission_granted"
					return decision
				}
			}
		}
	}
	if roleEvidenceMissing {
		decision.Reason = "referenced_role_unavailable"
		return decision
	}
	decision.Outcome = DecisionDeny
	decision.Reason = "permission_not_granted"
	return decision
}

func (e DecisionEvaluator) load() (*DurableState, error) {
	if e.state != nil {
		return e.state, nil
	}
	if e.Store == nil || e.Store.Path == "" || e.Checkpoint == nil {
		return nil, errors.New("accepted authority state and checkpoint required")
	}
	lock := flock.New(e.Store.Path + ".lock")
	if err := lock.Lock(); err != nil {
		return nil, err
	}
	defer lock.Unlock()
	if err := e.Checkpoint.recoverLocked(e.Store); err != nil {
		return nil, err
	}
	state, err := e.Store.Load()
	if os.IsNotExist(err) {
		return nil, err
	}
	if err == nil {
		_, err = e.Checkpoint.validateLocked(e.Store, state, e.Manifest)
	}
	return state, err
}
func findPrincipal(values []Principal, id string) *Principal {
	for index := range values {
		if values[index].PrincipalID == id {
			return &values[index]
		}
	}
	return nil
}
func findRole(values []RoleDefinition, id, version string) *RoleDefinition {
	for index := range values {
		if values[index].RoleID == id && values[index].RoleVersion == version {
			return &values[index]
		}
	}
	return nil
}
func isRevoked(values []Revocation, kind, id string, at time.Time) bool {
	for _, value := range values {
		if value.TargetType == kind && value.TargetID == id && !at.Before(value.EffectiveAt) {
			return true
		}
	}
	return false
}
func hasVerifiedExternalIdentity(principal Principal, at time.Time) bool {
	for _, identity := range principal.ExternalIdentities {
		if identity.Status == "verified" && !identity.VerifiedAt.After(at) {
			return true
		}
	}
	return false
}
func scopeIncludes(grant, requested Scope) bool { return grant == requested }
