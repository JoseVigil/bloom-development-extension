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
	if got, want := len(registrar.registered), 1; got != want {
		t.Fatalf("registered activities = %d, want %d", got, want)
	}
	if reflect.ValueOf(registrar.registered[0]).Pointer() != reflect.ValueOf(activities.ResolveActiveGravityActivity).Pointer() {
		t.Fatal("ResolveActiveGravityActivity was not registered")
	}
	if registrar.options[0].Name != "resolveActiveGravityActivity" {
		t.Fatalf("activity name = %q", registrar.options[0].Name)
	}
}
