package governance

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestIntentSupplySessionIsJSONLinesAndFailsClosedBeforeActorApproval(t *testing.T) {
	input := strings.Join([]string{
		`{"schema":"bloom.intent-supply-session/v1","request_id":"r1","mandate_id":"m1","prepared_contract_digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","mode":"list"}`,
		`{"schema":"bloom.intent-supply-session/v1","request_id":"r2","mandate_id":"m1","prepared_contract_digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","mode":"validate","assignments":[]}`,
	}, "\n")
	var output bytes.Buffer
	if err := runIntentSupplySession(strings.NewReader(input), &output); err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSpace(output.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("lines=%q", lines)
	}
	for index, line := range lines {
		var response intentSupplySessionResponse
		if json.Unmarshal([]byte(line), &response) != nil || response.OK || response.ErrorCode != "actor_human_approval_unavailable" || response.RequestID != []string{"r1", "r2"}[index] {
			t.Fatalf("response=%s", line)
		}
	}
}

func TestIntentSupplySessionRejectsUnknownFieldsAndModeShape(t *testing.T) {
	for _, line := range []string{
		`{"schema":"bloom.intent-supply-session/v1","request_id":"r","mandate_id":"m","prepared_contract_digest":"d","mode":"list","secret":"x"}`,
		`{"schema":"bloom.intent-supply-session/v1","request_id":"r","mandate_id":"../outside","prepared_contract_digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","mode":"list"}`,
		`{"schema":"bloom.intent-supply-session/v1","request_id":"r","mandate_id":"m","prepared_contract_digest":"sha256:GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG","mode":"list"}`,
		`{"schema":"bloom.intent-supply-session/v1","request_id":"r","mandate_id":"m","prepared_contract_digest":"d","mode":"list","assignments":[]}`,
		`{"schema":"bloom.intent-supply-session/v1","request_id":"r","mandate_id":"m","prepared_contract_digest":"d","mode":"validate"}`,
	} {
		var output bytes.Buffer
		if err := runIntentSupplySession(strings.NewReader(line), &output); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(output.String(), `"error_code":"invalid_request"`) {
			t.Fatalf("line accepted: %s => %s", line, output.String())
		}
	}
}

func TestAuthorityIntentSupplySessionCommandRequiresJSONAndStreams(t *testing.T) {
	service := AuthorityCommandServices{Run: func(string, []string) (AuthorityEvidenceReport, error) { return AuthorityEvidenceReport{}, nil }, IntentSupplySession: runIntentSupplySession}
	command := NewAuthorityCommand(service, func() bool { return true })
	command.SetArgs([]string{"intent-supply-session"})
	command.SetIn(strings.NewReader(`{"schema":"bloom.intent-supply-session/v1","request_id":"r","mandate_id":"m","prepared_contract_digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","mode":"list"}`))
	var output bytes.Buffer
	command.SetOut(&output)
	if err := command.Execute(); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(output.String(), `"error_code":"actor_human_approval_unavailable"`) {
		t.Fatal(output.String())
	}

	human := NewAuthorityCommand(service, func() bool { return false })
	human.SetArgs([]string{"intent-supply-session"})
	if err := human.Execute(); err == nil {
		t.Fatal("human mode accepted for JSON Lines protocol")
	}
}
