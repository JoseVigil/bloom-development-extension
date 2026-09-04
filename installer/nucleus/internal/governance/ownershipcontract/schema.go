package ownershipcontract

import (
	"errors"
	"fmt"
	"sort"
	"time"
)

const (
	SchemaName    = "bloom.organization.ownership"
	SchemaVersion = "1.0"
)

type AuthorityMode string

const (
	AuthorityModeLocalLegacy    AuthorityMode = "local_legacy"
	AuthorityModeShadowRemote   AuthorityMode = "shadow_remote"
	AuthorityModeRemoteEnforced AuthorityMode = "remote_enforced"
)

type BindingState string

const (
	BindingStateUnbound      BindingState = "UNBOUND"
	BindingStatePending      BindingState = "BINDING_PENDING"
	BindingStateBound        BindingState = "BOUND"
	BindingStateDivergent    BindingState = "DIVERGENT"
	BindingStateRemoteLocked BindingState = "REMOTE_LOCKED"
)

type SourceFormat string

const (
	SourceCanonical                  SourceFormat = "canonical_v1"
	SourceNucleusGoV0                SourceFormat = "nucleus_go_v0"
	SourceBatcaveTypeScriptV0        SourceFormat = "batcave_typescript_v0"
	SourceSupervisorOwnerV0          SourceFormat = "supervisor_owner_v0"
	SourceGovernanceSpecV2Documented SourceFormat = "governance_spec_v2_documented"
	SourceBatcaveArchitectureV1      SourceFormat = "batcave_architecture_documented_v1"
)

var (
	ErrUnknownFormat              = errors.New("ownership: unknown legacy format")
	ErrAmbiguousFormat            = errors.New("ownership: ambiguous legacy format")
	ErrContradictoryOwnership     = errors.New("ownership: contradictory identity fields")
	ErrUnsupportedSchema          = errors.New("ownership: unsupported schema")
	ErrInvalidModeBinding         = errors.New("ownership: invalid authority mode/binding combination")
	ErrInsufficientLegacyEvidence = errors.New("ownership: insufficient legacy evidence")
	ErrLegacyAuthorityForbidden   = errors.New("ownership: legacy authority forbidden in remote_enforced")
)

type Organization struct {
	CanonicalID   *string `json:"canonical_id"`
	LegacyOrgID   *string `json:"legacy_org_id"`
	LegacyLocator *string `json:"legacy_locator"`
	Slug          *string `json:"slug"`
	DisplayName   *string `json:"display_name"`
}

type Installation struct {
	InstallationID string `json:"installation_id"`
}

type Binding struct {
	State          BindingState `json:"state"`
	IssuerID       *string      `json:"issuer_id"`
	AcceptedAt     *time.Time   `json:"accepted_at"`
	RemoteLockedAt *time.Time   `json:"remote_locked_at"`
}

type TrustBinding struct {
	IssuerID                     string    `json:"issuer_id"`
	TrustAnchorID                string    `json:"trust_anchor_id"`
	TrustAnchorFingerprintSHA256 string    `json:"trust_anchor_fingerprint_sha256"`
	BoundOrganizationID          string    `json:"bound_organization_id"`
	BoundInstallationID          string    `json:"bound_installation_id"`
	AcceptedAt                   time.Time `json:"accepted_at"`
}

type LegacyOwner struct {
	Source      string  `json:"source"`
	Subject     string  `json:"subject"`
	DisplayName *string `json:"display_name"`
}

type LegacyMember struct {
	ID      string    `json:"id"`
	Name    string    `json:"name"`
	Role    string    `json:"role"`
	AddedAt time.Time `json:"added_at"`
	Active  bool      `json:"active"`
}

type LegacyAuthority struct {
	Owner            LegacyOwner    `json:"owner"`
	TeamMembers      []LegacyMember `json:"team_members"`
	EffectiveMarkers []string       `json:"effective_markers"`
}

type Migration struct {
	SourceFormat       SourceFormat `json:"source_format"`
	SourceDigestSHA256 string       `json:"source_digest_sha256"`
	MigratedAt         time.Time    `json:"migrated_at"`
	MigrationID        string       `json:"migration_id"`
}

type Document struct {
	Schema          string           `json:"schema"`
	SchemaVersion   string           `json:"schema_version"`
	AuthorityMode   AuthorityMode    `json:"authority_mode"`
	Organization    Organization     `json:"organization"`
	Installation    Installation     `json:"installation"`
	Binding         Binding          `json:"binding"`
	TrustBinding    *TrustBinding    `json:"trust_binding"`
	LegacyAuthority *LegacyAuthority `json:"legacy_authority"`
	Migration       *Migration       `json:"migration"`
	CreatedAt       time.Time        `json:"created_at"`
	UpdatedAt       time.Time        `json:"updated_at"`
}

type LegacyFacts struct {
	Organization Organization
	Owner        LegacyOwner
	TeamMembers  []LegacyMember
	CreatedAt    time.Time
}

type Analysis struct {
	Source      SourceFormat
	Canonical   *Document
	LegacyFacts *LegacyFacts
}

type NormalizationContext struct {
	InstallationID   string
	MigrationID      string
	SourceDigest     string
	MigratedAt       time.Time
	EffectiveMarkers []string
}

type LegacyAuthorityView struct {
	Mode            AuthorityMode
	Owner           LegacyOwner
	TeamMembers     []LegacyMember
	Markers         []string
	MarkersDeclared bool
}

func Validate(document *Document) error {
	if document == nil || document.Schema != SchemaName || document.SchemaVersion != SchemaVersion {
		return ErrUnsupportedSchema
	}
	if document.Installation.InstallationID == "" || document.CreatedAt.IsZero() || document.UpdatedAt.IsZero() {
		return errors.New("ownership: required fields missing")
	}
	if document.UpdatedAt.Before(document.CreatedAt) {
		return errors.New("ownership: updated_at precedes created_at")
	}
	if err := ValidateModeBinding(document.AuthorityMode, document.Binding, document.LegacyAuthority); err != nil {
		return err
	}
	if document.LegacyAuthority != nil {
		if document.LegacyAuthority.Owner.Source == "" || document.LegacyAuthority.Owner.Subject == "" {
			return errors.New("ownership: canonical legacy owner incomplete")
		}
		if !sort.StringsAreSorted(document.LegacyAuthority.EffectiveMarkers) {
			return errors.New("ownership: effective_markers must be sorted")
		}
		seen := map[string]bool{}
		for _, marker := range document.LegacyAuthority.EffectiveMarkers {
			if marker != "master" && marker != "specialist" {
				return fmt.Errorf("ownership: unknown effective marker %q", marker)
			}
			if seen[marker] {
				return fmt.Errorf("ownership: duplicate effective marker %q", marker)
			}
			seen[marker] = true
		}
	}
	if document.Binding.State == BindingStateBound || document.Binding.State == BindingStateRemoteLocked {
		if document.Organization.CanonicalID == nil || *document.Organization.CanonicalID == "" ||
			document.Binding.IssuerID == nil || *document.Binding.IssuerID == "" ||
			document.Binding.AcceptedAt == nil || document.TrustBinding == nil {
			return errors.New("ownership: bound state requires canonical identity and trust binding")
		}
		t := document.TrustBinding
		if t.IssuerID != *document.Binding.IssuerID ||
			t.BoundOrganizationID != *document.Organization.CanonicalID ||
			t.BoundInstallationID != document.Installation.InstallationID ||
			t.TrustAnchorID == "" || t.TrustAnchorFingerprintSHA256 == "" || t.AcceptedAt.IsZero() {
			return ErrContradictoryOwnership
		}
	}
	if document.Binding.State == BindingStateRemoteLocked && document.Binding.RemoteLockedAt == nil {
		return errors.New("ownership: REMOTE_LOCKED requires remote_locked_at")
	}
	return nil
}

func ValidateModeBinding(mode AuthorityMode, binding Binding, legacy *LegacyAuthority) error {
	valid := false
	switch mode {
	case AuthorityModeLocalLegacy:
		valid = legacy != nil && (binding.State == BindingStateUnbound || binding.State == BindingStatePending || binding.State == BindingStateBound || binding.State == BindingStateDivergent)
	case AuthorityModeShadowRemote:
		valid = legacy != nil && (binding.State == BindingStateBound || binding.State == BindingStateDivergent)
	case AuthorityModeRemoteEnforced:
		valid = legacy == nil && (binding.State == BindingStateRemoteLocked || binding.State == BindingStateDivergent)
	}
	if !valid {
		return ErrInvalidModeBinding
	}
	return nil
}
