package temporal

import (
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

	if got, want := len(registrar.registered), 3; got != want {
		t.Fatalf("registered activities = %d, want exactly %d", got, want)
	}

	tests := []struct {
		name     string
		index    int
		expected interface{}
	}{
		{name: "PersistHumanSyncActivity", index: 0, expected: activities.PersistHumanSyncActivity},
		{name: "SignMandateActivity", index: 1, expected: activities.SignMandateActivity},
		{name: "PersistSignatureFailureActivity", index: 2, expected: activities.PersistSignatureFailureActivity},
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
