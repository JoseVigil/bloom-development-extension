package governance

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/intelligencesupply"
	"nucleus/internal/orchestration/mandatecontract"
	"nucleus/internal/vault"
)

var errIntentSupplyBridgeDenied = errors.New("INTENT_SUPPLY_CONTEXT_DENIED")

// IntentSupplyBridge is the read-only Core -> Nucleus -> AITAP boundary.  It
// owns no preferences or assignments and all of its filesystem inputs are
// immutable, signed or digest-bound evidence selected by the prepared Mandate.
type IntentSupplyBridge struct {
	Store           *authority.Store
	Checkpoint      *authority.CheckpointStore
	ProjectBindings *authority.ProjectBindingStore
	AITAP           intelligencesupply.Client
	VaultStatusPath string
	MandatesRoot    string
	IdentityPath    string
	Now             func() time.Time
}

// IntentSupplyRequest contains proof material and the exact prepared Mandate
// to evaluate. Assignments is accepted only for Mode "validate".
type IntentSupplyRequest struct {
	Mode             string
	RequestID        string
	OrganizationID   string
	InstallationID   string
	ProjectID        string
	MandateID        string
	ExpectedDigest   string
	ActorAttestation []byte
	TrustManifest    *authority.VerifiedTrustManifest
	ActorProof       *authority.ActorProof
	ActorChallenge   string
	Assignments      json.RawMessage
}

type intentSupplyAction struct {
	ActionID             string   `json:"action_id"`
	RequiredCapabilities []string `json:"requiredCapabilities"`
}

type intentSupplyOperation struct {
	SchemaVersion          string                              `json:"schema_version"`
	RequestID              string                              `json:"request_id"`
	MandateID              string                              `json:"mandate_id"`
	PreparedContractDigest string                              `json:"prepared_contract_digest"`
	PolicyVersion          string                              `json:"policy_version"`
	PolicySHA256           string                              `json:"policy_sha256"`
	RegistrySnapshotID     string                              `json:"registry_snapshot_id"`
	RegistrySHA256         string                              `json:"registry_sha256"`
	Actions                []intentSupplyAction                `json:"actions"`
	Authority              intentSupplyAuthorityEvidence       `json:"authority"`
	Credentials            []vault.CredentialReferenceEvidence `json:"credentials"`
	Assignments            json.RawMessage                     `json:"assignments,omitempty"`
}

// Assignments verifies all local and Authority bindings, derives cognitive
// actions exclusively from the signed v4 contract, hands detached evidence to
// AITAP and returns AITAP's already-sanitized per-action result. It performs no
// writes and does not start the Mandate.
func (b IntentSupplyBridge) Assignments(ctx context.Context, request IntentSupplyRequest) (json.RawMessage, error) {
	deny := func() (json.RawMessage, error) { return nil, errIntentSupplyBridgeDenied }
	if ctx == nil || (request.Mode != "list" && request.Mode != "validate") || request.RequestID == "" ||
		b.MandatesRoot == "" || b.IdentityPath == "" || request.ExpectedDigest == "" || request.MandateID == "" ||
		request.MandateID == "." || request.MandateID == ".." || filepath.Base(request.MandateID) != request.MandateID {
		return deny()
	}
	if request.Mode == "list" && len(request.Assignments) != 0 || request.Mode == "validate" && len(request.Assignments) == 0 {
		return deny()
	}
	now := time.Now().UTC()
	if b.Now != nil {
		now = b.Now().UTC()
	}
	actor, err := verifyIntentSupplyActor(request.ActorAttestation, request.TrustManifest, request.ActorProof, request.ActorChallenge, now)
	if err != nil {
		return deny()
	}
	envelope, err := mandatecontract.LoadVerified(filepath.Join(b.MandatesRoot, request.MandateID), b.IdentityPath)
	if err != nil || envelope.ContractDigest != request.ExpectedDigest || envelope.Contract.ContractVersion != 4 ||
		envelope.Contract.OrganizationID != request.OrganizationID || envelope.Contract.ProjectID != request.ProjectID ||
		envelope.Contract.MandateID != request.MandateID || envelope.Contract.Intelligence == nil {
		return deny()
	}
	authorityEvidence, err := evaluateIntentSupplyContext(b.Store, b.Checkpoint, b.ProjectBindings, actor, intentSupplyContext{
		OrganizationID: request.OrganizationID, InstallationID: request.InstallationID, ProjectID: request.ProjectID,
		MandateID: request.MandateID, PreparedContractDigest: "sha256:" + envelope.ContractDigest, EvaluatedAt: now,
	})
	if err != nil {
		return deny()
	}
	operation, policyPath, registryPath, err := buildIntentSupplyOperation(request, envelope, authorityEvidence, b.VaultStatusPath, now)
	if err != nil {
		return deny()
	}
	raw, err := json.Marshal(operation)
	if err != nil {
		return deny()
	}
	result, err := b.AITAP.Assignments(ctx, request.Mode, raw, policyPath, registryPath)
	if err != nil {
		return nil, intelligencesupply.ErrAssignmentsUnavailable
	}
	return result, nil
}

func buildIntentSupplyOperation(request IntentSupplyRequest, envelope mandatecontract.Envelope, evidence intentSupplyAuthorityEvidence, vaultStatusPath string, evaluatedAt time.Time) (intentSupplyOperation, string, string, error) {
	i := envelope.Contract.Intelligence
	if i == nil || i.RegistrySnapshotID == "" || evidence.PreparedContractDigest != "sha256:"+envelope.ContractDigest {
		return intentSupplyOperation{}, "", "", errIntentSupplyBridgeDenied
	}
	if err := verifyFileDigest(i.PolicyRef, i.PolicySHA256); err != nil {
		return intentSupplyOperation{}, "", "", errIntentSupplyBridgeDenied
	}
	registryRaw, err := os.ReadFile(i.RegistryRef)
	if err != nil || verifyBytesDigest(registryRaw, i.RegistrySHA256) != nil {
		return intentSupplyOperation{}, "", "", errIntentSupplyBridgeDenied
	}
	var registry struct {
		SnapshotID string `json:"snapshot_id"`
		Backends   []struct {
			CredentialRef *string `json:"credential_ref"`
		} `json:"intelligence_backends"`
	}
	if json.Unmarshal(registryRaw, &registry) != nil || registry.SnapshotID != i.RegistrySnapshotID {
		return intentSupplyOperation{}, "", "", errIntentSupplyBridgeDenied
	}
	actions := make([]intentSupplyAction, 0)
	for _, action := range envelope.Contract.Actions {
		if action.RequiresIntelligence == nil {
			return intentSupplyOperation{}, "", "", errIntentSupplyBridgeDenied
		}
		if *action.RequiresIntelligence {
			actions = append(actions, intentSupplyAction{ActionID: action.ActionID, RequiredCapabilities: append([]string(nil), action.RequiredCapabilities...)})
		}
	}
	if len(actions) == 0 {
		return intentSupplyOperation{}, "", "", errIntentSupplyBridgeDenied
	}
	seen := map[string]bool{}
	credentials := make([]vault.CredentialReferenceEvidence, 0)
	for _, backend := range registry.Backends {
		if backend.CredentialRef == nil || seen[*backend.CredentialRef] {
			continue
		}
		seen[*backend.CredentialRef] = true
		observed, observeErr := vault.ObserveCredentialReference(vaultStatusPath, *backend.CredentialRef, evaluatedAt, evidence.ValidUntil)
		if observeErr != nil {
			return intentSupplyOperation{}, "", "", errIntentSupplyBridgeDenied
		}
		credentials = append(credentials, observed)
	}
	return intentSupplyOperation{
		SchemaVersion: "bloom.intent-supply-assignments/v1", RequestID: request.RequestID, MandateID: request.MandateID,
		PreparedContractDigest: "sha256:" + envelope.ContractDigest, PolicyVersion: i.PolicyVersion,
		PolicySHA256: i.PolicySHA256, RegistrySnapshotID: i.RegistrySnapshotID, RegistrySHA256: i.RegistrySHA256,
		Actions: actions, Authority: evidence, Credentials: credentials, Assignments: request.Assignments,
	}, i.PolicyRef, i.RegistryRef, nil
}

func verifyFileDigest(path, expected string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return verifyBytesDigest(raw, expected)
}

func verifyBytesDigest(raw []byte, expected string) error {
	sum := sha256.Sum256(raw)
	if hex.EncodeToString(sum[:]) != expected {
		return errIntentSupplyBridgeDenied
	}
	return nil
}

// verifiedIntentSupplyActor is intentionally package-private. A caller cannot
// turn a free principal_id into trusted identity; production code can obtain
// this value only through verifyIntentSupplyActor.
type verifiedIntentSupplyActor struct {
	principalID    string
	organizationID string
	installationID string
	expiresAt      time.Time
}

type intentSupplyContext struct {
	OrganizationID         string
	InstallationID         string
	ProjectID              string
	MandateID              string
	PreparedContractDigest string
	EvaluatedAt            time.Time
}

// intentSupplyAuthorityEvidence is the maximum Authority projection the
// administrative bridge may hand to AITAP. It omits Grant IDs, actor and
// membership identifiers, issuer data, replacements and credential material.
type intentSupplyAuthorityEvidence struct {
	OrganizationID         string                                    `json:"organization_id"`
	ProjectID              string                                    `json:"project_id"`
	MandateID              string                                    `json:"mandate_id"`
	PreparedContractDigest string                                    `json:"prepared_contract_digest"`
	AllowedCapabilities    []string                                  `json:"allowed_capabilities"`
	AllowedPrivacy         []string                                  `json:"allowed_privacy"`
	AllowedDestinations    []authority.IntelligenceSupplyDestination `json:"allowed_destinations"`
	Limits                 authority.IntelligenceSupplyLimits        `json:"limits"`
	ValidUntil             time.Time                                 `json:"valid_until"`
	AuthorityVersion       string                                    `json:"authority_version"`
	AuthorityStateDigest   string                                    `json:"authority_state_digest"`
}

func verifyIntentSupplyActor(raw []byte, manifest *authority.VerifiedTrustManifest, proof *authority.ActorProof, challenge string, now time.Time) (verifiedIntentSupplyActor, error) {
	if len(raw) == 0 || manifest == nil || proof == nil || challenge == "" || now.IsZero() {
		return verifiedIntentSupplyActor{}, errIntentSupplyBridgeDenied
	}
	attestation, err := authority.VerifyActorAttestation(raw, manifest, proof, challenge, now)
	if err != nil || attestation.PrincipalID == "" || attestation.OrganizationID == "" || attestation.InstallationID == "" || !now.Before(attestation.ExpiresAt) {
		return verifiedIntentSupplyActor{}, errIntentSupplyBridgeDenied
	}
	return verifiedIntentSupplyActor{
		principalID: attestation.PrincipalID, organizationID: attestation.OrganizationID,
		installationID: attestation.InstallationID, expiresAt: attestation.ExpiresAt,
	}, nil
}

func evaluateIntentSupplyContext(store *authority.Store, checkpoint *authority.CheckpointStore, bindings *authority.ProjectBindingStore, actor verifiedIntentSupplyActor, input intentSupplyContext) (intentSupplyAuthorityEvidence, error) {
	deny := func() (intentSupplyAuthorityEvidence, error) {
		return intentSupplyAuthorityEvidence{}, errIntentSupplyBridgeDenied
	}
	if store == nil || checkpoint == nil || bindings == nil || input.OrganizationID == "" || input.InstallationID == "" || input.ProjectID == "" || input.MandateID == "" || input.PreparedContractDigest == "" || input.EvaluatedAt.IsZero() {
		return deny()
	}
	if actor.principalID == "" || actor.organizationID != input.OrganizationID || actor.installationID != input.InstallationID || !input.EvaluatedAt.Before(actor.expiresAt) {
		return deny()
	}
	receipts, err := bindings.Load()
	if err != nil {
		return deny()
	}
	matchedBinding := false
	for _, binding := range receipts {
		if binding.OrganizationID != input.OrganizationID || binding.ProjectID != input.ProjectID {
			continue
		}
		if matchedBinding || (!binding.ValidUntil.IsZero() && !input.EvaluatedAt.Before(binding.ValidUntil)) {
			return deny()
		}
		matchedBinding = true
	}
	if !matchedBinding {
		return deny()
	}
	grant, err := authority.ResolveIntelligenceSupplyGrantForActor(store, checkpoint, input.OrganizationID, input.InstallationID, actor.principalID, input.EvaluatedAt)
	if err != nil || grant.Status != authority.IntelligenceSupplyGrantActive {
		return deny()
	}
	validUntil := grant.ValidUntil
	if actor.expiresAt.Before(validUntil) {
		validUntil = actor.expiresAt
	}
	return intentSupplyAuthorityEvidence{
		OrganizationID: input.OrganizationID, ProjectID: input.ProjectID, MandateID: input.MandateID,
		PreparedContractDigest: input.PreparedContractDigest,
		AllowedCapabilities:    append([]string(nil), grant.AllowedCapabilities...),
		AllowedPrivacy:         append([]string(nil), grant.AllowedPrivacy...),
		AllowedDestinations:    cloneSupplyDestinations(grant.AllowedDestinations), Limits: grant.Limits,
		ValidUntil: validUntil, AuthorityVersion: grant.AuthorityVersion, AuthorityStateDigest: grant.AuthorityStateDigest,
	}, nil
}

func cloneSupplyDestinations(values []authority.IntelligenceSupplyDestination) []authority.IntelligenceSupplyDestination {
	out := make([]authority.IntelligenceSupplyDestination, len(values))
	for i, value := range values {
		out[i] = value
		out[i].Models = append([]string(nil), value.Models...)
	}
	return out
}
