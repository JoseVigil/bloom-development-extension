package activities

import (
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
)

func fixtureTurnRef(t *testing.T) BSIPTurnRef {
	t.Helper()
	return BSIPTurnRef{
		NucleusPath: t.TempDir(),
		IntentID:    "11111111-2222-5333-8444-555555555555",
		IntentType:  "ing",
		Stage:       "consolidation",
		TurnID:      "7",
	}
}

func successEnvelope(operation string, ref BSIPTurnRef, extra map[string]interface{}) []byte {
	data := map[string]interface{}{
		"intent_id": ref.IntentID, "intent_type": ref.IntentType,
		"stage": ref.Stage, "turn_id": ref.TurnID,
	}
	for key, value := range extra {
		data[key] = value
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"status": "success", "operation": operation, "data": data,
	})
	return payload
}

func TestBrainBSIPEffectMarkBuildsExactCommandAndCorrelates(t *testing.T) {
	ref := fixtureTurnRef(t)
	input := MarkBSIPEffectAppliedInput{
		BSIPTurnRef: ref,
		EffectID:    "effect-123",
		Evidence:    map[string]interface{}{"sha256": "abc", "verified": true},
	}
	wantPrefix := []string{
		"--json", "intent", "mark-effect-applied",
		"--nucleus-path", ref.NucleusPath,
		"--intent-id", ref.IntentID,
		"--stage", ref.Stage,
		"--turn-id", ref.TurnID,
		"--effect-id", input.EffectID,
		"--evidence-json",
	}
	runner := func(path string, args []string) ([]byte, []byte, int, error) {
		if path != "fixture-brain" {
			t.Fatalf("brain path = %q", path)
		}
		if len(args) != len(wantPrefix)+1 || !reflect.DeepEqual(args[:len(wantPrefix)], wantPrefix) {
			t.Fatalf("args = %#v, want prefix %#v plus evidence", args, wantPrefix)
		}
		var evidence map[string]interface{}
		if err := json.Unmarshal([]byte(args[len(args)-1]), &evidence); err != nil {
			t.Fatalf("invalid evidence JSON: %v", err)
		}
		if evidence["sha256"] != "abc" || evidence["verified"] != true {
			t.Fatalf("evidence = %#v", evidence)
		}
		return successEnvelope("intent_mark_effect_applied", ref, map[string]interface{}{
			"effect_id": input.EffectID, "obligation": "gene_lineage_materialized",
			"effect_status": "applied", "ledger_state": "applying",
		}), nil, 0, nil
	}

	result, err := markBSIPEffectAppliedWithRunner("fixture-brain", input, runner)
	if err != nil {
		t.Fatalf("markBSIPEffectAppliedWithRunner() error: %v", err)
	}
	if result.EffectID != input.EffectID || result.EffectStatus != "applied" {
		t.Fatalf("result = %#v", result)
	}
}

func TestBrainBSIPEffectCommandsAreIdempotent(t *testing.T) {
	ref := fixtureTurnRef(t)
	commitCalls := 0
	commitRunner := func(_ string, args []string) ([]byte, []byte, int, error) {
		commitCalls++
		if args[2] != "commit-turn" {
			t.Fatalf("command = %q", args[2])
		}
		return successEnvelope("intent_commit_turn", ref, map[string]interface{}{
			"committed": true, "already_committed": commitCalls > 1,
		}), nil, 0, nil
	}
	first, err := commitBSIPTurnWithRunner("fixture-brain", ref, commitRunner)
	if err != nil || first.AlreadyCommitted {
		t.Fatalf("first commit = %#v, err=%v", first, err)
	}
	second, err := commitBSIPTurnWithRunner("fixture-brain", ref, commitRunner)
	if err != nil || !second.AlreadyCommitted {
		t.Fatalf("retry commit = %#v, err=%v", second, err)
	}

	advanceCalls := 0
	advanceRunner := func(_ string, args []string) ([]byte, []byte, int, error) {
		advanceCalls++
		if args[2] != "advance-turn" {
			t.Fatalf("command = %q", args[2])
		}
		return successEnvelope("intent_advance_turn", ref, map[string]interface{}{
			"state_advanced": true, "already_advanced": advanceCalls > 1,
			"phase_active": "done",
		}), nil, 0, nil
	}
	firstAdvance, err := advanceBSIPTurnWithRunner("fixture-brain", ref, advanceRunner)
	if err != nil || firstAdvance.AlreadyAdvanced {
		t.Fatalf("first advance = %#v, err=%v", firstAdvance, err)
	}
	retryAdvance, err := advanceBSIPTurnWithRunner("fixture-brain", ref, advanceRunner)
	if err != nil || !retryAdvance.AlreadyAdvanced {
		t.Fatalf("retry advance = %#v, err=%v", retryAdvance, err)
	}
}

func TestBrainBSIPEffectCommitRetryAfterAdvance(t *testing.T) {
	ref := fixtureTurnRef(t)
	runner := func(_ string, args []string) ([]byte, []byte, int, error) {
		switch args[2] {
		case "advance-turn":
			return successEnvelope("intent_advance_turn", ref, map[string]interface{}{
				"state_advanced": true, "already_advanced": false, "phase_active": "done",
			}), nil, 0, nil
		case "commit-turn":
			return successEnvelope("intent_commit_turn", ref, map[string]interface{}{
				"committed": true, "already_committed": true, "phase_active": "done",
			}), nil, 0, nil
		default:
			t.Fatalf("unexpected command %q", args[2])
			return nil, nil, -1, errors.New("unreachable")
		}
	}
	if _, err := advanceBSIPTurnWithRunner("fixture-brain", ref, runner); err != nil {
		t.Fatalf("advance error: %v", err)
	}
	result, err := commitBSIPTurnWithRunner("fixture-brain", ref, runner)
	if err != nil || !result.AlreadyCommitted || result.PhaseActive != "done" {
		t.Fatalf("post-advance commit retry = %#v, err=%v", result, err)
	}
}

func TestBrainBSIPEffectRejectsEmptyEvidenceAndCorrelationMismatch(t *testing.T) {
	ref := fixtureTurnRef(t)
	_, err := markBSIPEffectAppliedWithRunner("fixture-brain", MarkBSIPEffectAppliedInput{
		BSIPTurnRef: ref, EffectID: "effect-1", Evidence: map[string]interface{}{},
	}, func(string, []string) ([]byte, []byte, int, error) {
		t.Fatal("runner must not be called for empty evidence")
		return nil, nil, 0, nil
	})
	if err == nil || !strings.Contains(err.Error(), "evidence") {
		t.Fatalf("empty evidence error = %v", err)
	}

	runner := func(string, []string) ([]byte, []byte, int, error) {
		wrong := ref
		wrong.IntentID = "different-intent"
		return successEnvelope("intent_commit_turn", wrong, map[string]interface{}{
			"committed": true, "already_committed": false,
		}), nil, 0, nil
	}
	_, err = commitBSIPTurnWithRunner("fixture-brain", ref, runner)
	if err == nil || !strings.Contains(err.Error(), "correlación") {
		t.Fatalf("correlation error = %v", err)
	}
}

func TestRunBrainIntentJSONMapsStructuredExitCodes(t *testing.T) {
	cases := []struct {
		exitCode  int
		code      string
		retryable bool
	}{
		{1, "INTERNAL_ERROR", true},
		{2, "INVALID_ARGUMENT", false},
		{2, "INVALID_EVIDENCE_JSON", false},
		{3, "LEDGER_NOT_FOUND", true},
		{4, "EVIDENCE_CONFLICT", false},
		{5, "EFFECTS_PENDING", true},
		{6, "PERSISTENCE_ERROR", true},
	}
	for _, tc := range cases {
		t.Run(tc.code, func(t *testing.T) {
			envelope, _ := json.Marshal(map[string]interface{}{
				"status": "error", "operation": "intent_commit_turn",
				"error": map[string]interface{}{
					"code": tc.code, "message": "fixture error", "retryable": tc.retryable,
					"details": map[string]interface{}{"stage": "consolidation"},
				},
				"exit_code": tc.exitCode,
			})
			runner := func(string, []string) ([]byte, []byte, int, error) {
				return envelope, nil, tc.exitCode, errors.New("exit status")
			}
			_, err := runBrainIntentJSONWithRunner("fixture-brain", []string{"--json", "intent", "commit-turn"}, runner)
			var cliErr *BrainCLIError
			if !errors.As(err, &cliErr) {
				t.Fatalf("error type = %T, want *BrainCLIError", err)
			}
			if cliErr.ExitCode != tc.exitCode || cliErr.Code != tc.code || cliErr.Retryable != tc.retryable {
				t.Fatalf("mapped error = %#v", cliErr)
			}
		})
	}
}

func TestRunBrainIntentJSONDistinguishesTyperExitTwo(t *testing.T) {
	runner := func(string, []string) ([]byte, []byte, int, error) {
		return nil, []byte("No such option: --bad"), 2, errors.New("exit status 2")
	}
	_, err := runBrainIntentJSONWithRunner("fixture-brain", []string{"--json", "intent", "commit-turn", "--bad"}, runner)
	var cliErr *BrainCLIError
	if !errors.As(err, &cliErr) || cliErr.Code != "UNSTRUCTURED_CLI_ERROR" || cliErr.ExitCode != 2 {
		t.Fatalf("Typer error = %#v (%v)", cliErr, err)
	}
}

func TestRunBrainIntentJSONRejectsExitCodeMismatchAndInvalidJSON(t *testing.T) {
	envelope := []byte(`{"status":"error","operation":"intent_commit_turn","error":{"code":"EFFECTS_PENDING","message":"pending","retryable":true,"details":{}},"exit_code":5}`)
	_, err := runBrainIntentJSONWithRunner("fixture-brain", []string{"commit-turn"}, func(string, []string) ([]byte, []byte, int, error) {
		return envelope, nil, 4, errors.New("exit status 4")
	})
	var cliErr *BrainCLIError
	if !errors.As(err, &cliErr) || cliErr.Code != "PROTOCOL_EXIT_CODE_MISMATCH" {
		t.Fatalf("mismatch error = %#v (%v)", cliErr, err)
	}

	_, err = runBrainIntentJSONWithRunner("fixture-brain", []string{"commit-turn"}, func(string, []string) ([]byte, []byte, int, error) {
		return []byte("not-json"), nil, 0, nil
	})
	if !errors.As(err, &cliErr) || cliErr.Code != "INVALID_JSON_RESPONSE" {
		t.Fatalf("invalid JSON error = %#v (%v)", cliErr, err)
	}
}
