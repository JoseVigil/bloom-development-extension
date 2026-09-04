package governance

import ownershipcontract "nucleus/internal/governance/ownershipcontract"

const (
	OwnershipSchema        = ownershipcontract.SchemaName
	OwnershipSchemaVersion = ownershipcontract.SchemaVersion
)

type OwnershipAuthorityMode = ownershipcontract.AuthorityMode

const (
	AuthorityLocalLegacy    = ownershipcontract.AuthorityModeLocalLegacy
	AuthorityShadowRemote   = ownershipcontract.AuthorityModeShadowRemote
	AuthorityRemoteEnforced = ownershipcontract.AuthorityModeRemoteEnforced
)

type BindingState = ownershipcontract.BindingState

const (
	BindingUnbound      = ownershipcontract.BindingStateUnbound
	BindingPending      = ownershipcontract.BindingStatePending
	BindingBound        = ownershipcontract.BindingStateBound
	BindingDivergent    = ownershipcontract.BindingStateDivergent
	BindingRemoteLocked = ownershipcontract.BindingStateRemoteLocked
)

type OwnershipOrganization = ownershipcontract.Organization
type OwnershipInstallation = ownershipcontract.Installation
type OwnershipBinding = ownershipcontract.Binding
type TrustBinding = ownershipcontract.TrustBinding
type LegacyOwner = ownershipcontract.LegacyOwner
type LegacyAuthority = ownershipcontract.LegacyAuthority
type OwnershipMigration = ownershipcontract.Migration
type CanonicalOwnership = ownershipcontract.Document

func ValidateCanonicalOwnership(document *CanonicalOwnership) error {
	return ownershipcontract.Validate(document)
}
