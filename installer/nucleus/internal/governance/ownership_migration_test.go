package governance

import (
	"errors"
	ownershipcontract "nucleus/internal/governance/ownershipcontract"
	"os"
	"path/filepath"
	"testing"
)

func TestOwnershipLegacyFormats(t *testing.T) {
	cases := map[ownershipcontract.SourceFormat]string{
		FormatNucleusGoV0:         `{"org_id":"org_1","owner_id":"jose","owner_name":"Jose","created_at":"2026-09-04T10:00:00Z","team_members":[]}`,
		FormatBatcaveTypeScriptV0: `{"organization_fingerprint":"bloom:org:acme","organization_name":"Acme","master_user":"jose","key_fingerprint":"old","created_at":"2026-09-04T10:00:00Z"}`,
		FormatSupervisorOwnerV0:   `{"owner":{"source":"github_handle","subject":"jose","display_name":"Jose"},"created_at":"2026-09-04T10:00:00Z"}`,
		FormatGovernanceSpecV2:    `{"version":"2.0","organization_fingerprint":"old","owner":{"id":"jose"},"roles":{"architect":{}},"team_members":[],"created_at":"2026-09-04T10:00:00Z"}`,
	}
	for format, raw := range cases {
		t.Run(string(format), func(t *testing.T) {
			path := filepath.Join(t.TempDir(), ".ownership.json")
			os.WriteFile(path, []byte(raw), 0600)
			got, err := MigrateOwnership(path)
			if err != nil {
				t.Fatal(err)
			}
			if got.Migration.SourceFormat != format || got.LegacyAuthority.Owner.Subject != "jose" {
				t.Fatalf("unexpected migration: %+v", got)
			}
		})
	}
	t.Run(string(FormatBatcaveArchitectureV1)+"_insufficient", func(t *testing.T) {
		path := filepath.Join(t.TempDir(), ".ownership.json")
		os.WriteFile(path, []byte(`{"organization_fingerprint":"old","key_fingerprint":"old"}`), 0600)
		if _, err := MigrateOwnership(path); err == nil {
			t.Fatal("expected insufficient format rejection")
		}
	})
}

func TestOwnershipRejectsUnknownAmbiguousAndContradictory(t *testing.T) {
	for name, raw := range map[string]string{"unknown": `{"x":1}`, "ambiguous": `{"owner":{"subject":"a"},"owner_id":"b","created_at":"2026-09-04T10:00:00Z"}`, "incomplete": `{"org_id":"org","owner_id":"","created_at":"2026-09-04T10:00:00Z"}`} {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), ".ownership.json")
			os.WriteFile(path, []byte(raw), 0600)
			before, _ := os.ReadFile(path)
			if _, err := MigrateOwnership(path); err == nil {
				t.Fatal("expected rejection")
			}
			after, _ := os.ReadFile(path)
			if string(before) != string(after) {
				t.Fatal("rejection mutated source")
			}
		})
	}
}

func TestOwnershipMigrationIdempotentAndCrashConsistent(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".ownership.json")
	raw := []byte(`{"org_id":"org_1","owner_id":"jose","created_at":"2026-09-04T10:00:00Z","team_members":[]}`)
	os.WriteFile(path, raw, 0600)
	first, err := MigrateOwnership(path)
	if err != nil {
		t.Fatal(err)
	}
	persisted, _ := os.ReadFile(path)
	second, err := MigrateOwnership(path)
	if err != nil || second.Migration.MigrationID != first.Migration.MigrationID {
		t.Fatal("migration not idempotent")
	}
	again, _ := os.ReadFile(path)
	if string(persisted) != string(again) {
		t.Fatal("canonical ownership rewritten")
	}
	for _, stage := range []string{"before_ownership_rename", "after_ownership_rename"} {
		t.Run(stage, func(t *testing.T) {
			p := filepath.Join(t.TempDir(), ".ownership.json")
			os.WriteFile(p, raw, 0600)
			ownershipTransitionHook = func(s string) error {
				if s == stage {
					return errors.New("simulated crash")
				}
				return nil
			}
			defer func() { ownershipTransitionHook = nil }()
			_, err := MigrateOwnership(p)
			if err == nil {
				t.Fatal("expected crash")
			}
			data, _ := os.ReadFile(p)
			if stage == "before_ownership_rename" && string(data) != string(raw) {
				t.Fatal("pre-rename crash changed original")
			}
			if stage == "after_ownership_rename" {
				if _, err := LoadCanonicalOwnership(p); err != nil {
					t.Fatalf("post-rename state not detectable: %v", err)
				}
			}
		})
	}
}

func TestOwnershipModeBindingMatrixAndNoLegacyAfterCutover(t *testing.T) {
	now := testTime()
	canonical := "org"
	issuer := "issuer"
	o := &CanonicalOwnership{Schema: OwnershipSchema, SchemaVersion: OwnershipSchemaVersion, AuthorityMode: AuthorityRemoteEnforced, Organization: OwnershipOrganization{CanonicalID: &canonical}, Installation: OwnershipInstallation{InstallationID: "installation"}, Binding: OwnershipBinding{State: BindingRemoteLocked, IssuerID: &issuer, AcceptedAt: &now, RemoteLockedAt: &now}, TrustBinding: &TrustBinding{IssuerID: issuer, TrustAnchorID: "root", TrustAnchorFingerprintSHA256: "digest", BoundOrganizationID: canonical, BoundInstallationID: "installation", AcceptedAt: now}, CreatedAt: now, UpdatedAt: now}
	if err := ValidateCanonicalOwnership(o); err != nil {
		t.Fatal(err)
	}
	o.LegacyAuthority = &LegacyAuthority{Owner: LegacyOwner{Subject: "jose"}}
	if err := ValidateCanonicalOwnership(o); err == nil {
		t.Fatal("remote_enforced accepted legacy authority")
	}
}
