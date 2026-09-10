package governance

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func executeAuthority(t *testing.T, jsonMode bool, name string, service AuthorityCommandServices) (string, error) {
	t.Helper()
	cmd := NewAuthorityCommand(service, func() bool { return jsonMode })
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetErr(&out)
	cmd.SetArgs([]string{name})
	err := cmd.Execute()
	return out.String(), err
}
func TestAuthorityCLIHumanAndJSONCarrySameEvidence(t *testing.T) {
	service := AuthorityCommandServices{Run: func(command string, args []string) (AuthorityEvidenceReport, error) {
		return AuthorityEvidenceReport{OK: true, Evidence: map[string]any{"authority_version": "8", "outcome": "not_evaluable", "effective_mode": "local_legacy", "cutover": false}}, nil
	}}
	human, err := executeAuthority(t, false, "status", service)
	if err != nil {
		t.Fatal(err)
	}
	wire, err := executeAuthority(t, true, "status", service)
	if err != nil {
		t.Fatal(err)
	}
	var report AuthorityEvidenceReport
	if json.Unmarshal([]byte(wire), &report) != nil {
		t.Fatal("invalid JSON")
	}
	for k, v := range report.Evidence {
		raw, _ := json.Marshal(v)
		if !strings.Contains(human, k+": "+string(raw)) {
			t.Fatalf("human output omitted %s=%s: %s", k, raw, human)
		}
	}
	if !strings.Contains(human, "Schema: "+report.Schema) || !strings.Contains(human, "OK: true") {
		t.Fatalf("schema/status missing: %s", human)
	}
}
func TestAuthorityCLIStableErrorAndObservationCannotChangeMode(t *testing.T) {
	service := AuthorityCommandServices{Run: func(command string, args []string) (AuthorityEvidenceReport, error) {
		return AuthorityEvidenceReport{Evidence: map[string]any{"effective_mode": "local_legacy", "cutover": false, "outcome": "not_evaluable"}}, AuthorityCommandError{"controls_absent"}
	}}
	for _, name := range []string{"status", "sync", "decision", "checkpoint", "observation"} {
		out, err := executeAuthority(t, true, name, service)
		if err == nil {
			t.Fatalf("%s accepted error", name)
		}
		var coded AuthorityCommandError
		if !errors.As(err, &coded) || coded.Code != "controls_absent" {
			t.Fatalf("%s err=%v", name, err)
		}
		var report AuthorityEvidenceReport
		if json.Unmarshal([]byte(out), &report) != nil || report.ErrorCode != "controls_absent" || report.Evidence["effective_mode"] != "local_legacy" || report.Evidence["cutover"] != false {
			t.Fatalf("%s report=%s", name, out)
		}
	}
}
func TestAuthorityCLIHasOnlyReadAndExplicitSyncCommands(t *testing.T) {
	cmd := NewAuthorityCommand(AuthorityCommandServices{Run: func(string, []string) (AuthorityEvidenceReport, error) { return AuthorityEvidenceReport{OK: true}, nil }}, func() bool { return false })
	got := map[string]bool{}
	for _, sub := range cmd.Commands() {
		got[sub.Name()] = true
	}
	for _, name := range []string{"status", "sync", "decision", "checkpoint", "observation"} {
		if !got[name] {
			t.Fatalf("missing %s", name)
		}
	}
	for _, forbidden := range []string{"cutover", "mode", "enforce"} {
		if got[forbidden] {
			t.Fatalf("unexpected mutator %s", forbidden)
		}
	}
}
