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
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/gofrs/flock"
	"nucleus/internal/governance/ownershipcontract"
)

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

// tenantSelfPath es la ruta S2S propuesta (Fase 5 §2 Opción A, pregunta abierta #3
// de la Propuesta — "es una propuesta, no un cierre") para que Nucleus resuelva el
// tenantId de la organización autenticada. El nombre final lo confirma cowork
// BACKEND en el Paso 3 del Encargo — cambiarlo cuando esa pieza cierre es un cambio
// de una sola constante.
const tenantSelfPath = "/v1/authority/tenant/self"

// fetchOrganizationTenantID resuelve el tenantId vía el mismo mecanismo S2S (Bearer
// AUTHORITY_SERVICE_TOKEN) que ya usa authority.RegisterInstallation — sin autoridad
// nueva, sólo lectura informativa (Fase 5 §2: "sin firma criptográfica propia, sin
// peso de autoridad"). Un error de red, un 404 (endpoint todavía no desplegado por
// Backend/Batcave — Paso 3 sin cerrar) o una respuesta sin tenant_id se tratan igual:
// (nil, err) — el caller (authority_command.go, caso "sync") lo reporta como no-fatal
// y ReconcileCanonicalOrganization nunca borra un tenantId ya guardado por esto.
func fetchOrganizationTenantID(ctx context.Context, baseURL, serviceToken string, httpClient *http.Client) (*string, error) {
	if baseURL == "" || serviceToken == "" {
		return nil, errors.New("ownership: tenant lookup requires authority base URL and service token")
	}
	target := strings.TrimRight(baseURL, "/") + tenantSelfPath
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+serviceToken)
	client := httpClient
	if client == nil {
		client = &http.Client{}
	}
	response, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tenant lookup HTTP %d", response.StatusCode)
	}
	var body struct {
		TenantID string `json:"tenantId"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&body); err != nil {
		return nil, fmt.Errorf("ownership: invalid tenant lookup response: %w", err)
	}
	if body.TenantID == "" {
		return nil, errors.New("ownership: tenant lookup response missing tenant_id")
	}
	return &body.TenantID, nil
}
