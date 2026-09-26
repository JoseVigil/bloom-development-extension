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
			KeyID: "anthropic-key:default", Purpose: "mandate_genesis_intelligence", ServicePublicKey: base64.RawURLEncoding.EncodeToString(servicePublic),
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
	if err = resolve("org", "installation", "anthropic-key:default", "mandate_genesis_intelligence", at); err != nil {
		t.Fatal(err)
	}
	if grants, evidenceErr := ActiveVaultServiceGrantEvidence(v.Store, v.Checkpoint, "org", at); evidenceErr != nil || len(grants) != 1 || grants[0].GrantID != "grant" {
		t.Fatal("active grant preflight failed", evidenceErr)
	}
	for _, binding := range [][4]string{{"other", "installation", "anthropic-key:default", "mandate_genesis_intelligence"},
		{"org", "other", "anthropic-key:default", "mandate_genesis_intelligence"}, {"org", "installation", "other", "mandate_genesis_intelligence"},
		{"org", "installation", "anthropic-key:default", "other"}} {
		if resolve(binding[0], binding[1], binding[2], binding[3], at) == nil {
			t.Fatalf("accepted mismatch: %v", binding)
		}
	}
	if resolve("org", "installation", "anthropic-key:default", "mandate_genesis_intelligence", at.Add(2*time.Hour)) == nil {
		t.Fatal("expired grant accepted")
	}
	state.Revocations = append(state.Revocations, Revocation{RevocationID: "revoke", TargetType: "vault_service_grant", TargetID: "grant", EffectiveAt: at, RecordedInAuthorityVersion: "2", ReasonCode: "master_revocation"})
	p.AuthorityVersion = "2"
	p.SnapshotID = "snapshot-2"
	p.Content, _ = json.Marshal(state)
	if _, err = v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "revoke"); err != nil {
		t.Fatal(err)
	}
	if resolve("org", "installation", "anthropic-key:default", "mandate_genesis_intelligence", at) == nil {
		t.Fatal("revoked grant accepted")
	}
	if grants, evidenceErr := ActiveVaultServiceGrantEvidence(v.Store, v.Checkpoint, "org", at); evidenceErr != nil || len(grants) != 0 {
		t.Fatal("revoked grant visible in preflight")
	}
	if err = os.Remove(v.Checkpoint.Path); err != nil {
		t.Fatal(err)
	}
	if resolve("org", "installation", "anthropic-key:default", "mandate_genesis_intelligence", at) == nil {
		t.Fatal("missing checkpoint accepted")
	}
}
