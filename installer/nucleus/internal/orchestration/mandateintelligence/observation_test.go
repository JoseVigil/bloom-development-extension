package mandateintelligence

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func runnerFor(data any) Runner {
	return func(_ context.Context, _ ...string) ([]byte, error) { return json.Marshal(data) }
}

func TestObserveRequiresFreshMatchingModelAndDigest(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	entry := map[string]any{"model": "selected:tag", "installed": true, "available": true, "manifest_sha256": strings.Repeat("a", 64)}
	readiness := map[string]any{"observed_at": now.Format(time.RFC3339), "ttl_seconds": 60, "models": map[string]any{"selected-id": entry}}
	wrap := func() Runner {
		return runnerFor(map[string]any{"status": "success", "operation": "local.preflight", "data": map[string]any{"readiness": readiness}})
	}
	if got, err := Observe(context.Background(), wrap(), "selected-id", "selected:tag", now); err != nil || got.ManifestSHA256 != strings.Repeat("a", 64) {
		t.Fatalf("observation=%+v err=%v", got, err)
	}
	entry["available"] = nil
	if _, err := Observe(context.Background(), wrap(), "selected-id", "selected:tag", now); err == nil {
		t.Fatal("unobservable model accepted")
	}
	entry["available"] = true
	entry["manifest_sha256"] = "bad"
	if _, err := Observe(context.Background(), wrap(), "selected-id", "selected:tag", now); err == nil {
		t.Fatal("bad digest accepted")
	}
	entry["manifest_sha256"] = strings.Repeat("a", 64)
	if _, err := Observe(context.Background(), wrap(), "selected-id", "other:tag", now); err == nil {
		t.Fatal("wrong model accepted")
	}
	if _, err := Observe(context.Background(), wrap(), "selected-id", "selected:tag", now.Add(61*time.Second)); err == nil {
		t.Fatal("expired observation accepted")
	}
}

func TestPolicyRequiresAppliedDenyByDefault(t *testing.T) {
	data := map[string]any{"status": "success", "operation": "route.policy", "data": map[string]any{"policy_version": "local-access-default/v1", "file_sha256": strings.Repeat("b", 64), "enforced": true, "policy": map[string]any{"default_decision": "deny"}}}
	if _, _, err := PolicyFingerprint(context.Background(), runnerFor(data)); err != nil {
		t.Fatal(err)
	}
	data["data"].(map[string]any)["enforced"] = false
	if _, _, err := PolicyFingerprint(context.Background(), runnerFor(data)); err == nil {
		t.Fatal("unenforced policy accepted")
	}
}

func TestPolicyPermissionBindsBrainGenVersionAndSelectedModel(t *testing.T) {
	grant := map[string]any{"consumer_id": "brain", "intent_types": []string{"gen"}, "policy_versions": []string{"mandate-gen-local/v1"}}
	check := map[string]any{"allowed": true, "consumer_id": "brain", "intent_type": "gen", "model_id": "selected-id",
		"policy_version": "mandate-gen-local/v1", "reason": "GRANTED", "grant": grant}
	model := map[string]any{"model_id": "selected-id", "backend_id": "local.ollama.selected-id", "enabled": true,
		"allowed_consumers": []string{"brain"}, "grants": []any{grant}}
	effective := map[string]any{"model_id": "selected-id", "backend_id": "local.ollama.selected-id", "consumer_id": "brain",
		"intent_type": "gen", "policy_version": "mandate-gen-local/v1"}
	data := map[string]any{"policy_version": "local-access-default/v1", "file_sha256": strings.Repeat("b", 64), "enforced": true,
		"check": check, "effective_grants": []any{effective}, "policy": map[string]any{"policy_version": "local-access-default/v1", "default_decision": "deny", "models": []any{model}}}
	run := func(_ context.Context, args ...string) ([]byte, error) {
		want := []string{"route", "policy", "--consumer", "brain", "--intent-type", "gen", "--policy-version", "mandate-gen-local/v1", "--model", "selected-id"}
		if len(args) != len(want) {
			t.Fatalf("wrong access query: %v", args)
		}
		for index := range want {
			if args[index] != want[index] {
				t.Fatalf("wrong access query: %v", args)
			}
		}
		return json.Marshal(map[string]any{"status": "success", "operation": "route.policy", "data": data})
	}
	checkPermission := func() error {
		_, _, err := PolicyPermission(context.Background(), run, "selected-id", "local.ollama.selected-id", "mandate-gen-local/v1")
		return err
	}
	if err := checkPermission(); err != nil {
		t.Fatal(err)
	}
	check["allowed"], check["reason"], check["grant"] = false, "NO_MATCHING_GRANT", nil
	if err := checkPermission(); err == nil {
		t.Fatal("denied permission accepted")
	}
	check["allowed"], check["reason"], check["grant"] = true, "GRANTED", grant
	check["model_id"] = "other-id"
	if err := checkPermission(); err == nil {
		t.Fatal("substituted check model accepted")
	}
	check["model_id"] = "selected-id"
	effective["model_id"] = "other-id"
	if err := checkPermission(); err == nil {
		t.Fatal("grant for another model accepted")
	}
	effective["model_id"] = "selected-id"
	model["grants"] = []any{}
	if err := checkPermission(); err == nil {
		t.Fatal("model without matching grant accepted")
	}
	model["grants"] = []any{grant}
	delete(data, "check")
	if err := checkPermission(); err == nil {
		t.Fatal("missing effective check accepted")
	}
}
