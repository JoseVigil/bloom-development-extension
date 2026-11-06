package intelligencesupply

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestAssignmentsInvokesExactAITAPCLIAndReturnsSanitizedData(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("AITAP_STATE_DIR", `C:\ambient\must-not-be-used`)
	var gotBinary string
	var gotArgs []string
	var gotInput []byte
	runner := func(_ context.Context, binary string, args []string, input []byte) ([]byte, []byte, int, error) {
		gotBinary, gotArgs, gotInput = binary, append([]string(nil), args...), append([]byte(nil), input...)
		return []byte(`{"status":"success","operation":"route.assignments","data":{"schema_version":"bloom.intent-supply-assignments/v1","operation":"list","actions":[{"action_id":"ing-1","destinations":[{"backend_id":"gemini_api","provider":"google","model":"gemini-test"}],"errors":[]}]}}`), nil, 0, nil
	}
	request := []byte(`{"schema_version":"bloom.intent-supply-assignments/v1"}`)
	data, err := (Client{Binary: "aitap-test", StateDir: stateDir, Run: runner}).Assignments(context.Background(), "list", request, `C:\routing\policy.json`, `C:\routing\registry.json`)
	if err != nil {
		t.Fatal(err)
	}
	wantArgs := []string{"--json", "route", "assignments", "--mode", "list", "--request", "-", "--policy", `C:\routing\policy.json`, "--registry", `C:\routing\registry.json`, "--state-dir", stateDir}
	if gotBinary != "aitap-test" || !reflect.DeepEqual(gotArgs, wantArgs) || !reflect.DeepEqual(gotInput, request) {
		t.Fatalf("unexpected invocation: binary=%q args=%v input=%s", gotBinary, gotArgs, gotInput)
	}
	var decoded map[string]any
	if json.Unmarshal(data, &decoded) != nil || decoded["operation"] != "list" {
		t.Fatalf("unexpected data: %s", data)
	}
}

func TestAssignmentsRejectsErrorsMalformedOutputAndSensitiveFields(t *testing.T) {
	stateDir := t.TempDir()
	cases := []struct {
		name string
		out  string
		code int
		err  error
	}{
		{"process", "", -1, errors.New("secret executable error")},
		{"exit", `{"status":"error","error":{"code":"INVALID_REQUEST"}}`, 1, errors.New("exit")},
		{"unknown-envelope", `{"status":"success","operation":"route.assignments","data":{},"extra":true}`, 0, nil},
		{"wrong-operation", `{"status":"success","operation":"route.other","data":{}}`, 0, nil},
		{"secret", `{"status":"success","operation":"route.assignments","data":{"credential_ref":"credential-ref://gemini/default"}}`, 0, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			runner := func(context.Context, string, []string, []byte) ([]byte, []byte, int, error) {
				return []byte(tc.out), []byte("stderr-secret"), tc.code, tc.err
			}
			_, err := (Client{StateDir: stateDir, Run: runner}).Assignments(context.Background(), "list", []byte(`{}`), `C:\routing\policy.json`, `C:\routing\registry.json`)
			if !errors.Is(err, ErrAssignmentsUnavailable) || err.Error() != "INTENT_SUPPLY_ASSIGNMENTS_UNAVAILABLE" {
				t.Fatalf("failure was not sanitized: %v", err)
			}
		})
	}
}

func TestAssignmentsRequiresExplicitExistingStateRoot(t *testing.T) {
	called := false
	runner := func(context.Context, string, []string, []byte) ([]byte, []byte, int, error) {
		called = true
		return nil, nil, 0, nil
	}
	for _, stateDir := range []string{"", `relative\state`, `C:\missing\aitap-state`} {
		_, err := (Client{StateDir: stateDir, Run: runner}).Assignments(context.Background(), "list", []byte(`{}`), `C:\routing\policy.json`, `C:\routing\registry.json`)
		if !errors.Is(err, ErrAssignmentsUnavailable) {
			t.Fatalf("state root %q was accepted: %v", stateDir, err)
		}
	}
	if called {
		t.Fatal("AITAP was invoked without a verified state root")
	}
}

func TestResolveStateDirUsesExplicitConfigurationOrExistingProductRoot(t *testing.T) {
	appData := t.TempDir()
	product := filepath.Join(appData, "aitap")
	if err := os.Mkdir(product, 0700); err != nil {
		t.Fatal(err)
	}
	override := t.TempDir()
	if got, err := ResolveStateDir(appData, override); err != nil || got != override {
		t.Fatalf("explicit state root not preserved: %q %v", got, err)
	}
	if got, err := ResolveStateDir(appData, ""); err != nil || got != product {
		t.Fatalf("product state root not resolved: %q %v", got, err)
	}
	if _, err := ResolveStateDir(t.TempDir(), ""); !errors.Is(err, ErrStateDirUnavailable) {
		t.Fatalf("missing product state root accepted: %v", err)
	}
}
