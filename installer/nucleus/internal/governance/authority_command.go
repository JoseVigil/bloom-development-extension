package governance

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"nucleus/internal/authority"
	"nucleus/internal/core"
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
	root := &cobra.Command{Use: "authority", Short: "Inspect Authority evidence without changing enforcement mode", Args: cobra.NoArgs}
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
		}}
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
			report.OK = false
			report.Evidence["performed"] = false
			report.Evidence["reason"] = "sync_client_not_configured"
			return report, AuthorityCommandError{"sync_client_not_configured"}
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
