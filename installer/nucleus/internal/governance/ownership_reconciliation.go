package governance

// Reconciliación de identidad de organización (+ Tenant) — Sovereign Tenant Fase 5.
//
// Proviene de dos documentos:
//   - Propuesta_Arquitectura_Reconciliacion_Identidad_Organizacion_v0_1.md (Control):
//     diseñó ReconcileCanonicalOrganization, enganchada en el caso "sync" de
//     authority_command.go, para que .ownership.json aprenda el organizationId real
//     (Organization.CanonicalID) en vez de quedarse sólo con el LegacyOrgID local.
//   - Propuesta_Arquitectura_Fase5_Nucleus_TenantReconciliacion_v0_1.md: extiende ese
//     mismo escritor con un parámetro tenantID opcional.
//
// Nota de implementación (verificada leyendo el repo real esta sesión, 2026-09-16,
// antes de escribir una sola línea de este archivo): ninguna de las dos propuestas
// estaba efectivamente implementada — no existía este archivo, ni
// ReconcileCanonicalOrganization, ni ningún caller en authority_command.go. Ambos
// documentos hablan de "extender" un escritor ya cerrado, pero el escritor de Control
// nunca llegó a escribirse (su propio documento termina pidiendo luz verde para armar
// el encargo de implementación, que no se encontró en el proyecto). Por eso este
// archivo construye el mecanismo de una sola vez, con TenantID incluido desde el
// origen, en vez de escribir primero la versión sin tenant y "extenderla" después —
// no hay nada real que extender, y hacerlo dos veces sería trabajo perdido.

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"nucleus/internal/authority"
	"os"
	"path/filepath"
	"time"

	"github.com/gofrs/flock"
	"nucleus/internal/governance/ownershipcontract"
)

type RemoteEnforcedCutoverEvidence struct {
	OrganizationID          string
	TenantID                string
	IssuerID                string
	TrustAnchorID           string
	TrustAnchorFingerprint  string
	AuthorityVersion        string
	StateDigest             string
	CheckpointHighWaterMark string
	CheckpointStateDigest   string
	PrincipalID             string
	Snapshot                *authority.DurableState
	SnapshotExpiresAt       time.Time
	ProjectBindings         []authority.ProjectBinding
	RequiredProjectIDs      []string
}

// CutoverRemoteEnforced is deliberately separate from ordinary reconciliation.
// The caller must explicitly attest every precondition established in the same
// successful sync. A single atomic replacement publishes the new mode.
func CutoverRemoteEnforced(nucleusRoot string, evidence RemoteEnforcedCutoverEvidence, at time.Time) error {
	if nucleusRoot == "" || evidence.OrganizationID == "" || evidence.TenantID == "" || evidence.IssuerID == "" || evidence.TrustAnchorID == "" || evidence.TrustAnchorFingerprint == "" || evidence.AuthorityVersion == "" || evidence.StateDigest == "" || evidence.PrincipalID == "" || evidence.Snapshot == nil {
		return errors.New("ownership: remote_enforced cutover preconditions missing")
	}
	when := at.UTC()
	if evidence.Snapshot.Emission == nil || !evidence.SnapshotExpiresAt.Equal(evidence.Snapshot.Emission.ExpiresAt) || when.Before(evidence.Snapshot.Emission.NotBefore) || !when.Before(evidence.SnapshotExpiresAt) {
		return errors.New("ownership: accepted snapshot expired")
	}
	if evidence.Snapshot.Binding.OrganizationID != evidence.OrganizationID || evidence.Snapshot.Binding.Issuer != evidence.IssuerID || evidence.Snapshot.Emission.OrganizationID != evidence.OrganizationID || evidence.Snapshot.Emission.Issuer != evidence.IssuerID || evidence.Snapshot.Emission.AuthorityVersion != evidence.AuthorityVersion || evidence.Snapshot.Monotonic.HighWaterMark != evidence.AuthorityVersion || evidence.Snapshot.Monotonic.StateDigest != evidence.StateDigest || evidence.CheckpointHighWaterMark != evidence.AuthorityVersion || evidence.CheckpointStateDigest != evidence.StateDigest {
		return errors.New("ownership: snapshot/checkpoint evidence inconsistent")
	}
	if !principalCanCreateProject(evidence.Snapshot, evidence.PrincipalID, evidence.OrganizationID, when) {
		return errors.New("ownership: canonical principal lacks create_project")
	}
	confirmed := map[string]bool{}
	for _, binding := range evidence.ProjectBindings {
		if binding.Status != "bound" || binding.OrganizationID != evidence.OrganizationID || binding.TenantID != evidence.TenantID || binding.ProjectID == "" || binding.Revision != "1" || binding.EvidenceKind != "canonical" || !validProjectBindingSource(binding.SourceRef) || binding.ClaimedAt.IsZero() || binding.CheckedAt.IsZero() || binding.CheckedAt.After(when) || !when.Before(binding.ValidUntil) {
			return errors.New("ownership: contradictory project binding")
		}
		if confirmed[binding.ProjectID] {
			return errors.New("ownership: duplicate project binding")
		}
		confirmed[binding.ProjectID] = true
	}
	required := map[string]bool{}
	for _, id := range evidence.RequiredProjectIDs {
		if id == "" || required[id] || !confirmed[id] {
			return fmt.Errorf("ownership: project binding not confirmed: %s", id)
		}
		required[id] = true
	}
	if len(confirmed) != len(required) {
		return errors.New("ownership: confirmed project set differs from required set")
	}
	path := filepath.Join(nucleusRoot, ".ownership.json")
	lock := flock.New(path + ownershipTransitionLockSuffix)
	if err := lock.Lock(); err != nil {
		return err
	}
	defer lock.Unlock()
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	analysis, err := ownershipcontract.Analyze(raw)
	if err != nil || analysis.Canonical == nil {
		return errors.New("ownership: canonical bound identity required for cutover")
	}
	document := analysis.Canonical
	if err := verifyMigrationEvidence(path, document); err != nil {
		return err
	}
	if document.AuthorityMode == ownershipcontract.AuthorityModeRemoteEnforced && document.Binding.State == ownershipcontract.BindingStateRemoteLocked {
		return nil
	}
	if document.Binding.State != ownershipcontract.BindingStateBound || document.Organization.CanonicalID == nil || document.Organization.TenantID == nil || document.TrustBinding == nil {
		return errors.New("ownership: canonical bound identity required for cutover")
	}
	if *document.Organization.CanonicalID != evidence.OrganizationID || *document.Organization.TenantID != evidence.TenantID || document.Binding.IssuerID == nil || *document.Binding.IssuerID != evidence.IssuerID || document.TrustBinding.IssuerID != evidence.IssuerID || document.TrustBinding.TrustAnchorID != evidence.TrustAnchorID || document.TrustBinding.TrustAnchorFingerprintSHA256 != evidence.TrustAnchorFingerprint || document.TrustBinding.BoundOrganizationID != evidence.OrganizationID {
		return errors.New("ownership: identity/trust evidence mismatch")
	}
	document.AuthorityMode = ownershipcontract.AuthorityModeRemoteEnforced
	document.Binding.State = ownershipcontract.BindingStateRemoteLocked
	document.Binding.RemoteLockedAt = &when
	document.LegacyAuthority = nil
	document.UpdatedAt = when
	return persistCanonicalOwnershipLocked(path, document)
}

func validProjectBindingSource(value string) bool {
	return len(value) > len("installation:") && value[:len("installation:")] == "installation:"
}

func principalCanCreateProject(state *authority.DurableState, principalID, organizationID string, at time.Time) bool {
	principalOK := false
	for _, p := range state.Projection.Principals {
		if p.PrincipalID == principalID && p.Status == "active" {
			for _, x := range p.ExternalIdentities {
				if x.Status == "verified" && !x.VerifiedAt.After(at) {
					principalOK = true
				}
			}
		}
	}
	if !principalOK {
		return false
	}
	revoked := func(kind, id string) bool {
		for _, r := range state.Projection.Revocations {
			if r.TargetType == kind && r.TargetID == id && !at.Before(r.EffectiveAt) {
				return true
			}
		}
		return false
	}
	for _, m := range state.Projection.Memberships {
		if m.PrincipalID != principalID || m.OrganizationID != organizationID || m.Status != "active" || at.Before(m.ValidFrom) || (m.ValidUntil != nil && !at.Before(*m.ValidUntil)) || at.Before(m.AcceptedAt) || revoked("membership", m.MembershipID) {
			continue
		}
		for _, a := range state.Projection.RoleAssignments {
			if a.MembershipID != m.MembershipID || a.Status != "active" || a.Scope.Type != "organization" || a.Scope.ID != organizationID || at.Before(a.ValidFrom) || (a.ValidUntil != nil && !at.Before(*a.ValidUntil)) || at.Before(a.AcceptedAt) || revoked("role_assignment", a.AssignmentID) {
				continue
			}
			for _, role := range state.Projection.RoleDefinitions {
				if role.RoleID == a.RoleID && role.RoleVersion == a.RoleVersion && role.Status == "active" && !revoked("role_definition", role.RoleID) {
					for _, permission := range role.Permissions {
						if permission == "create_project" {
							return true
						}
					}
				}
			}
		}
	}
	return false
}

// ReconcileCanonicalOrganization enseña a .ownership.json el organizationId real
// (Organization.CanonicalID) y, cuando está disponible, el tenantId (Organization.
// TenantID) de la organización a la que esta instalación está vinculada.
//
// Es idempotente: si ya está BOUND con exactamente los mismos valores de identidad
// (organización, instalación, issuer, trust anchor) y el tenantId no cambió, no
// reescribe el archivo. Si la instalación ya estaba BOUND a una organización
// CANÓNICA DISTINTA, nunca pisa en silencio — pasa a DIVERGENT y deja intacta la
// identidad ya aceptada (Organization/TrustBinding, incluido TenantID) para que un
// humano la revise; el organizationId recién observado no se persiste en ese caso,
// sólo queda en la evidencia que reporta el caller (authority_command.go).
//
// tenantID es *string a propósito: nil significa "el endpoint de tenant falló o no
// está disponible todavía" y nunca borra un valor ya guardado de un sync anterior —
// a diferencia de CanonicalID, un tenantId distinto al ya guardado se sobreescribe
// sin pasar por DIVERGENT (Fase 5 §3.2: es puramente informativo, nada lo consume
// todavía para gatear una decisión).
func ReconcileCanonicalOrganization(nucleusRoot, organizationID, installationID, issuerID, trustAnchorID, trustAnchorFingerprint string, tenantID *string, acceptedAt time.Time) error {
	if nucleusRoot == "" || organizationID == "" || installationID == "" || issuerID == "" || trustAnchorID == "" || trustAnchorFingerprint == "" {
		return errors.New("ownership: reconciliation requires nucleus root, organization, installation, issuer and trust anchor identity")
	}
	path := filepath.Join(nucleusRoot, ".ownership.json")
	lock := flock.New(path + ownershipTransitionLockSuffix)
	if err := lock.Lock(); err != nil {
		return err
	}
	defer func() { _ = lock.Unlock() }()
	return reconcileCanonicalOrganizationLocked(path, organizationID, installationID, issuerID, trustAnchorID, trustAnchorFingerprint, tenantID, acceptedAt)
}

// reconcileCanonicalOrganizationLocked requiere que el lock de transición de
// ownership ya esté tomado (mismo contrato que persistCanonicalOwnershipLocked /
// migrateOwnershipLocked en ownership_migration.go) — nunca lo adquiere él mismo,
// para poder reusar migrateOwnershipLocked sin deadlockear contra el propio lock.
func reconcileCanonicalOrganizationLocked(path, organizationID, installationID, issuerID, trustAnchorID, trustAnchorFingerprint string, tenantID *string, acceptedAt time.Time) error {
	document, err := migrateOwnershipLocked(path)
	if err != nil {
		return err
	}

	// TrustBinding.BoundInstallationID debe igualar Document.Installation.
	// InstallationID (invariante de Validate(), ownershipcontract/schema.go ~L189-195)
	// — y ese campo NO es el installationID real de authority.LocalIdentity que el
	// caller pasa acá como `installationID`. Es un identificador de migración generado
	// una sola vez por ownership_migration.go (loadOrPrepareEvidence → randomID(), ver
	// migrateOwnershipLocked) la primera vez que este .ownership.json se migró a forma
	// canónica — un espacio de identidad propio, sin relación con la identidad de
	// autoridad (mismo tipo de discontinuidad ya señalada para blueprint.go/
	// OrgIdentity.OrgID en otros documentos de este proyecto; reconciliar también
	// Installation.InstallationID sería un cambio de alcance mayor, no de esta ronda).
	// `installationID` se conserva en la firma por paridad con las dos propuestas
	// (Control y Fase 5) que la documentan así, pero el valor que efectivamente entra
	// en TrustBinding es siempre el que el documento ya tiene — usar el parámetro acá
	// haría que persistCanonicalOwnershipLocked rechace SIEMPRE el write con
	// ErrContradictoryOwnership, porque casi nunca van a coincidir por azar.
	boundInstallationID := document.Installation.InstallationID

	acceptedAtUTC := acceptedAt.UTC()
	previousCanonicalID := document.Organization.CanonicalID

	if previousCanonicalID != nil && *previousCanonicalID != "" && *previousCanonicalID != organizationID {
		if document.Binding.State == ownershipcontract.BindingStateDivergent {
			return nil // ya divergente por el mismo motivo — no reescribe de nuevo.
		}
		document.Binding.State = ownershipcontract.BindingStateDivergent
		document.UpdatedAt = acceptedAtUTC
		return persistCanonicalOwnershipLocked(path, document)
	}

	organization := document.Organization
	canonicalID := organizationID
	organization.CanonicalID = &canonicalID

	tenantChanged := false
	if tenantID != nil && (organization.TenantID == nil || *organization.TenantID != *tenantID) {
		tenantValue := *tenantID
		organization.TenantID = &tenantValue
		tenantChanged = true
	}
	// tenantID == nil (lookup caído/ausente): Organization.TenantID se deja
	// exactamente como estaba — nunca se blanquea un valor bueno de un sync anterior.

	trust := document.TrustBinding
	trustStable := trust != nil &&
		trust.IssuerID == issuerID &&
		trust.TrustAnchorID == trustAnchorID &&
		trust.TrustAnchorFingerprintSHA256 == trustAnchorFingerprint &&
		trust.BoundOrganizationID == organizationID &&
		trust.BoundInstallationID == boundInstallationID

	bindingStable := document.Binding.State == ownershipcontract.BindingStateBound &&
		document.Binding.IssuerID != nil && *document.Binding.IssuerID == issuerID
	remoteStable := document.AuthorityMode == ownershipcontract.AuthorityModeRemoteEnforced &&
		document.Binding.State == ownershipcontract.BindingStateRemoteLocked && trustStable && !tenantChanged
	if remoteStable {
		return nil
	}

	if bindingStable && trustStable && !tenantChanged {
		return nil // idempotente: mismos valores ya aceptados, no reescribe.
	}

	document.Organization = organization
	document.Binding = ownershipcontract.Binding{State: ownershipcontract.BindingStateBound, IssuerID: &issuerID, AcceptedAt: &acceptedAtUTC}
	document.TrustBinding = &ownershipcontract.TrustBinding{
		IssuerID:                     issuerID,
		TrustAnchorID:                trustAnchorID,
		TrustAnchorFingerprintSHA256: trustAnchorFingerprint,
		BoundOrganizationID:          organizationID,
		BoundInstallationID:          boundInstallationID,
		AcceptedAt:                   acceptedAtUTC,
	}
	document.UpdatedAt = acceptedAtUTC
	return persistCanonicalOwnershipLocked(path, document)
}

// trustAnchorFingerprintSHA256 deriva TrustAnchorFingerprintSHA256 de la misma clave
// pública raíz que authority.FetchAndVerifyTrustManifest ya verificó criptográficamente
// (manifest.Root()) — no hay una segunda verificación acá, sólo se lee el resultado.
func trustAnchorFingerprintSHA256(rootPublicKey ed25519.PublicKey) string {
	digest := sha256.Sum256(rootPublicKey)
	return hex.EncodeToString(digest[:])
}

// tenantSelfPath es la ruta S2S que resuelve Nucleus para conocer el tenantId de la
// organización autenticada. Confirmada y desplegada por cowork BACKEND
// (Cierre_Implementacion_Endpoint_TenantSelf_v1_0.md, 2026-09-16): GET
// /v1/authority/tenant/self, autenticada con verifyInstallationAuth — no con el token
// estático de servicio. Ver authority.FetchOrganizationTenantID (paquete authority,
// no este), que es quien de verdad la llama — el intento anterior de resolverla desde
// governance mandaba sólo un Bearer estático sin ?org= ni firma, y nunca podía
// autenticar contra este endpoint tal como quedó implementado. Se movió al paquete
// authority porque necesita el signedRequest privado de SyncClient (mismo mecanismo
// que ya usan trust-manifest y sync/pull) — governance no tiene acceso a eso, y no
// debería tenerlo.
const tenantSelfPath = "/v1/authority/tenant/self"
