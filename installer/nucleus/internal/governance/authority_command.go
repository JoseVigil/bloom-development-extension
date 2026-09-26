package governance

import (
	"context"
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
	root := &cobra.Command{Use: "authority", Short: "Inspect Authority evidence without changing enforcement mode", Args: cobra.NoArgs, Annotations: map[string]string{"category": "GOVERNANCE", "json_response": `{"schema":"bloom.authority.cli-evidence/v1","command":"sync","ok":true,"evidence":{"performed":true,"authority_version":"1","mandate_delivery":"pending"}}`}}
	root.SilenceUsage = true
	root.SilenceErrors = true
	for _, name := range []string{"status", "sync", "decision", "checkpoint", "observation", "service-identity", "service-grants"} {
		n := name
		sub := &cobra.Command{Use: n + " [arguments]", Short: "Report Authority " + n + " evidence", Args: cobra.ArbitraryArgs, RunE: func(cmd *cobra.Command, args []string) error {
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
		}, Annotations: map[string]string{"category": "GOVERNANCE", "json_response": root.Annotations["json_response"]}}
		root.AddCommand(sub)
	}
	return root
}

func defaultAuthorityServices(c *core.Core) AuthorityCommandServices {
	return AuthorityCommandServices{Run: func(command string, args []string) (AuthorityEvidenceReport, error) {
		report := AuthorityEvidenceReport{Schema: "bloom.authority.cli-evidence/v1", Command: command, OK: true, Evidence: map[string]any{"effective_mode": string(ModeLocalLegacy), "cutover": false}}
		dir := filepath.Join(c.Paths.AppDataDir, "authority")
		state := filepath.Join(dir, "state.json")
		checkpoint := filepath.Join(dir, "checkpoint.json")
		observations := filepath.Join(dir, "observation.json")
		switch command {
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
			active, err := core.ResolveActiveOrgContext()
			if err != nil {
				report.OK = false
				report.Evidence["performed"] = false
				report.Evidence["reason"] = err.Error()
				return report, AuthorityCommandError{"authority_config_invalid"}
			}
			identity, err := authority.LoadOrCreateLocalIdentity(filepath.Join(dir, "identity.json"))
			if err != nil {
				report.OK = false
				report.Evidence["performed"] = false
				return report, AuthorityCommandError{"installation_identity_invalid"}
			}
			serviceToken := os.Getenv("AUTHORITY_SERVICE_TOKEN")
			if err = authority.RegisterInstallation(context.Background(), active.AuthorityBaseURL, serviceToken, active.OrganizationID, identity, authorityCommandHTTPClient); err != nil {
				report.OK = false
				report.Evidence["performed"] = false
				return report, AuthorityCommandError{"installation_registration_failed"}
			}
			provisional := authority.Binding{OrganizationID: active.OrganizationID, InstallationID: identity.InstallationID}
			now := authorityCommandNow()
			manifest, trust, err := authority.FetchAndVerifyTrustManifest(context.Background(), active.AuthorityBaseURL, provisional, identity.PrivateKey, authorityCommandRoots(), authorityCommandHTTPClient, now)
			if err != nil {
				report.OK = false
				report.Evidence["performed"] = false
				return report, AuthorityCommandError{"trust_manifest_invalid"}
			}
			binding := authority.Binding{OrganizationID: active.OrganizationID, Issuer: manifest.Payload.Issuer, InstallationID: identity.InstallationID}
			store := &authority.Store{Path: state}
			verifier := &authority.Verifier{Trust: trust, Manifest: manifest, Binding: binding, Store: store, Checkpoint: &authority.CheckpointStore{Path: checkpoint}, Now: authorityCommandNow}
			baseVersion := ""
			if current, loadErr := store.Load(); loadErr == nil && current != nil {
				baseVersion = current.Monotonic.HighWaterMark
			}
			syncClient := &authority.SyncClient{BaseURL: active.AuthorityBaseURL, Binding: binding, InstallationPrivateKey: identity.PrivateKey, Verifier: verifier, HTTP: authorityCommandHTTPClient, Now: authorityCommandNow}
			result, err := syncClient.Sync(context.Background(), baseVersion, nil)
			if err != nil {
				report.OK = false
				report.Evidence["performed"] = false
				report.Evidence["sync_error"] = err.Error()
				return report, AuthorityCommandError{"authority_sync_failed"}
			}
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
			// Logging estructurado: mismo stream de telemetría "nucleus_governance" que
			// ya usa 'nucleus auth link' (ver auth_link.go, core.InitLogger(&c.Paths,
			// "GOVERNANCE", c.IsJSON)) — no un stream nuevo ni un archivo aparte. Es la
			// categoría correcta porque 'authority' ya está registrado bajo GOVERNANCE
			// (ver init() al final de este archivo) y esta operación es, en esencia,
			// gobierno de identidad de organización — no delivery de mandates, que es
			// por lo que el bloque de abajo sigue abriendo su propio logger "MANDATE" en
			// lugar de reusar este. InitLogger registra/rota el stream en telemetry.json
			// automáticamente (core/logger.go: rolloverLocked → tm.RegisterStream); acá
			// sólo hace falta escribir las líneas, igual que ya hace runAuthLink.
			governanceLogger, governanceLoggerErr := core.InitLogger(&c.Paths, "GOVERNANCE", c.IsJSON)
			if governanceLoggerErr != nil {
				report.Evidence["ownership_reconciliation_logger_error"] = governanceLoggerErr.Error()
			} else {
				defer governanceLogger.Close()
			}
			trustAnchorID, trustAnchorPublicKey := manifest.Root()
			trustAnchorFingerprint := trustAnchorFingerprintSHA256(trustAnchorPublicKey)
			var tenantID *string
			if id, tenantErr := authority.FetchOrganizationTenantID(context.Background(), active.AuthorityBaseURL, tenantSelfPath, binding, identity.PrivateKey, authorityCommandHTTPClient, authorityCommandNow()); tenantErr != nil {
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
			deliveryClient := mandatedelivery.Client{BaseURL: active.AuthorityBaseURL, HTTP: authorityCommandHTTPClient, Signer: identity.PrivateKey, Context: mandatedelivery.Context{OrganizationID: active.OrganizationID, InstallationID: identity.InstallationID, Issuer: binding.Issuer, Trust: trust, Now: authorityCommandNow}, Store: &mandatedelivery.Store{Root: filepath.Join(dir, "mandate-delivery")}}
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
