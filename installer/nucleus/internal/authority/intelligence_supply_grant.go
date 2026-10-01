package authority

import (
	"errors"
	"time"
)

var ErrIntelligenceSupplyGrantDenied = errors.New("INTELLIGENCE_SUPPLY_GRANT_DENIED")

type IntelligenceSupplyGrantStatus string

const (
	IntelligenceSupplyGrantActive      IntelligenceSupplyGrantStatus = "active"
	IntelligenceSupplyGrantNotYetValid IntelligenceSupplyGrantStatus = "not_yet_valid"
	IntelligenceSupplyGrantExpired     IntelligenceSupplyGrantStatus = "expired"
	IntelligenceSupplyGrantRevoked     IntelligenceSupplyGrantStatus = "revoked"
	IntelligenceSupplyGrantReplaced    IntelligenceSupplyGrantStatus = "replaced"
)

// IntelligenceSupplyGrantEvidence is a detached view of Authority-accepted
// state. Limits are declared ceilings only; Nucleus does not consume them in N1.
type IntelligenceSupplyGrantEvidence struct {
	GrantID              string                          `json:"grant_id"`
	OrganizationID       string                          `json:"organization_id"`
	InstallationIDs      []string                        `json:"installation_ids"`
	ConsumerID           string                          `json:"consumer_id"`
	ActorPrincipalID     string                          `json:"actor_principal_id"`
	MembershipIDs        []string                        `json:"membership_ids"`
	Purpose              string                          `json:"purpose"`
	AllowedCapabilities  []string                        `json:"allowed_capabilities"`
	AllowedPrivacy       []string                        `json:"allowed_privacy"`
	AllowedDestinations  []IntelligenceSupplyDestination `json:"allowed_destinations"`
	Limits               IntelligenceSupplyLimits        `json:"limits"`
	IssuedByPrincipalID  string                          `json:"issued_by_principal_id"`
	ValidFrom            time.Time                       `json:"valid_from"`
	ValidUntil           time.Time                       `json:"valid_until"`
	ReplacesGrantID      *string                         `json:"replaces_grant_id"`
	ReplacedByGrantID    *string                         `json:"replaced_by_grant_id"`
	Status               IntelligenceSupplyGrantStatus   `json:"status"`
	AuthorityVersion     string                          `json:"authority_version"`
	AuthorityStateDigest string                          `json:"authority_state_digest"`
}

// ResolveIntelligenceSupplyGrant resolves one grant solely from the accepted
// Store/checkpoint pair. Non-active evidence is returned with a denial error so
// callers can report state without treating it as authorization.
func ResolveIntelligenceSupplyGrant(store *Store, checkpoint *CheckpointStore, organizationID, installationID, grantID string, at time.Time) (IntelligenceSupplyGrantEvidence, error) {
	deny := func(e IntelligenceSupplyGrantEvidence) (IntelligenceSupplyGrantEvidence, error) {
		return e, ErrIntelligenceSupplyGrantDenied
	}
	if store == nil || checkpoint == nil || organizationID == "" || installationID == "" || grantID == "" || at.IsZero() {
		return deny(IntelligenceSupplyGrantEvidence{})
	}
	state, err := (DecisionEvaluator{Store: store, Checkpoint: checkpoint}).load()
	if err != nil || state == nil || state.Emission == nil || state.Emission.SchemaVersion != "1.1" || state.Projection.IntelligenceSupplyGrants == nil {
		return deny(IntelligenceSupplyGrantEvidence{})
	}
	if state.Binding.OrganizationID != organizationID || state.Binding.InstallationID != installationID || state.Emission.OrganizationID != organizationID || at.Before(state.Emission.NotBefore) || !at.Before(state.Emission.ExpiresAt) {
		return deny(IntelligenceSupplyGrantEvidence{})
	}
	var grant *IntelligenceSupplyGrant
	for i := range *state.Projection.IntelligenceSupplyGrants {
		candidate := &(*state.Projection.IntelligenceSupplyGrants)[i]
		if candidate.GrantID == grantID {
			grant = candidate
			break
		}
	}
	if grant == nil || grant.OrganizationID != organizationID || !containsString(grant.InstallationIDs, installationID) {
		return deny(IntelligenceSupplyGrantEvidence{})
	}
	evidence := detachedIntelligenceGrant(*grant)
	evidence.AuthorityVersion = state.Monotonic.HighWaterMark
	evidence.AuthorityStateDigest = state.Monotonic.StateDigest
	principalActive := false
	for _, principal := range state.Projection.Principals {
		if principal.PrincipalID == grant.ActorPrincipalID && principal.PrincipalType == "human" && principal.Status == "active" {
			principalActive = true
		}
	}
	for _, membership := range state.Projection.Memberships {
		if membership.PrincipalID == grant.ActorPrincipalID && membership.OrganizationID == organizationID && membership.Status == "active" && !at.Before(membership.ValidFrom) && (membership.ValidUntil == nil || at.Before(*membership.ValidUntil)) && !isRevoked(state.Projection.Revocations, "membership", membership.MembershipID, at) {
			evidence.MembershipIDs = append(evidence.MembershipIDs, membership.MembershipID)
		}
	}
	if !principalActive || len(evidence.MembershipIDs) == 0 {
		return deny(evidence)
	}
	if at.Before(grant.ValidFrom) {
		evidence.Status = IntelligenceSupplyGrantNotYetValid
		return deny(evidence)
	}
	if !at.Before(grant.ValidUntil) {
		evidence.Status = IntelligenceSupplyGrantExpired
		return deny(evidence)
	}
	for _, candidate := range *state.Projection.IntelligenceSupplyGrants {
		if candidate.ReplacesGrantID != nil && *candidate.ReplacesGrantID == grantID && !at.Before(candidate.ValidFrom) && hasEffectiveRevocation(state.Projection.Revocations, "intelligence_supply_grant", grantID, at) {
			id := candidate.GrantID
			evidence.ReplacedByGrantID = &id
			evidence.Status = IntelligenceSupplyGrantReplaced
			return deny(evidence)
		}
	}
	if hasEffectiveRevocation(state.Projection.Revocations, "intelligence_supply_grant", grantID, at) {
		evidence.Status = IntelligenceSupplyGrantRevoked
		return deny(evidence)
	}
	evidence.Status = IntelligenceSupplyGrantActive
	return evidence, nil
}

func detachedIntelligenceGrant(grant IntelligenceSupplyGrant) IntelligenceSupplyGrantEvidence {
	destinations := make([]IntelligenceSupplyDestination, len(grant.AllowedDestinations))
	for i, destination := range grant.AllowedDestinations {
		destinations[i] = destination
		destinations[i].Models = append([]string(nil), destination.Models...)
	}
	evidence := IntelligenceSupplyGrantEvidence{
		GrantID: grant.GrantID, OrganizationID: grant.OrganizationID,
		InstallationIDs: append([]string(nil), grant.InstallationIDs...), ConsumerID: grant.ConsumerID,
		ActorPrincipalID: grant.ActorPrincipalID, MembershipIDs: []string{}, Purpose: grant.Purpose,
		AllowedCapabilities: append([]string(nil), grant.AllowedCapabilities...),
		AllowedPrivacy:      append([]string(nil), grant.AllowedPrivacy...), AllowedDestinations: destinations,
		Limits: grant.Limits, IssuedByPrincipalID: grant.IssuedByPrincipalID,
		ValidFrom: grant.ValidFrom, ValidUntil: grant.ValidUntil,
	}
	if grant.ReplacesGrantID != nil {
		id := *grant.ReplacesGrantID
		evidence.ReplacesGrantID = &id
	}
	return evidence
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func hasEffectiveRevocation(revocations []Revocation, targetType, targetID string, at time.Time) bool {
	for _, revocation := range revocations {
		if revocation.TargetType == targetType && revocation.TargetID == targetID && !at.Before(revocation.EffectiveAt) {
			return true
		}
	}
	return false
}
