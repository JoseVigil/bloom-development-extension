package authority

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestVaultServiceGrantRequiresAcceptedSnapshotAndCheckpoint(t *testing.T) {
	p, pub, priv := fullFixture(t, "1")
	servicePublic, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 9, 4, 12, 1, 0, 0, time.UTC)
	state := FullContent{Principals: []Principal{{PrincipalID: "human", PrincipalType: "human", Status: "active", ExternalIdentities: []ExternalIdentity{}}},
		Memberships: []Membership{}, RoleDefinitions: []RoleDefinition{}, RoleAssignments: []RoleAssignment{}, Revocations: []Revocation{},
		VaultServiceGrants: []VaultServiceGrant{{GrantID: "grant", OrganizationID: "org", InstallationID: "installation", Consumer: "aitap", Permission: "vault.key.read",
			KeyID: "anthropic-key:default", Purpose: "mandate_intelligence", ServicePublicKey: base64.RawURLEncoding.EncodeToString(servicePublic),
			IssuedByPrincipalID: "human", ValidFrom: at.Add(-time.Minute), ValidUntil: at.Add(time.Hour)}}}
	p.Content, _ = json.Marshal(state)
	dir := t.TempDir()
	v := &Verifier{Trust: TrustBundle{"issuer": {"key": pub}}, Binding: Binding{"org", "issuer", "installation"},
		Store: &Store{Path: filepath.Join(dir, "state.json")}, Checkpoint: &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}, Now: func() time.Time { return at }}
	if _, err = v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "grant"); err != nil {
		t.Fatal(err)
	}
	resolve := func(org, installation, key, purpose string, when time.Time) error {
		_, err := ResolveVaultServiceGrant(v.Store, v.Checkpoint, org, installation, "grant", key, purpose, when)
		return err
	}
	if err = resolve("org", "installation", "anthropic-key:default", "mandate_intelligence", at); err != nil {
		t.Fatal(err)
	}
	if resolve("org", "installation", "anthropic-key:default", "mandate_genesis_intelligence", at) == nil {
		t.Fatal("new-purpose grant accepted for legacy-purpose request")
	}
	if grants, evidenceErr := ActiveVaultServiceGrantEvidence(v.Store, v.Checkpoint, "org", at); evidenceErr != nil || len(grants) != 1 || grants[0].GrantID != "grant" {
		t.Fatal("active grant preflight failed", evidenceErr)
	}
	for _, binding := range [][4]string{{"other", "installation", "anthropic-key:default", "mandate_intelligence"},
		{"org", "other", "anthropic-key:default", "mandate_intelligence"}, {"org", "installation", "other", "mandate_intelligence"},
		{"org", "installation", "anthropic-key:default", "other"}} {
		if resolve(binding[0], binding[1], binding[2], binding[3], at) == nil {
			t.Fatalf("accepted mismatch: %v", binding)
		}
	}
	if resolve("org", "installation", "anthropic-key:default", "mandate_intelligence", at.Add(2*time.Hour)) == nil {
		t.Fatal("expired grant accepted")
	}
	state.Revocations = append(state.Revocations, Revocation{RevocationID: "revoke", TargetType: "vault_service_grant", TargetID: "grant", EffectiveAt: at, RecordedInAuthorityVersion: "2", ReasonCode: "master_revocation"})
	p.AuthorityVersion = "2"
	p.SnapshotID = "snapshot-2"
	p.Content, _ = json.Marshal(state)
	if _, err = v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "revoke"); err != nil {
		t.Fatal(err)
	}
	if resolve("org", "installation", "anthropic-key:default", "mandate_intelligence", at) == nil {
		t.Fatal("revoked grant accepted")
	}
	if grants, evidenceErr := ActiveVaultServiceGrantEvidence(v.Store, v.Checkpoint, "org", at); evidenceErr != nil || len(grants) != 0 {
		t.Fatal("revoked grant visible in preflight")
	}
	if err = os.Remove(v.Checkpoint.Path); err != nil {
		t.Fatal(err)
	}
	if resolve("org", "installation", "anthropic-key:default", "mandate_intelligence", at) == nil {
		t.Fatal("missing checkpoint accepted")
	}
}

func TestLegacyVaultPurposeRemainsBoundToLegacyRequests(t *testing.T) {
	p, pub, priv := fullFixture(t, "1")
	servicePublic, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 9, 4, 12, 1, 0, 0, time.UTC)
	state := FullContent{Principals: []Principal{{PrincipalID: "human", PrincipalType: "human", Status: "active", ExternalIdentities: []ExternalIdentity{}}},
		Memberships: []Membership{}, RoleDefinitions: []RoleDefinition{}, RoleAssignments: []RoleAssignment{}, Revocations: []Revocation{},
		VaultServiceGrants: []VaultServiceGrant{{GrantID: "legacy", OrganizationID: "org", InstallationID: "installation", Consumer: "aitap", Permission: "vault.key.read",
			KeyID: "anthropic-key:default", Purpose: "mandate_genesis_intelligence", ServicePublicKey: base64.RawURLEncoding.EncodeToString(servicePublic),
			IssuedByPrincipalID: "human", ValidFrom: at.Add(-time.Minute), ValidUntil: at.Add(time.Hour)}}}
	p.Content, _ = json.Marshal(state)
	dir := t.TempDir()
	v := &Verifier{Trust: TrustBundle{"issuer": {"key": pub}}, Binding: Binding{"org", "issuer", "installation"},
		Store: &Store{Path: filepath.Join(dir, "state.json")}, Checkpoint: &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}, Now: func() time.Time { return at }}
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "legacy"); err != nil {
		t.Fatal(err)
	}
	if _, err := ResolveVaultServiceGrant(v.Store, v.Checkpoint, "org", "installation", "legacy", "anthropic-key:default", "mandate_genesis_intelligence", at); err != nil {
		t.Fatal("legacy grant rejected for legacy request", err)
	}
	if _, err := ResolveVaultServiceGrant(v.Store, v.Checkpoint, "org", "installation", "legacy", "anthropic-key:default", "mandate_intelligence", at); err == nil {
		t.Fatal("legacy grant accepted for new-purpose request")
	}
}

func TestVaultWriteGrantCannotBeReusedForReadOrOtherKeys(t *testing.T) {
	p, pub, priv := fullFixture(t, "1")
	servicePublic, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 9, 4, 12, 1, 0, 0, time.UTC)
	state := FullContent{Principals: []Principal{{PrincipalID: "human", PrincipalType: "human", Status: "active", ExternalIdentities: []ExternalIdentity{}}},
		Memberships: []Membership{}, RoleDefinitions: []RoleDefinition{}, RoleAssignments: []RoleAssignment{}, Revocations: []Revocation{},
		VaultServiceGrants: []VaultServiceGrant{{GrantID: "gemini-grant", OrganizationID: "org", InstallationID: "installation", Consumer: "onboarding", Permission: "vault.key.write",
			KeyID: "gemini-key:default", Purpose: "onboarding_gemini", ServicePublicKey: base64.RawURLEncoding.EncodeToString(servicePublic),
			IssuedByPrincipalID: "human", ValidFrom: at.Add(-time.Minute), ValidUntil: at.Add(time.Hour)}}}
	p.Content, _ = json.Marshal(state)
	dir := t.TempDir()
	v := &Verifier{Trust: TrustBundle{"issuer": {"key": pub}}, Binding: Binding{"org", "issuer", "installation"},
		Store: &Store{Path: filepath.Join(dir, "state.json")}, Checkpoint: &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}, Now: func() time.Time { return at }}
	if _, err = v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "write-grant"); err != nil {
		t.Fatal(err)
	}
	if _, err = ResolveVaultWriteGrant(v.Store, v.Checkpoint, "org", "installation", "gemini-grant", "gemini-key:default", "onboarding_gemini", at); err != nil {
		t.Fatal(err)
	}
	if _, err = ResolveVaultServiceGrant(v.Store, v.Checkpoint, "org", "installation", "gemini-grant", "gemini-key:default", "onboarding_gemini", at); err == nil {
		t.Fatal("write grant accepted as read")
	}
	for _, binding := range [][2]string{{"anthropic-key:default", "onboarding_gemini"}, {"gemini-key:default", "mandate_gen_intelligence"}} {
		if _, err = ResolveVaultWriteGrant(v.Store, v.Checkpoint, "org", "installation", "gemini-grant", binding[0], binding[1], at); err == nil {
			t.Fatalf("write grant accepted invalid binding: %v", binding)
		}
	}
}

func TestModelsAPIHealthProbeGrantIsPurposeAndKeyBound(t *testing.T) {
	p, pub, priv := fullFixture(t, "1")
	servicePublic, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 9, 4, 12, 1, 0, 0, time.UTC)
	const anthropicProbe = "models_api_health_probe:anthropic_api"
	const geminiProbe = "models_api_health_probe:gemini_api"
	state := FullContent{Principals: []Principal{{PrincipalID: "human", PrincipalType: "human", Status: "active", ExternalIdentities: []ExternalIdentity{}}},
		Memberships: []Membership{}, RoleDefinitions: []RoleDefinition{}, RoleAssignments: []RoleAssignment{}, Revocations: []Revocation{},
		VaultServiceGrants: []VaultServiceGrant{
			{GrantID: "anthropic-probe", OrganizationID: "org", InstallationID: "installation", Consumer: "aitap", Permission: "vault.key.read", KeyID: "anthropic-key:default", Purpose: anthropicProbe, ServicePublicKey: base64.RawURLEncoding.EncodeToString(servicePublic), IssuedByPrincipalID: "human", ValidFrom: at.Add(-time.Minute), ValidUntil: at.Add(time.Hour)},
			{GrantID: "gemini-probe", OrganizationID: "org", InstallationID: "installation", Consumer: "aitap", Permission: "vault.key.read", KeyID: "gemini-key:default", Purpose: geminiProbe, ServicePublicKey: base64.RawURLEncoding.EncodeToString(servicePublic), IssuedByPrincipalID: "human", ValidFrom: at.Add(-time.Minute), ValidUntil: at.Add(time.Hour)},
			{GrantID: "supply", OrganizationID: "org", InstallationID: "installation", Consumer: "aitap", Permission: "vault.key.read", KeyID: "gemini-key:default", Purpose: "mandate_intelligence", ServicePublicKey: base64.RawURLEncoding.EncodeToString(servicePublic), IssuedByPrincipalID: "human", ValidFrom: at.Add(-time.Minute), ValidUntil: at.Add(time.Hour)},
		}}
	p.Content, _ = json.Marshal(state)
	dir := t.TempDir()
	v := &Verifier{Trust: TrustBundle{"issuer": {"key": pub}}, Binding: Binding{"org", "issuer", "installation"},
		Store: &Store{Path: filepath.Join(dir, "state.json")}, Checkpoint: &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}, Now: func() time.Time { return at }}
	if _, err = v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "models-probe"); err != nil {
		t.Fatal(err)
	}
	resolve := func(grant, key, purpose string, when time.Time) error {
		_, resolveErr := ResolveVaultServiceGrant(v.Store, v.Checkpoint, "org", "installation", grant, key, purpose, when)
		return resolveErr
	}
	if err = resolve("anthropic-probe", "anthropic-key:default", anthropicProbe, at); err != nil {
		t.Fatal("approved Anthropic probe rejected", err)
	}
	if err = resolve("gemini-probe", "gemini-key:default", geminiProbe, at); err != nil {
		t.Fatal("approved Gemini probe rejected", err)
	}
	for name, request := range map[string][3]string{
		"wrong key":                {"gemini-probe", "anthropic-key:default", geminiProbe},
		"wrong backend purpose":    {"gemini-probe", "gemini-key:default", anthropicProbe},
		"supply grant for probe":   {"supply", "gemini-key:default", geminiProbe},
		"probe grant for supply":   {"gemini-probe", "gemini-key:default", "mandate_intelligence"},
		"different probe grant id": {"anthropic-probe", "gemini-key:default", geminiProbe},
	} {
		if resolve(request[0], request[1], request[2], at) == nil {
			t.Fatalf("%s was accepted", name)
		}
	}
	if resolve("gemini-probe", "gemini-key:default", geminiProbe, at.Add(2*time.Hour)) == nil {
		t.Fatal("expired probe grant accepted")
	}
	state.Revocations = append(state.Revocations, Revocation{RevocationID: "revoke-probe", TargetType: "vault_service_grant", TargetID: "gemini-probe", EffectiveAt: at, RecordedInAuthorityVersion: "2", ReasonCode: "master_revocation"})
	p.AuthorityVersion, p.SnapshotID = "2", "snapshot-2"
	p.Content, _ = json.Marshal(state)
	if _, err = v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "revoke-models-probe"); err != nil {
		t.Fatal(err)
	}
	if resolve("gemini-probe", "gemini-key:default", geminiProbe, at) == nil {
		t.Fatal("revoked probe grant accepted")
	}
}
