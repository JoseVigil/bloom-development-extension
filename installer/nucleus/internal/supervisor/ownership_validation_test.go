package supervisor

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSupervisorOwnershipValidationUsesGovernanceContract(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".ownership.json")
	legacy := []byte(`{"org_id":"org","owner_id":"jose","created_at":"2026-09-04T10:00:00Z","team_members":[]}`)
	if err := os.WriteFile(path, legacy, 0600); err != nil {
		t.Fatal(err)
	}
	if err := validateOwnershipFile(path); err != nil {
		t.Fatal(err)
	}
	canonical, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(canonical) == string(legacy) {
		t.Fatal("supervisor validation did not invoke canonical migration")
	}
	invalid := []byte(`{"owner":{"subject":"a"},"owner_id":"b","created_at":"2026-09-04T10:00:00Z"}`)
	if err := os.WriteFile(path, invalid, 0600); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(path)
	if err := validateOwnershipFile(path); err == nil {
		t.Fatal("contradictory ownership accepted")
	}
	after, _ := os.ReadFile(path)
	if string(before) != string(after) {
		t.Fatal("rejection mutated ownership")
	}
}
