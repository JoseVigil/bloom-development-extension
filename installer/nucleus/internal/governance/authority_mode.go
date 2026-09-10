package governance

import authoritydecision "nucleus/internal/governance/decision"

type AuthorityMode = authoritydecision.AuthorityMode

const ModeLocalLegacy = authoritydecision.ModeLocalLegacy
const ModeShadowRemote = authoritydecision.ModeShadowRemote

type GovernedOperation = authoritydecision.GovernedOperation

const (
	OpCreateOrganization = authoritydecision.OpCreateOrganization
	OpCreateProject      = authoritydecision.OpCreateProject
)

type DecisionBasis = authoritydecision.DecisionBasis

const BasisLocalLegacy = authoritydecision.BasisLocalLegacy

type GovernedCreationDecision = authoritydecision.GovernedCreationDecision
type ShadowConfiguration = authoritydecision.ShadowConfiguration

func EffectiveAuthorityMode() (AuthorityMode, error) {
	return authoritydecision.EffectiveAuthorityMode()
}

func InstallAuthorityShadow(configuration *ShadowConfiguration) func() {
	return authoritydecision.InstallShadow(configuration)
}

func AuthorizeGravityNodeCreation(operation GovernedOperation, nodeID string, parentID *string, parentObservedVersion *uint64) (GovernedCreationDecision, error) {
	return authoritydecision.AuthorizeGravityNodeCreation(operation, nodeID, parentID, parentObservedVersion)
}
