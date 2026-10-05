package governance

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"nucleus/internal/authority"
	"nucleus/internal/core"
	"nucleus/internal/governance/ownershipcontract"
	"nucleus/internal/mandatedelivery"
	"nucleus/internal/mandateinstall"
)

type AuthorityEvidenceReport struct {
	Schema    string         `json:"schema"`
	Command   string         `json:"command"`
	OK        bool           `json:"ok"`
	Evidence  map[string]any `json:"evidence"`
	ErrorCode string         `json:"error_code,omitempty"`
}
type AuthorityCommandServices struct {
	Run func(command string, args []string) (AuthorityEvidenceReport, error)
}
type AuthorityCommandError struct{ Code string }

var authorityCommandHTTPClient *http.Client
var authorityCommandRoots = authority.DevelopmentPinnedRoots
var authorityCommandNow = func() time.Time { return time.Now().UTC() }

func (e AuthorityCommandError) Error() string { return e.Code }

func renderAuthorityEvidence(report AuthorityEvidenceReport, jsonMode bool) (string, error) {
	if report.Schema == "" {
		report.Schema = "bloom.authority.cli-evidence/v1"
	}
	if report.Evidence == nil {
		report.Evidence = map[string]any{}
	}
	if jsonMode {
		raw, err := json.Marshal(report)
		return string(raw) + "\n", err
	}
	keys := make([]string, 0, len(report.Evidence))
	for k := range report.Evidence {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	fmt.Fprintf(&b, "Authority %s\nSchema: %s\nOK: %t\n", report.Command, report.Schema, report.OK)
	for _, k := range keys {
		raw, _ := json.Marshal(report.Evidence[k])
		fmt.Fprintf(&b, "%s: %s\n", k, string(raw))
	}
	if report.ErrorCode != "" {
		fmt.Fprintf(&b, "error_code: %s\n", report.ErrorCode)
	}
	return b.String(), nil
}

func NewAuthorityCommand(services AuthorityCommandServices, jsonMode func() bool) *cobra.Command {
	type commandHelp struct {
		short, long, example, jsonResponse string
	}
	help := map[string]commandHelp{
		"status": {
			short:        "Report locally available Authority state and checkpoint evidence",
			long:         "Reports whether accepted Authority state and its durable checkpoint are available locally. This command does not contact Authority or change enforcement mode.",
			example:      "  nucleus authority status\n  nucleus --json authority status",
			jsonResponse: `{"schema":"bloom.authority.cli-evidence/v1","command":"status","ok":true,"evidence":{"accepted_state_available":true,"checkpoint_available":true,"effective_mode":"local_legacy","cutover":false}}`,
		},
		"sync": {
			short:        "Synchronize verified Authority evidence for the active organization",
			long:         "Registers the installation, confirms Authority 1.1 capability, verifies trust, pulls and accepts Authority evidence, then reports the resulting durable state. It does not independently change enforcement mode.",
			example:      "  nucleus authority sync\n  nucleus --json authority sync",
			jsonResponse: `{"schema":"bloom.authority.cli-evidence/v1","command":"sync","ok":true,"evidence":{"performed":true,"installation_id":"installation-123","organization_id":"organization-123","authority_version":"42","state_digest":"sha256-digest","capability_confirmed":true}}`,
		},
		"register": {
			short:        "Register the active installation before its initial Authority emission",
			long:         "Registers the local installation identity and Authority 1.1 capability. It does not pull an emission, accept a snapshot, or change enforcement mode.",
			example:      "  nucleus --json authority register",
			jsonResponse: `{"schema":"bloom.authority.cli-evidence/v1","command":"register","ok":true,"evidence":{"installation_id":"installation-123","organization_id":"organization-123","registered":true}}`,
		},
		"decision": {
			short:        "Report the current effective Authority decision evidence",
			long:         "Evaluates and reports the current effective Authority decision from already accepted local evidence. It does not pull remote state or mutate the enforcement mode.",
			example:      "  nucleus authority decision\n  nucleus --json authority decision",
			jsonResponse: `{"schema":"bloom.authority.cli-evidence/v1","command":"decision","ok":true,"evidence":{"effective_mode":"local_legacy","cutover":false,"outcome":"not_evaluable"}}`,
		},
		"checkpoint": {
			short:        "Report the durable Authority checkpoint",
			long:         "Reads and reports the durable checkpoint associated with the accepted Authority projection. This command is read-only and does not advance the checkpoint.",
			example:      "  nucleus authority checkpoint\n  nucleus --json authority checkpoint",
			jsonResponse: `{"schema":"bloom.authority.cli-evidence/v1","command":"checkpoint","ok":true,"evidence":{"organization_id":"organization-123","authority_version":"42","state_digest":"sha256-digest"}}`,
		},
		"observation": {
			short:        "Report shadow Authority observation evidence",
			long:         "Reads and reports locally recorded Authority comparison evidence. Observations are informational and cannot change the effective enforcement mode.",
			example:      "  nucleus authority observation\n  nucleus --json authority observation",
			jsonResponse: `{"schema":"bloom.authority.cli-evidence/v1","command":"observation","ok":true,"evidence":{"effective_mode":"local_legacy","cutover":false,"outcome":"match"}}`,
		},
		"service-identity": {
			short:        "Report the local AITAP service identity public evidence",
			long:         "Creates the local AITAP service identity when absent and reports only its public evidence. Private key material is never emitted.",
			example:      "  nucleus authority service-identity\n  nucleus --json authority service-identity",
			jsonResponse: `{"schema":"bloom.authority.cli-evidence/v1","command":"service-identity","ok":true,"evidence":{"consumer":"aitap","service_public_key":"base64url-public-key"}}`,
		},
		"service-grants": {
			short:        "Report active Vault service Grant evidence",
			long:         "Reports active Vault service Grant evidence for the AITAP consumer from the accepted Authority projection and checkpoint. It does not reveal credentials or secret values.",
			example:      "  nucleus authority service-grants\n  nucleus --json authority service-grants",
			jsonResponse: `{"schema":"bloom.authority.cli-evidence/v1","command":"service-grants","ok":true,"evidence":{"grants":[]}}`,
		},
		"supply-read": {
			short:        "Read material Workspace context and Intelligence Supply authority state",
			long:         "Compares Conductor selection with the installed Nucleus context. Without a verified session subject and grant binding, authority remains not_evaluable. Read-only.",
			example:      "  nucleus --json authority supply-read <selected-org-slug> <selected-project-id-or-dash>",
			jsonResponse: `{"schema":"bloom.authority.cli-evidence/v1","command":"supply-read","ok":true,"evidence":{"context":{"status":"verified"},"authority":{"status":"not_evaluable","reason":"session_subject_grant_link_unavailable"}}}`,
		},
		"context-read": {
			short:        "Read confirmed context evidence for an explicit selection",
			long:         "Read-only identity, ProjectBinding, local folder and project ID continuity evidence for an explicit selection. Does not sync, claim or modify projects.",
			example:      "  nucleus authority context-read acme 11111111-1111-4111-8111-111111111111\n  nucleus --json authority context-read acme 11111111-1111-4111-8111-111111111111",
			jsonResponse: `{"schema":"bloom.authority.cli-evidence/v1","command":"context-read","ok":true,"evidence":{"schema":"bloom.confirmed-context/v1","selection":{"orgSlug":"acme","projectId":"11111111-1111-4111-8111-111111111111"},"identityAndMembership":{"status":"not_evaluable"},"projectBinding":{"status":"not_evaluable"},"localLocation":{"status":"present","source":"conductor_project_catalog","path":"C:/projects/one","checkedAt":"2026-10-03T12:00:00Z"},"projectIdContinuity":{"status":"matched","source":"nucleus_material_project_catalog","catalogPath":"C:/projects/.bloom/.nucleus-acme/.core/.nucleus-config.json","checkedAt":"2026-10-03T12:00:00Z"},"cognitumCompatibility":{"status":"not_evaluable"},"intelligencePreference":{"status":"not_evaluable"}}}`,
		},
	}
	root := &cobra.Command{
		Use:     "authority",
		Short:   "Inspect and synchronize verified Authority evidence",
		Long:    "Inspects locally accepted Authority evidence or performs the explicit verified synchronization flow for the active organization. Authority commands remain in GOVERNANCE and do not expose credentials, signatures, private keys, or snapshot payloads.",
		Example: "  nucleus authority status\n  nucleus authority sync\n  nucleus --json authority status",
		Args:    cobra.NoArgs,
		Annotations: map[string]string{
			"category":      "GOVERNANCE",
			"json_response": help["status"].jsonResponse,
		},
	}
	root.SilenceUsage = true
	root.SilenceErrors = true
	for _, name := range []string{"status", "register", "sync", "decision", "checkpoint", "observation", "service-identity", "service-grants", "supply-read", "context-read"} {
		n := name
		commandHelp := help[n]
		sub := &cobra.Command{Use: n + " [arguments]", Short: commandHelp.short, Long: commandHelp.long, Example: commandHelp.example, Args: cobra.ArbitraryArgs, RunE: func(cmd *cobra.Command, args []string) error {
			report, err := services.Run(n, args)
			if err != nil {
				var coded AuthorityCommandError
				if errors.As(err, &coded) {
					report.ErrorCode = coded.Code
				}
				report.OK = false
			}
			report.Command = n
			out, renderErr := renderAuthorityEvidence(report, jsonMode())
			if renderErr != nil {
				return renderErr
			}
			if _, writeErr := fmt.Fprint(cmd.OutOrStdout(), out); writeErr != nil {
				return writeErr
			}
			if report.ErrorCode != "" {
				return AuthorityCommandError{report.ErrorCode}
			}
			return err
		}, Annotations: map[string]string{"category": "GOVERNANCE", "json_response": commandHelp.jsonResponse}}
		root.AddCommand(sub)
	}
	return root
}

type authorityTelemetryTransport struct {
	base   http.RoundTripper
	logger *core.Logger
}

func (t *authorityTelemetryTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	response, err := t.base.RoundTrip(request)
	if request.URL.Path != "/v1/authority/installations/capabilities" {
		return response, err
	}
	if err != nil {
		t.logger.Error("authority sync stage=capability transport=failed method=%s", request.Method)
		return response, err
	}
	switch {
	case request.Method == http.MethodGet && response.StatusCode == http.StatusNotFound:
		t.logger.Info("authority sync stage=capability bootstrap=required expected_revision=0")
	case request.Method == http.MethodPut && response.StatusCode == http.StatusConflict:
		t.logger.Warning("authority sync stage=capability cas_conflict=true retry=bounded")
	case request.Method == http.MethodPut:
		t.logger.Info("authority sync stage=capability update=attempted status=%d", response.StatusCode)
	}
	return response, nil
}

func authorityHTTPClientWithTelemetry(logger *core.Logger) *http.Client {
	base := authorityCommandHTTPClient
	if base == nil {
		base = http.DefaultClient
	}
	client := *base
	transport := base.Transport
	if transport == nil {
		transport = http.DefaultTransport
	}
	client.Transport = &authorityTelemetryTransport{base: transport, logger: logger}
	return &client
}

func defaultAuthorityServices(c *core.Core) AuthorityCommandServices {
	return AuthorityCommandServices{Run: func(command string, args []string) (AuthorityEvidenceReport, error) {
		report := AuthorityEvidenceReport{Schema: "bloom.authority.cli-evidence/v1", Command: command, OK: true, Evidence: map[string]any{"effective_mode": string(ModeLocalLegacy), "cutover": false}}
		dir := filepath.Join(c.Paths.AppDataDir, "authority")
		state := filepath.Join(dir, "state.json")
		checkpoint := filepath.Join(dir, "checkpoint.json")
		observations := filepath.Join(dir, "observation.json")
		switch command {
		case "register":
			if len(args) != 0 {
				return report, AuthorityCommandError{"invalid_arguments"}
			}
			active, err := core.ResolveActiveOrgContext()
			if err != nil {
				return report, AuthorityCommandError{"authority_config_invalid"}
			}
			identity, err := authority.LoadOrCreateLocalIdentity(filepath.Join(dir, "identity.json"))
			if err != nil {
				return report, AuthorityCommandError{"installation_identity_invalid"}
			}
			serviceToken := os.Getenv("AUTHORITY_SERVICE_TOKEN")
			if err = authority.RegisterInstallation(context.Background(), active.AuthorityBaseURL, serviceToken, active.OrganizationID, identity, authorityCommandHTTPClient); err != nil {
				return report, AuthorityCommandError{"installation_registration_failed"}
			}
			capability, err := (&authority.InstallationCapabilityClient{BaseURL: active.AuthorityBaseURL, OrganizationID: active.OrganizationID,
				Identity: identity, HTTP: authorityCommandHTTPClient, Now: authorityCommandNow}).Ensure11(context.Background())
			if err != nil || capability == nil {
				return report, AuthorityCommandError{"installation_capability_unavailable"}
			}
			report.Evidence["registered"] = true
			report.Evidence["installation_id"] = identity.InstallationID
			report.Evidence["organization_id"] = active.OrganizationID
			report.Evidence["capability_confirmed"] = true
		case "context-read":
			if len(args) != 2 || args[0] == "" || args[1] == "" {
				return report, AuthorityCommandError{"invalid_arguments"}
			}
			report.Evidence = confirmedContextEvidence(c.Paths.AppDataDir, args[0], args[1])
		case "supply-read":
			if len(args) != 2 || args[0] == "" || args[1] == "" {
				return report, AuthorityCommandError{"invalid_arguments"}
			}
			report.Evidence = map[string]any{}
			now := authorityCommandNow()
			report.Evidence["evaluated_at"] = now.Format(time.RFC3339Nano)
			report.Evidence["authority"] = map[string]any{"status": "not_evaluable", "reason": "session_subject_grant_link_unavailable"}
			active, contextErr := core.ResolveActiveOrgContext()
			report.Evidence["context"] = supplyReadContextEvidence(args[0], args[1], active, contextErr)
		case "service-identity":
			if len(args) != 0 {
				return report, AuthorityCommandError{"invalid_arguments"}
			}
			publicKey, identityErr := authority.CreateServiceIdentity(c.Paths.AppDataDir)
			if identityErr != nil {
				return report, AuthorityCommandError{"service_identity_unavailable"}
			}
			report.Evidence["consumer"] = "aitap"
			report.Evidence["service_public_key"] = publicKey
		case "service-grants":
			if len(args) != 0 {
				return report, AuthorityCommandError{"invalid_arguments"}
			}
			active, contextErr := core.ResolveActiveOrgContext()
			if contextErr != nil {
				return report, AuthorityCommandError{"authority_config_invalid"}
			}
			grants, grantErr := authority.ActiveVaultServiceGrantEvidence(&authority.Store{Path: state}, &authority.CheckpointStore{Path: checkpoint}, active.OrganizationID, authorityCommandNow())
			if grantErr != nil {
				return report, AuthorityCommandError{"VAULT_ACCESS_DENIED"}
			}
			report.Evidence["grants"] = grants
		case "status":
			_, stateErr := os.Stat(state)
			_, cpErr := os.Stat(checkpoint)
			report.Evidence["accepted_state_available"] = stateErr == nil
			report.Evidence["checkpoint_available"] = cpErr == nil
		case "sync":
			governanceLogger, loggerErr := core.InitLogger(&c.Paths, "GOVERNANCE", c.IsJSON)
			if loggerErr != nil {
				report.OK = false
				report.Evidence["performed"] = false
				return report, AuthorityCommandError{"authority_logging_unavailable"}
			}
			defer governanceLogger.Close()
			governanceLogger.Info("authority sync started")
			httpClient := authorityHTTPClientWithTelemetry(governanceLogger)
			active, err := core.ResolveActiveOrgContext()
			if err != nil {
				governanceLogger.Error("authority sync failed stage=configuration")
				report.OK = false
				report.Evidence["performed"] = false
				report.Evidence["reason"] = err.Error()
				return report, AuthorityCommandError{"authority_config_invalid"}
			}
			governanceLogger.Info("authority sync context organization_id=%s", active.OrganizationID)
			identity, err := authority.LoadOrCreateLocalIdentity(filepath.Join(dir, "identity.json"))
			if err != nil {
				governanceLogger.Error("authority sync failed stage=installation_identity organization_id=%s", active.OrganizationID)
				report.OK = false
				report.Evidence["performed"] = false
				return report, AuthorityCommandError{"installation_identity_invalid"}
			}
			governanceLogger.Info("authority sync identity installation_id=%s", identity.InstallationID)
			serviceToken := os.Getenv("AUTHORITY_SERVICE_TOKEN")
			governanceLogger.Info("authority sync stage=registration started organization_id=%s installation_id=%s", active.OrganizationID, identity.InstallationID)
			if err = authority.RegisterInstallation(context.Background(), active.AuthorityBaseURL, serviceToken, active.OrganizationID, identity, httpClient); err != nil {
				governanceLogger.Error("authority sync failed stage=registration organization_id=%s installation_id=%s", active.OrganizationID, identity.InstallationID)
				report.OK = false
				report.Evidence["performed"] = false
				return report, AuthorityCommandError{"installation_registration_failed"}
			}
			governanceLogger.Success("authority sync stage=registration result=registered organization_id=%s installation_id=%s", active.OrganizationID, identity.InstallationID)
			governanceLogger.Info("authority sync stage=capability started installation_id=%s", identity.InstallationID)
			capability, err := (&authority.InstallationCapabilityClient{BaseURL: active.AuthorityBaseURL, OrganizationID: active.OrganizationID, Identity: identity, HTTP: httpClient, Now: authorityCommandNow}).Ensure11(context.Background())
			if err != nil || capability == nil {
				governanceLogger.Error("authority sync failed stage=capability installation_id=%s", identity.InstallationID)
				report.OK = false
				report.Evidence["performed"] = false
				report.Evidence["capability_confirmed"] = false
				return report, AuthorityCommandError{"installation_capability_unavailable"}
			}
			governanceLogger.Success("authority sync stage=capability confirmed=1.1 revision=%s installation_id=%s", capability.Revision, identity.InstallationID)
			report.Evidence["capability_confirmed"] = true
			report.Evidence["capability_revision"] = capability.Revision
			provisional := authority.Binding{OrganizationID: active.OrganizationID, InstallationID: identity.InstallationID}
			now := authorityCommandNow()
			governanceLogger.Info("authority sync stage=trust started organization_id=%s installation_id=%s", active.OrganizationID, identity.InstallationID)
			manifest, trust, err := authority.FetchAndVerifyTrustManifest(context.Background(), active.AuthorityBaseURL, provisional, identity.PrivateKey, authorityCommandRoots(), httpClient, now)
			if err != nil {
				governanceLogger.Error("authority sync failed stage=trust organization_id=%s installation_id=%s", active.OrganizationID, identity.InstallationID)
				report.OK = false
				report.Evidence["performed"] = false
				return report, AuthorityCommandError{"trust_manifest_invalid"}
			}
			governanceLogger.Success("authority sync stage=trust result=verified organization_id=%s installation_id=%s", active.OrganizationID, identity.InstallationID)
			binding := authority.Binding{OrganizationID: active.OrganizationID, Issuer: manifest.Payload.Issuer, InstallationID: identity.InstallationID}
			store := &authority.Store{Path: state}
			verifier := &authority.Verifier{Trust: trust, Manifest: manifest, Binding: binding, Store: store, Checkpoint: &authority.CheckpointStore{Path: checkpoint}, Now: authorityCommandNow}
			baseVersion := ""
			if current, loadErr := store.Load(); loadErr == nil && current != nil {
				baseVersion = current.Monotonic.HighWaterMark
			}
			syncClient := &authority.SyncClient{BaseURL: active.AuthorityBaseURL, Binding: binding, InstallationPrivateKey: identity.PrivateKey, Verifier: verifier, HTTP: httpClient, Now: authorityCommandNow}
			governanceLogger.Info("authority sync stage=pull started organization_id=%s installation_id=%s", active.OrganizationID, identity.InstallationID)
			result, err := syncClient.Sync(context.Background(), baseVersion, nil)
			if err != nil {
				governanceLogger.Error("authority sync failed stage=pull organization_id=%s installation_id=%s", active.OrganizationID, identity.InstallationID)
				report.OK = false
				report.Evidence["performed"] = false
				report.Evidence["sync_error"] = err.Error()
				return report, AuthorityCommandError{"authority_sync_failed"}
			}
			governanceLogger.Success("authority sync stage=pull result=accepted authority_version=%s state_digest=%s", result.State.Monotonic.HighWaterMark, result.State.Monotonic.StateDigest)
			report.Evidence["performed"] = true
			report.Evidence["installation_id"] = identity.InstallationID
			report.Evidence["organization_id"] = active.OrganizationID
			report.Evidence["authority_version"] = result.State.Monotonic.HighWaterMark
			report.Evidence["state_digest"] = result.State.Monotonic.StateDigest
			// Reconciliación de identidad de organización (+ Tenant, Sovereign Tenant
			// Fase 5) — mismo call site que mandate_delivery abajo, mismos valores que
			// ya están en scope (ningún fetch adicional para organizationId/
			// installationId/issuer/trust anchor). Falla no-fatal — el sync de
			// autoridad ya terminó con éxito para cuando se llega acá; ver
			// ownership_reconciliation.go.
			//
			// Logging estructurado: reutiliza el logger GOVERNANCE abierto al comienzo
			// de este sync. El bloque de mandate delivery conserva su logger MANDATE
			// porque pertenece a ese stream ya existente; no se crea un stream Authority.
			trustAnchorID, trustAnchorPublicKey := manifest.Root()
			trustAnchorFingerprint := trustAnchorFingerprintSHA256(trustAnchorPublicKey)
			var tenantID *string
			if id, tenantErr := authority.FetchOrganizationTenantID(context.Background(), active.AuthorityBaseURL, tenantSelfPath, binding, identity.PrivateKey, httpClient, authorityCommandNow()); tenantErr != nil {
				report.Evidence["tenant_lookup_error"] = tenantErr.Error()
				if governanceLogger != nil {
					governanceLogger.Warning("tenant lookup falló (no bloqueante, %s no se actualiza): %v", tenantSelfPath, tenantErr)
				}
			} else {
				tenantID = id
				if tenantID != nil {
					report.Evidence["tenant_id"] = *tenantID
				}
			}
			// Ajuste pedido por Jose (2026-09-16), Sovereign Tenant Fase 5: además de
			// .ownership.json (reconciliación criptográfica, abajo), anotar el mismo
			// tenant_id como campo plano en la entrada de onboarding.organizations[] de
			// config/nucleus.json que ya usa esta máquina para esta organización — para
			// que interfaces gráficas (Conductor) puedan agrupar organizaciones por
			// tenant sin leer .ownership.json por organización. Aditivo puro (ver
			// core.RecordOrganizationTenantID): no cambia la forma del array de
			// organizations, no anida por tenant. No-fatal, mismo criterio que el resto
			// de este bloque — sólo se intenta cuando el lookup de arriba tuvo éxito
			// (tenantID != nil), simétrico con ReconcileCanonicalOrganization.
			if tenantID != nil {
				if injectErr := core.RecordOrganizationTenantID(active.OrgSlug, active.OrganizationID, *tenantID); injectErr != nil {
					report.Evidence["nucleus_config_tenant_injection_error"] = injectErr.Error()
					if governanceLogger != nil {
						governanceLogger.Warning("no pude anotar tenant_id en config/nucleus.json (org=%s, slug=%s): %v", active.OrganizationID, active.OrgSlug, injectErr)
					}
				} else {
					report.Evidence["nucleus_config_tenant_injected"] = true
				}
			}
			reconciliationOK := false
			if reconcileErr := ReconcileCanonicalOrganization(active.NucleusRoot, active.OrganizationID, identity.InstallationID, binding.Issuer, trustAnchorID, trustAnchorFingerprint, tenantID, authorityCommandNow()); reconcileErr != nil {
				report.Evidence["ownership_reconciled"] = false
				report.Evidence["ownership_reconciliation_error"] = reconcileErr.Error()
				if governanceLogger != nil {
					governanceLogger.Error("reconciliación de organización canónica (org=%s) falló: %v", active.OrganizationID, reconcileErr)
				}
			} else {
				reconciliationOK = true
				report.Evidence["ownership_reconciled"] = true
				if governanceLogger != nil {
					if tenantID != nil {
						governanceLogger.Success("organización canónica reconciliada: org=%s tenant=%s", active.OrganizationID, *tenantID)
					} else {
						governanceLogger.Success("organización canónica reconciliada: org=%s (sin tenant)", active.OrganizationID)
					}
				}
			}
			projects, catalogErr := core.DiscoverActiveOrganizationProjects(active)
			bindingEvidence := map[string]any{"claimed": []string{}, "already_claimed": []string{}, "pending": []string{}, "conflicts": []string{}}
			report.Evidence["project_bindings"] = bindingEvidence
			if catalogErr != nil {
				report.OK = false
				report.Evidence["project_catalog_error"] = catalogErr.Error()
				return report, AuthorityCommandError{"project_catalog_invalid"}
			}
			claimed := []string{}
			already := []string{}
			pending := []string{}
			conflicts := []string{}
			confirmed := []string{}
			bindingStore := &authority.ProjectBindingStore{Path: filepath.Join(dir, "project-bindings.json")}
			legacySubject := ""
			if reconciliationOK {
				ownershipRaw, ownerErr := os.ReadFile(filepath.Join(active.NucleusRoot, ".ownership.json"))
				if ownerErr != nil {
					return report, AuthorityCommandError{"ownership_principal_unavailable"}
				}
				ownershipAnalysis, ownerErr := ownershipcontract.Analyze(ownershipRaw)
				if ownerErr != nil {
					return report, AuthorityCommandError{"ownership_principal_unavailable"}
				}
				ownerView, ownerErr := ownershipcontract.EffectiveLegacyView(ownershipAnalysis)
				if ownerErr == nil && ownerView.Owner.Subject != "" {
					legacySubject = ownerView.Owner.Subject
				}
			}
			bindings := []authority.ProjectBinding{}
			for _, project := range projects {
				claim, claimErr := syncClient.ClaimProject(context.Background(), project.ProjectID)
				if claimErr != nil {
					var typed *authority.ProjectClaimError
					if errors.As(claimErr, &typed) && typed.Status == 409 {
						conflicts = append(conflicts, project.ProjectID)
					} else {
						pending = append(pending, project.ProjectID)
					}
					continue
				}
				if saveErr := bindingStore.Save(claim, authorityCommandNow()); saveErr != nil {
					pending = append(pending, project.ProjectID)
					continue
				}
				live, liveErr := syncClient.GetProjectBinding(context.Background(), project.ProjectID)
				if liveErr != nil {
					pending = append(pending, project.ProjectID)
					continue
				}
				bindings = append(bindings, live)
				confirmed = append(confirmed, project.ProjectID)
				if claim.Status == authority.ProjectClaimed {
					claimed = append(claimed, project.ProjectID)
				} else {
					already = append(already, project.ProjectID)
				}
			}
			bindingEvidence["claimed"] = claimed
			bindingEvidence["already_claimed"] = already
			bindingEvidence["pending"] = pending
			bindingEvidence["conflicts"] = conflicts
			if len(pending) > 0 || len(conflicts) > 0 {
				report.OK = false
				if len(conflicts) > 0 {
					return report, AuthorityCommandError{"project_binding_conflict"}
				}
				return report, AuthorityCommandError{"project_binding_pending"}
			}
			required := make([]string, 0, len(projects))
			for _, project := range projects {
				required = append(required, project.ProjectID)
			}
			if tenantID != nil && reconciliationOK {
				mode, modeErr := EffectiveAuthorityMode()
				if modeErr != nil {
					report.OK = false
					report.Evidence["cutover_error"] = modeErr.Error()
					return report, AuthorityCommandError{"remote_enforced_cutover_failed"}
				}
				if mode == ModeRemoteEnforced {
					report.Evidence["effective_mode"] = string(ModeRemoteEnforced)
					report.Evidence["cutover"] = false
					goto cutoverComplete
				}
				principalID, principalErr := resolveCutoverPrincipal(result.State, legacySubject, active.OrganizationID, authorityCommandNow())
				if principalErr != nil {
					report.OK = false
					report.Evidence["cutover_error"] = principalErr.Error()
					return report, AuthorityCommandError{"remote_identity_ambiguous"}
				}
				var cp authority.Checkpoint
				cpRaw, cpErr := os.ReadFile(checkpoint)
				if cpErr != nil || json.Unmarshal(cpRaw, &cp) != nil {
					report.OK = false
					return report, AuthorityCommandError{"remote_enforced_cutover_failed"}
				}
				if cutoverErr := CutoverRemoteEnforced(active.NucleusRoot, RemoteEnforcedCutoverEvidence{OrganizationID: active.OrganizationID, TenantID: *tenantID, IssuerID: binding.Issuer, TrustAnchorID: trustAnchorID, TrustAnchorFingerprint: trustAnchorFingerprint, AuthorityVersion: result.State.Monotonic.HighWaterMark, StateDigest: result.State.Monotonic.StateDigest, CheckpointHighWaterMark: cp.HighWaterMark, CheckpointStateDigest: cp.StateDigest, PrincipalID: principalID, Snapshot: result.State, SnapshotExpiresAt: result.State.Emission.ExpiresAt, ProjectBindings: bindings, RequiredProjectIDs: required}, authorityCommandNow()); cutoverErr != nil {
					report.OK = false
					report.Evidence["cutover_error"] = cutoverErr.Error()
					return report, AuthorityCommandError{"remote_enforced_cutover_failed"}
				}
				report.Evidence["effective_mode"] = string(ModeRemoteEnforced)
				report.Evidence["cutover"] = true
			}
		cutoverComplete:
			deliveryClient := mandatedelivery.Client{BaseURL: active.AuthorityBaseURL, HTTP: httpClient, Signer: identity.PrivateKey, Context: mandatedelivery.Context{OrganizationID: active.OrganizationID, InstallationID: identity.InstallationID, Issuer: binding.Issuer, Trust: trust, Now: authorityCommandNow}, Store: &mandatedelivery.Store{Root: filepath.Join(dir, "mandate-delivery")}}
			deliveryResult, deliveryErr := deliveryClient.Receive(context.Background())
			if deliveryErr != nil {
				report.Evidence["mandate_delivery"] = "error"
				report.Evidence["mandate_delivery_error"] = deliveryErr.Error()
			} else {
				report.Evidence["mandate_delivery"] = deliveryResult.Status
				// Auto-encadenamiento sync→install (Encargo_Implementacion_AutoEncadenamiento_
				// Sync_Install_y_Validacion_Backend_v1_0.md §2.3): tanto "accepted" como
				// "replay" ya pasaron Verify con éxito (la única diferencia entre ambos es si
				// ese digest ya se había aceptado antes), así que MandateID está poblado en
				// los dos casos — ver mandatedelivery.AcceptOutcome. Encadenar también en
				// "replay" es lo que resuelve, sin migración especial, el caso de una
				// instalación que ya sincronizó antes de este cambio. Una falla acá NO debe
				// romper sync (el sync de autoridad ya terminó con éxito para cuando se llega
				// a este bloque) — se reporta como advertencia en la evidencia, mismo criterio
				// no-bloqueante que ya tiene mandate_delivery_error arriba; report.OK no se
				// toca por esta rama.
				if deliveryResult.Status == "accepted" || deliveryResult.Status == "replay" {
					// Mismo stream de telemetría "nucleus_mandate" que ya usa el comando manual
					// 'nucleus mandate install' (ver commands/mandate_install.go,
					// core.InitLogger(&c.Paths, "MANDATE", ...)) — no se crea un stream nuevo.
					// InitLogger registra/rota el stream en telemetry.json automáticamente
					// (core/logger.go: rolloverLocked → tm.RegisterStream); este bloque sólo
					// necesita escribir líneas, igual que ya hace runInstallMandate para la
					// misma operación disparada a mano.
					mandateLogger, loggerErr := core.InitLogger(&c.Paths, "MANDATE", c.IsJSON)
					if loggerErr != nil {
						report.Evidence["mandate_installed"] = false
						report.Evidence["mandate_install_error"] = fmt.Sprintf("no pude inicializar el logger de MANDATE: %v", loggerErr)
					} else {
						defer mandateLogger.Close()
						receipt, receiptErr := mandateinstall.LoadLatestReceipt(c.Paths.AppDataDir, active.OrganizationID, identity.InstallationID, deliveryResult.MandateID)
						if receiptErr != nil {
							mandateLogger.Error("auto-instalación (desde authority sync) falló al leer el recibo: %v", receiptErr)
							report.Evidence["mandate_installed"] = false
							report.Evidence["mandate_install_error"] = receiptErr.Error()
						} else if mandateDelivery, content, extractErr := mandateinstall.ExtractContent(receipt); extractErr != nil {
							mandateLogger.Error("auto-instalación (desde authority sync) falló al extraer el contenido: %v", extractErr)
							report.Evidence["mandate_installed"] = false
							report.Evidence["mandate_install_error"] = extractErr.Error()
						} else {
							// mandatesRoot equivale a supervisor.LoadNucleusConfig().MandatesRoot()
							// (<workspace>/.bloom/.nucleus-{org}/.mandates) pero se deriva de
							// active.NucleusRoot, ya resuelto arriba por core.ResolveActiveOrgContext
							// — evita un import de internal/supervisor y una segunda lectura de
							// nucleus.json sólo para recomputar el mismo path.
							mandatesRoot := filepath.Join(active.NucleusRoot, ".mandates")
							path, alreadyInstalled, materializeErr := mandateinstall.MaterializeFile(mandatesRoot, mandateDelivery.Envelope.MandateID, content)
							if materializeErr != nil {
								mandateLogger.Error("auto-instalación (desde authority sync) falló al materializar: %v", materializeErr)
								report.Evidence["mandate_installed"] = false
								report.Evidence["mandate_install_error"] = materializeErr.Error()
							} else {
								if alreadyInstalled {
									mandateLogger.Success("mandate %s ya estaba materializado en %s (auto-encadenado desde authority sync, idempotente)", mandateDelivery.Envelope.MandateID, path)
								} else {
									mandateLogger.Success("mandate %s materializado automáticamente en %s (auto-encadenado desde authority sync)", mandateDelivery.Envelope.MandateID, path)
								}
								report.Evidence["mandate_installed"] = true
								report.Evidence["mandate_id"] = mandateDelivery.Envelope.MandateID
								report.Evidence["mandate_path"] = path
							}
						}
					}
				}
			}
		case "decision":
			report.Evidence["create_organization"] = "operation_permission_unmapped"
			report.Evidence["create_project"] = "operation_permission_unmapped"
			if len(args) != 4 {
				report.OK = false
				report.Evidence["outcome"] = string(authority.DecisionNotEvaluable)
				report.Evidence["reason"] = "decision_inputs_required"
				return report, AuthorityCommandError{"decision_inputs_required"}
			}
			decision := (authority.DecisionEvaluator{Store: &authority.Store{Path: state}, Checkpoint: &authority.CheckpointStore{Path: checkpoint}}).Evaluate(authority.DecisionRequest{Operation: args[0], PrincipalID: args[1], Scope: authority.Scope{Type: args[2], ID: args[3]}})
			report.Evidence["outcome"] = string(decision.Outcome)
			report.Evidence["reason"] = decision.Reason
			report.Evidence["operation"] = decision.Operation
			report.Evidence["principal_id"] = decision.PrincipalID
			report.Evidence["scope"] = decision.Scope
			report.Evidence["authority_version"] = decision.AuthorityVersion
			report.Evidence["state_digest"] = decision.StateDigest
			report.OK = decision.Outcome == authority.DecisionAllow
		case "checkpoint":
			raw, err := os.ReadFile(checkpoint)
			if err != nil {
				report.OK = false
				report.Evidence["available"] = false
				return report, AuthorityCommandError{"checkpoint_unavailable"}
			}
			var cp authority.Checkpoint
			if json.Unmarshal(raw, &cp) != nil {
				report.OK = false
				return report, AuthorityCommandError{"checkpoint_invalid"}
			}
			report.Evidence["available"] = true
			report.Evidence["authority_version"] = cp.HighWaterMark
			report.Evidence["state_digest"] = cp.StateDigest
			report.Evidence["manifest_version"] = cp.ManifestVersion
		case "observation":
			to := time.Now().UTC()
			from := to.Add(-24 * time.Hour)
			summary, err := (&authority.ObservationStore{Path: observations}).Summarize(from, to)
			if err != nil {
				report.OK = false
				report.Evidence["available"] = false
				return report, AuthorityCommandError{"observation_unavailable"}
			}
			report.Evidence["available"] = true
			report.Evidence["summary"] = summary
		default:
			return report, AuthorityCommandError{"command_unavailable"}
		}
		return report, nil
	}}
}

func supplyReadContextEvidence(selectedOrg, selectedProject string, active *core.ActiveOrgContext, contextErr error) map[string]any {
	evidence := map[string]any{"status": "not_evaluable", "selected_org_slug": selectedOrg, "selected_project_id": selectedProject}
	if contextErr != nil || active == nil {
		evidence["reason"] = "material_context_unavailable"
		return evidence
	}
	if active.OrgSlug != selectedOrg {
		evidence["reason"] = "selection_mismatch"
		return evidence
	}
	evidence["status"] = "verified"
	evidence["organization_id"] = active.OrganizationID
	evidence["org_slug"] = active.OrgSlug
	if selectedProject != "-" {
		evidence["project_status"] = "not_evaluable"
		evidence["project_reason"] = "material_project_binding_not_evaluated"
	}
	return evidence
}

// confirmedContextEvidence is deliberately a read projection. In particular it
// never claims a project, synchronizes Authority, or infers a session subject.
func confirmedContextEvidence(appDataDir, selectedOrg, selectedProject string) map[string]any {
	now := authorityCommandNow().UTC()
	out := map[string]any{
		"schema": "bloom.confirmed-context/v1", "evaluatedAt": now.Format(time.RFC3339Nano),
		"selection":              map[string]any{"orgSlug": selectedOrg, "projectId": selectedProject},
		"identityAndMembership":  map[string]any{"status": "not_evaluable", "reason": "session_subject_unavailable"},
		"projectBinding":         map[string]any{"status": "not_evaluable", "reason": "binding_not_read"},
		"localLocation":          map[string]any{"status": "not_evaluable", "reason": "location_not_evaluated"},
		"projectIdContinuity":    map[string]any{"status": "not_evaluable", "reason": "continuity_not_evaluated"},
		"cognitumCompatibility":  map[string]any{"status": "not_evaluable", "reason": "criterion_not_defined"},
		"intelligencePreference": map[string]any{"status": "not_evaluable", "reason": "preference_not_evaluated"},
	}
	identity := out["identityAndMembership"].(map[string]any)
	bindingEvidence := out["projectBinding"].(map[string]any)
	active, err := core.ResolveActiveOrgContext()
	if err != nil || active == nil {
		identity["reason"] = "material_context_unavailable"
		return out
	}
	if active.OrgSlug != selectedOrg {
		identity["status"] = "conflict"
		identity["reason"] = "selection_mismatch"
		return out
	}
	if project, projectErr := core.ResolveSelectedProject(active, selectedProject); projectErr == nil {
		location, continuity := core.ReadProjectLocation(active, project)
		location["checkedAt"] = now.Format(time.RFC3339Nano)
		continuity["checkedAt"] = now.Format(time.RFC3339Nano)
		out["localLocation"] = location
		out["projectIdContinuity"] = continuity
	} else {
		out["localLocation"] = map[string]any{"status": "not_evaluable", "reason": "selected_project_unresolved"}
		out["projectIdContinuity"] = map[string]any{"status": "not_evaluable", "reason": "selected_project_unresolved"}
	}
	statePath := filepath.Join(appDataDir, "authority", "state.json")
	checkpointPath := filepath.Join(appDataDir, "authority", "checkpoint.json")
	state, err := readAcceptedContextState(statePath, checkpointPath, now)
	if err != nil {
		identity["reason"] = err.Error()
		bindingEvidence["reason"] = err.Error()
		return out
	}
	identity["authorityVersion"] = state.Monotonic.HighWaterMark
	identity["stateDigest"] = state.Monotonic.StateDigest
	if state.Binding.OrganizationID != active.OrganizationID {
		identity["status"] = "conflict"
		identity["reason"] = "authority_organization_mismatch"
		return out
	}
	identityPath := filepath.Join(appDataDir, "authority", "identity.json")
	installationID, privateKey, err := readInstallationIdentity(identityPath)
	if err != nil {
		identity["reason"] = "installation_identity_unavailable"
		return out
	}
	if installationID != state.Binding.InstallationID {
		identity["status"] = "conflict"
		identity["reason"] = "installation_identity_mismatch"
		return out
	}
	client := &authority.SyncClient{BaseURL: active.AuthorityBaseURL, Binding: state.Binding, InstallationPrivateKey: privateKey, HTTP: authorityCommandHTTPClient, Now: authorityCommandNow}
	tenant, err := authority.FetchOrganizationTenantID(context.Background(), active.AuthorityBaseURL, tenantSelfPath, state.Binding, privateKey, authorityCommandHTTPClient, authorityCommandNow())
	if err != nil || tenant == nil || *tenant == "" {
		identity["reason"] = "tenant_not_evaluable"
		return out
	}
	identity["tenantId"] = *tenant
	identity["organizationId"] = active.OrganizationID
	identity["scopeStatus"] = "verified"
	identity["scopeObservedAt"] = now.Format(time.RFC3339Nano)
	identity["reason"] = "session_subject_unavailable"
	if _, err := core.ResolveSelectedProject(active, selectedProject); err != nil {
		bindingEvidence["reason"] = "selected_project_unresolved"
		return out
	}
	binding, err := client.GetProjectBinding(context.Background(), selectedProject)
	if err != nil {
		var typed *authority.ProjectClaimError
		if errors.As(err, &typed) {
			bindingEvidence["status"] = strings.TrimPrefix(typed.Code, "project_binding_")
			bindingEvidence["reason"] = typed.Code
		} else {
			bindingEvidence["reason"] = "project_binding_unavailable"
		}
		return out
	}
	if binding.TenantID != *tenant || binding.OrganizationID != active.OrganizationID || binding.ProjectID != selectedProject {
		bindingEvidence["status"] = "conflict"
		bindingEvidence["reason"] = "project_binding_scope_mismatch"
		return out
	}
	out["projectBinding"] = map[string]any{"status": "bound", "tenantId": binding.TenantID, "organizationId": binding.OrganizationID, "projectId": binding.ProjectID, "revision": binding.Revision, "sourceRef": binding.SourceRef, "evidenceKind": binding.EvidenceKind, "claimedAt": binding.ClaimedAt, "checkedAt": binding.CheckedAt, "validUntil": binding.ValidUntil}
	return out
}

func readAcceptedContextState(statePath, checkpointPath string, now time.Time) (*authority.DurableState, error) {
	if _, err := os.Stat(checkpointPath + ".txn"); err == nil {
		return nil, errors.New("authority_recovery_required")
	} else if !os.IsNotExist(err) {
		return nil, errors.New("checkpoint_unavailable")
	}
	stateRaw, err := os.ReadFile(statePath)
	if err != nil {
		return nil, errors.New("authority_state_unavailable")
	}
	checkpointRaw, err := os.ReadFile(checkpointPath)
	if err != nil {
		return nil, errors.New("checkpoint_unavailable")
	}
	state, err := (&authority.Store{Path: statePath}).Load()
	if err != nil {
		return nil, errors.New("authority_state_invalid")
	}
	var checkpoint authority.Checkpoint
	if err := json.Unmarshal(checkpointRaw, &checkpoint); err != nil {
		return nil, errors.New("checkpoint_invalid")
	}
	digest := sha256.Sum256(stateRaw)
	if checkpoint.Schema != "bloom.authority.checkpoint/v1" || checkpoint.StoreDigest != base64.RawURLEncoding.EncodeToString(digest[:]) || checkpoint.Binding != state.Binding || checkpoint.HighWaterMark != state.Monotonic.HighWaterMark || checkpoint.PayloadDigest != state.Monotonic.Digest || checkpoint.StateDigest != state.Monotonic.StateDigest || checkpoint.CutoverFloor != state.Monotonic.CutoverFloor {
		return nil, errors.New("checkpoint_conflict")
	}
	if state.Emission == nil || now.Before(state.Emission.NotBefore) {
		return nil, errors.New("authority_state_not_yet_valid")
	}
	if !now.Before(state.Emission.ExpiresAt) {
		return nil, errors.New("authority_state_stale")
	}
	return state, nil
}

func readInstallationIdentity(path string) (string, ed25519.PrivateKey, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", nil, err
	}
	var value struct {
		InstallationID string `json:"installation_id"`
		PublicKey      string `json:"public_key"`
		PrivateKey     string `json:"private_key"`
	}
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", nil, err
	}
	public, publicErr := base64.StdEncoding.Strict().DecodeString(value.PublicKey)
	private, privateErr := base64.StdEncoding.Strict().DecodeString(value.PrivateKey)
	if value.InstallationID == "" || publicErr != nil || privateErr != nil || len(public) != ed25519.PublicKeySize || len(private) != ed25519.PrivateKeySize || !bytes.Equal(public, private[32:]) {
		return "", nil, errors.New("invalid installation identity")
	}
	return value.InstallationID, ed25519.PrivateKey(private), nil
}

func resolveCutoverPrincipal(state *authority.DurableState, subject, organizationID string, at time.Time) (string, error) {
	if state == nil || subject == "" {
		return "", errors.New("remote_identity_ambiguous")
	}
	values := []string{}
	for _, p := range state.Projection.Principals {
		matched := false
		for _, x := range p.ExternalIdentities {
			if x.Subject == subject && x.Status == "verified" && !x.VerifiedAt.After(at) {
				matched = true
			}
		}
		if matched && principalCanCreateProject(state, p.PrincipalID, organizationID, at) {
			values = append(values, p.PrincipalID)
		}
	}
	if len(values) != 1 {
		return "", errors.New("remote_identity_ambiguous")
	}
	return values[0], nil
}

func init() {
	core.RegisterCommand("GOVERNANCE", func(c *core.Core) *cobra.Command {
		return NewAuthorityCommand(defaultAuthorityServices(c), func() bool { return c.IsJSON })
	})
}
