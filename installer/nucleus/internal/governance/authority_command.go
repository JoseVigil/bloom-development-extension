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
	"nucleus/internal/mandatedelivery"
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
	for _, name := range []string{"status", "sync", "decision", "checkpoint", "observation"} {
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
			deliveryClient := mandatedelivery.Client{BaseURL: active.AuthorityBaseURL, HTTP: authorityCommandHTTPClient, Signer: identity.PrivateKey, Context: mandatedelivery.Context{OrganizationID: active.OrganizationID, InstallationID: identity.InstallationID, Issuer: binding.Issuer, Trust: trust, Now: authorityCommandNow}, Store: &mandatedelivery.Store{Root: filepath.Join(dir, "mandate-delivery")}}
			deliveryResult, deliveryErr := deliveryClient.Receive(context.Background())
			if deliveryErr != nil {
				report.Evidence["mandate_delivery"] = "error"
				report.Evidence["mandate_delivery_error"] = deliveryErr.Error()
			} else {
				report.Evidence["mandate_delivery"] = deliveryResult
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

func init() {
	core.RegisterCommand("GOVERNANCE", func(c *core.Core) *cobra.Command {
		return NewAuthorityCommand(defaultAuthorityServices(c), func() bool { return c.IsJSON })
	})
}
