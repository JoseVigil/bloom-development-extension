package temporal

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"go.temporal.io/sdk/activity"
	"nucleus/internal/orchestration/activities"
)

func TestMandatesRootForWorker(t *testing.T) {
	nucleusRoot := filepath.Join("workspace", ".bloom", ".nucleus-example")
	if got, want := mandatesRootForWorker(nucleusRoot), filepath.Join(nucleusRoot, ".mandates"); got != want {
		t.Fatalf("mandatesRootForWorker() = %q, want %q", got, want)
	}
}

func TestEnsureAITAPStateDirDefaultsToProductAppData(t *testing.T) {
	t.Setenv("AITAP_STATE_DIR", "")
	appDataDir := t.TempDir()

	got, err := ensureAITAPStateDir(appDataDir)
	if err != nil {
		t.Fatalf("ensureAITAPStateDir: %v", err)
	}
	want := filepath.Join(appDataDir, "aitap")
	if got != want {
		t.Fatalf("ensureAITAPStateDir() = %q, want %q", got, want)
	}
	if env := os.Getenv("AITAP_STATE_DIR"); env != want {
		t.Fatalf("AITAP_STATE_DIR = %q, want %q", env, want)
	}
	if info, statErr := os.Stat(want); statErr != nil || !info.IsDir() {
		t.Fatalf("durable AITAP state directory not created: info=%v err=%v", info, statErr)
	}
}

func TestEnsureAITAPStateDirPreservesExplicitOverride(t *testing.T) {
	override := filepath.Join(t.TempDir(), "explicit-aitap-state")
	t.Setenv("AITAP_STATE_DIR", override)

	got, err := ensureAITAPStateDir(filepath.Join(t.TempDir(), "product-appdata"))
	if err != nil {
		t.Fatalf("ensureAITAPStateDir: %v", err)
	}
	if got != override {
		t.Fatalf("ensureAITAPStateDir() = %q, want explicit override %q", got, override)
	}
	if info, statErr := os.Stat(override); statErr != nil || !info.IsDir() {
		t.Fatalf("explicit AITAP state directory not created: info=%v err=%v", info, statErr)
	}
}

type capturingActivityRegistrar struct {
	registered []interface{}
	options    []activity.RegisterOptions
}

func (r *capturingActivityRegistrar) RegisterActivity(activity interface{}) {
	r.registered = append(r.registered, activity)
}

func (r *capturingActivityRegistrar) RegisterActivityWithOptions(value interface{}, options activity.RegisterOptions) {
	r.registered = append(r.registered, value)
	r.options = append(r.options, options)
}

func TestRegisterMandateGenesisSignatureActivities(t *testing.T) {
	registrar := &capturingActivityRegistrar{}

	registerMandateGenesisSignatureActivities(registrar)

	if got, want := len(registrar.registered), 5; got != want {
		t.Fatalf("registered activities = %d, want exactly %d", got, want)
	}

	tests := []struct {
		name     string
		index    int
		expected interface{}
	}{
		{name: "PersistHumanSyncActivity", index: 0, expected: activities.PersistHumanSyncActivity},
		{name: "LoadMandateBuildCheckpointActivity", index: 1, expected: activities.LoadMandateBuildCheckpointActivity},
		{name: "SignMandateActivity", index: 2, expected: activities.SignMandateActivity},
		{name: "PersistSignatureFailureActivity", index: 3, expected: activities.PersistSignatureFailureActivity},
		{name: "PersistCandidateDomainsActivity", index: 4, expected: activities.PersistCandidateDomainsActivity},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotIdentity := reflect.ValueOf(registrar.registered[tt.index]).Pointer()
			wantIdentity := reflect.ValueOf(tt.expected).Pointer()
			if gotIdentity != wantIdentity {
				t.Fatalf("registered function identity = 0x%x, want 0x%x", gotIdentity, wantIdentity)
			}
		})
	}
}

func TestRegisterGravityActivities(t *testing.T) {
	registrar := &capturingActivityRegistrar{}
	registerGravityActivities(registrar)

	if got, want := len(registrar.registered), 4; got != want {
		t.Fatalf("registered activities = %d, want %d", got, want)
	}

	tests := []struct {
		name     string
		index    int
		expected interface{}
		optName  string
	}{
		{name: "ResolveActiveGravityActivity", index: 0, expected: activities.ResolveActiveGravityActivity, optName: "resolveActiveGravityActivity"},
		{name: "EnsureGravityMandateNodeActivity", index: 1, expected: activities.EnsureGravityMandateNodeActivity, optName: "ensureGravityMandateNodeActivity"},
		{name: "CreateGravitySessionActivity", index: 2, expected: activities.CreateGravitySessionActivity, optName: "createGravitySessionActivity"},
		{name: "PersistExecutionGravityActivity", index: 3, expected: activities.PersistExecutionGravityActivity, optName: "persistExecutionGravityActivity"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotIdentity := reflect.ValueOf(registrar.registered[tt.index]).Pointer()
			wantIdentity := reflect.ValueOf(tt.expected).Pointer()
			if gotIdentity != wantIdentity {
				t.Fatalf("registered function identity = 0x%x, want 0x%x", gotIdentity, wantIdentity)
			}
			if registrar.options[tt.index].Name != tt.optName {
				t.Fatalf("activity name = %q, want %q", registrar.options[tt.index].Name, tt.optName)
			}
		})
	}
}

// MandateGenActivity debe usar el mismo resolvedor de Brain que la ingesta
// (core.ResolveBrainPath), no una ruta fija con extensión de Windows.
func TestMandateGenBrainPathUsesIngestResolver(t *testing.T) {
	brain := filepath.Join(t.TempDir(), "brain")
	if err := os.WriteFile(brain, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("BLOOM_BRAIN_PATH", brain)
	got, err := mandateGenBrainPath()
	if err != nil {
		t.Fatalf("mandateGenBrainPath: %v", err)
	}
	if got != brain {
		t.Fatalf("mandateGenBrainPath = %q, want %q", got, brain)
	}
}
