package temporal

import (
	"reflect"
	"testing"

	"nucleus/internal/orchestration/activities"
)

type capturingActivityRegistrar struct {
	registered []interface{}
}

func (r *capturingActivityRegistrar) RegisterActivity(activity interface{}) {
	r.registered = append(r.registered, activity)
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
