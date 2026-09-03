package governance

import authoritydecision "nucleus/internal/governance/decision"

type AuthorityMode = authoritydecision.AuthorityMode

const ModeLocalLegacy = authoritydecision.ModeLocalLegacy

type GovernedOperation = authoritydecision.GovernedOperation

const (
	OpCreateOrganization = authoritydecision.OpCreateOrganization
	OpCreateProject      = authoritydecision.OpCreateProject
)

type DecisionBasis = authoritydecision.DecisionBasis

const BasisLocalLegacy = authoritydecision.BasisLocalLegacy

type GovernedCreationDecision = authoritydecision.GovernedCreationDecision

func EffectiveAuthorityMode() (AuthorityMode, error) {
	return authoritydecision.EffectiveAuthorityMode()
}

func AuthorizeGravityNodeCreation(operation GovernedOperation, nodeID string, parentID *string, parentObservedVersion *uint64) (GovernedCreationDecision, error) {
	return authoritydecision.AuthorizeGravityNodeCreation(operation, nodeID, parentID, parentObservedVersion)
}
