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
