package authority

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func signedFixture(t *testing.T, p SnapshotPayload, priv ed25519.PrivateKey, keyID string) []byte {
	t.Helper()
	payload, _ := json.Marshal(p)
	canonical, err := Canonicalize(payload)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(canonical)
	sig := ed25519.Sign(priv, append(append([]byte(signatureDomain), 0), canonical...))
	raw, _ := json.Marshal(Envelope{Payload: payload, Integrity: Integrity{Canonicalization: "JCS-RFC8785", DigestAlgorithm: "SHA-256", Digest: base64.RawURLEncoding.EncodeToString(sum[:]), SignatureAlgorithm: "Ed25519", KeyID: keyID, Signature: base64.RawURLEncoding.EncodeToString(sig)}})
	return raw
}
func fullFixture(t *testing.T, version string) (SnapshotPayload, ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	now := time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)
	content, _ := json.Marshal(FullContent{Principals: []Principal{}, Memberships: []Membership{}, RoleDefinitions: []RoleDefinition{}, RoleAssignments: []RoleAssignment{}, Revocations: []Revocation{}})
	return SnapshotPayload{Schema: "bloom.authority.snapshot", SchemaVersion: "1.0", Kind: "full", SnapshotID: "snap-" + version, Issuer: "issuer", OrganizationID: "org", AuthorityVersion: version, IssuedAt: now, NotBefore: now, ExpiresAt: now.Add(time.Hour), Audience: Audience{OrganizationID: "org", InstallationIDs: []string{"installation"}}, Content: content}, pub, priv
}
func verifierFixture(t *testing.T, pub ed25519.PublicKey) *Verifier {
	return &Verifier{Trust: TrustBundle{"issuer": {"key": pub}}, Binding: Binding{OrganizationID: "org", Issuer: "issuer", InstallationID: "installation"}, Store: &Store{Path: filepath.Join(t.TempDir(), "authority-state.json")}, Now: func() time.Time { return time.Date(2026, 9, 4, 12, 1, 0, 0, time.UTC) }}
}

func intelligenceGrantFixture(now time.Time) IntelligenceSupplyGrant {
	replaced := "grant-old"
	return IntelligenceSupplyGrant{
		GrantID: "grant-new", OrganizationID: "org", InstallationIDs: []string{"installation"},
		ConsumerID: "brain", ActorPrincipalID: "actor", Purpose: "mandate_intelligence",
		AllowedCapabilities: []string{"structured_output", "text.generate"}, AllowedPrivacy: []string{"approved_cloud"},
		AllowedDestinations: []IntelligenceSupplyDestination{{Provider: "anthropic", BackendID: "anthropic_api", Models: []string{"model-a"}}},
		Limits:              IntelligenceSupplyLimits{MaxTotalTokens: 10000, MaxOutputTokensPerInference: 2000, MaxInferences: 5, MaxUSD: "1.500000"},
		IssuedByPrincipalID: "issuer-human", ValidFrom: now.Add(-time.Minute), ValidUntil: now.Add(time.Hour), ReplacesGrantID: &replaced,
	}
}

func full11Fixture(t *testing.T, version string) (SnapshotPayload, ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	p, pub, priv := fullFixture(t, version)
	p.SchemaVersion = "1.1"
	now := p.IssuedAt
	grants := []IntelligenceSupplyGrant{}
	content := FullContent{
		Principals:      []Principal{{PrincipalID: "actor", PrincipalType: "human", Status: "active", ExternalIdentities: []ExternalIdentity{}}, {PrincipalID: "issuer-human", PrincipalType: "human", Status: "active", ExternalIdentities: []ExternalIdentity{}}},
		Memberships:     []Membership{{MembershipID: "membership", PrincipalID: "actor", OrganizationID: "org", Status: "active", ValidFrom: now.Add(-time.Hour), AcceptedAt: now.Add(-time.Hour)}},
		RoleDefinitions: []RoleDefinition{}, RoleAssignments: []RoleAssignment{}, Revocations: []Revocation{}, IntelligenceSupplyGrants: &grants,
	}
	p.Content, _ = json.Marshal(content)
	return p, pub, priv
}

func TestSnapshotAcceptReplayDowngradeConflictAndExpiry(t *testing.T) {
	p, pub, priv := fullFixture(t, "2")
	v := verifierFixture(t, pub)
	raw := signedFixture(t, p, priv, "key")
	first, err := v.VerifyAndAccept(raw, "c1")
	if err != nil {
		t.Fatal(err)
	}
	again, err := v.VerifyAndAccept(raw, "c2")
	if err != nil || len(again.Journal) != len(first.Journal) {
		t.Fatal("replay not idempotent")
	}
	p.AuthorityVersion = "1"
	p.SnapshotID = "old"
	if _, err = v.VerifyAndAccept(signedFixture(t, p, priv, "key"), ""); err == nil {
		t.Fatal("downgrade accepted")
	}
	p.AuthorityVersion = "2"
	p.SnapshotID = "conflict"
	p.IssuedAt = p.IssuedAt.Add(time.Second)
	if _, err = v.VerifyAndAccept(signedFixture(t, p, priv, "key"), ""); err == nil {
		t.Fatal("equivocation accepted")
	}
	p.AuthorityVersion = "3"
	p.ExpiresAt = v.Now().Add(-time.Second)
	if _, err = v.VerifyAndAccept(signedFixture(t, p, priv, "key"), ""); err == nil {
		t.Fatal("expired snapshot accepted")
	}
}

func TestSnapshotRejectsIntegrityBindingAudienceAndUnknownFields(t *testing.T) {
	p, pub, priv := fullFixture(t, "1")
	v := verifierFixture(t, pub)
	raw := signedFixture(t, p, priv, "key")
	raw[len(raw)-2] ^= 1
	if _, err := v.VerifyAndAccept(raw, ""); err == nil {
		t.Fatal("tampering accepted")
	}
	p.OrganizationID = "other"
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), ""); err == nil {
		t.Fatal("wrong organization accepted")
	}
	p.OrganizationID = "org"
	p.Audience.InstallationIDs = []string{"other"}
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), ""); err == nil {
		t.Fatal("wrong audience accepted")
	}
	duplicate := []byte(`{"payload":{},"payload":{},"integrity":{}}`)
	if _, _, err := ParseAndVerifyEnvelope(duplicate, nil); err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Fatal("duplicate key accepted")
	}
}

func TestSnapshotDeltaGapRequiresFull(t *testing.T) {
	p, pub, priv := fullFixture(t, "1")
	v := verifierFixture(t, pub)
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), ""); err != nil {
		t.Fatal(err)
	}
	base := "0"
	delta, _ := json.Marshal(DeltaContent{ResultDigest: "x", Operations: []DeltaOperation{}})
	p.Kind = "delta"
	p.AuthorityVersion = "2"
	p.BaseAuthorityVersion = &base
	p.Content = delta
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), ""); err == nil {
		t.Fatal("delta gap accepted")
	}
}

func TestSnapshotDeltaAppliesAllCollectionsAndConvergesWithFull(t *testing.T) {
	p, pub, priv := fullFixture(t, "1")
	v := verifierFixture(t, pub)
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "full-1"); err != nil {
		t.Fatal(err)
	}
	now := p.IssuedAt
	principal := Principal{PrincipalID: "p1", PrincipalType: "human", Status: "active", ExternalIdentities: []ExternalIdentity{}}
	membership := Membership{MembershipID: "m1", PrincipalID: "p1", OrganizationID: "org", Status: "active", ValidFrom: now, AcceptedAt: now}
	role := RoleDefinition{RoleID: "custom", RoleVersion: "1", RoleOrigin: "organization", DisplayName: "Custom", Status: "active", Permissions: []string{"intent.create"}}
	assignment := RoleAssignment{AssignmentID: "a1", MembershipID: "m1", RoleID: "custom", RoleVersion: "1", Scope: Scope{Type: "organization", ID: "org"}, Status: "active", ValidFrom: now, AcceptedAt: now}
	revocation := Revocation{RevocationID: "r1", TargetType: "role_assignment", TargetID: "old", EffectiveAt: now, RecordedInAuthorityVersion: "2", ReasonCode: "test"}
	result := FullContent{Principals: []Principal{principal}, Memberships: []Membership{membership}, RoleDefinitions: []RoleDefinition{role}, RoleAssignments: []RoleAssignment{assignment}, Revocations: []Revocation{revocation}}
	normalizeProjection(&result)
	resultRaw, _ := json.Marshal(result)
	resultCanonical, err := Canonicalize(resultRaw)
	if err != nil {
		t.Fatal(err)
	}
	resultSum := sha256.Sum256(resultCanonical)
	value := func(v any) json.RawMessage { raw, _ := json.Marshal(v); return raw }
	delta := DeltaContent{ResultDigest: base64.RawURLEncoding.EncodeToString(resultSum[:]), Operations: []DeltaOperation{
		{Sequence: "1", Operation: "upsert", Collection: "principals", EntityID: "p1", Value: value(principal)},
		{Sequence: "2", Operation: "upsert", Collection: "memberships", EntityID: "m1", Value: value(membership)},
		{Sequence: "3", Operation: "upsert", Collection: "role_definitions", EntityID: "custom", Value: value(role)},
		{Sequence: "4", Operation: "upsert", Collection: "role_assignments", EntityID: "a1", Value: value(assignment)},
		{Sequence: "5", Operation: "upsert", Collection: "revocations", EntityID: "r1", Value: value(revocation)},
	}}
	deltaRaw, _ := json.Marshal(delta)
	base := "1"
	p.Kind, p.AuthorityVersion, p.BaseAuthorityVersion, p.SnapshotID, p.Content = "delta", "2", &base, "delta-2", deltaRaw
	state, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "delta")
	if err != nil {
		t.Fatal(err)
	}
	got, _ := json.Marshal(state.Projection)
	if string(got) != string(resultRaw) {
		t.Fatalf("delta did not converge\n got %s\nwant %s", got, resultRaw)
	}
}

func TestSnapshotAcceptanceCrashRecovery(t *testing.T) {
	p, pub, priv := fullFixture(t, "1")
	v := verifierFixture(t, pub)
	raw := signedFixture(t, p, priv, "key")
	authorityStoreHook = func(stage string) error {
		if stage == "before_rename" {
			return errors.New("simulated crash")
		}
		return nil
	}
	if _, err := v.VerifyAndAccept(raw, "before"); err == nil {
		t.Fatal("expected pre-rename crash")
	}
	authorityStoreHook = nil
	if _, err := os.Stat(v.Store.Path); !os.IsNotExist(err) {
		t.Fatal("pre-rename crash published state")
	}
	authorityStoreHook = func(stage string) error {
		if stage == "after_rename" {
			return errors.New("simulated crash")
		}
		return nil
	}
	if _, err := v.VerifyAndAccept(raw, "after"); err == nil {
		t.Fatal("expected post-rename crash signal")
	}
	authorityStoreHook = nil
	state, err := v.VerifyAndAccept(raw, "retry")
	if err != nil {
		t.Fatal(err)
	}
	if state.Monotonic.HighWaterMark != "1" || len(state.Journal) != 1 {
		t.Fatalf("retry did not converge: %+v", state)
	}
}

func TestJCSRFC8785NormativeVectors(t *testing.T) {
	vectors := []struct{ input, want string }{
		{`{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001]}`, `{"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27]}`},
		{`{"string":"€$\u000f\nA'B\"\\\"/"}`, `{"string":"€$\u000f\nA'B\"\\\"/"}`},
		{`{"\u20ac":"Euro Sign","\r":"Carriage Return","\ufb33":"Hebrew Letter Dalet With Dagesh","1":"One","😀":"Emoji: Grinning Face","\u0080":"Control","ö":"Latin Small Letter O With Diaeresis"}`, "{\"\\r\":\"Carriage Return\",\"1\":\"One\",\"\u0080\":\"Control\",\"ö\":\"Latin Small Letter O With Diaeresis\",\"€\":\"Euro Sign\",\"😀\":\"Emoji: Grinning Face\",\"דּ\":\"Hebrew Letter Dalet With Dagesh\"}"},
	}
	for _, vector := range vectors {
		got, err := Canonicalize([]byte(vector.input))
		if err != nil {
			t.Fatal(err)
		}
		if string(got) != vector.want {
			t.Fatalf("JCS mismatch\n got: %s\nwant: %s", got, vector.want)
		}
	}
}

func TestSnapshotRejectedCandidateDoesNotMutateDurableState(t *testing.T) {
	p, pub, priv := fullFixture(t, "2")
	v := verifierFixture(t, pub)
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "accepted"); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(v.Store.Path)
	if err != nil {
		t.Fatal(err)
	}
	p.AuthorityVersion = "1"
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "rejected"); err == nil {
		t.Fatal("downgrade accepted")
	}
	after, err := os.ReadFile(v.Store.Path)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("rejected candidate mutated durable state")
	}
}

func TestSnapshotAcceptanceUsesManifestAndCheckpoint(t *testing.T) {
	manifestPayload, rootPub, rootPriv, _, issuerPriv, now := trustFixture(t)
	manifestPayload.Issuer = "issuer"
	manifest, err := ParseAndVerifyTrustManifest(signedTrustFixture(t, manifestPayload, rootPriv, "root"), map[string]ed25519.PublicKey{"root": rootPub}, Binding{"org", "issuer", "installation"}, now)
	if err != nil {
		t.Fatal(err)
	}
	p, _, _ := fullFixture(t, "1")
	p.IssuedAt, p.NotBefore, p.ExpiresAt = now.Add(-time.Minute), now.Add(-time.Minute), now.Add(time.Hour)
	dir := t.TempDir()
	v := &Verifier{Manifest: manifest, Binding: Binding{"org", "issuer", "installation"}, Store: &Store{Path: filepath.Join(dir, "state.json")}, Checkpoint: &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}, Now: func() time.Time { return now }}
	if _, err = v.VerifyAndAccept(signedFixture(t, p, issuerPriv, "issuer-key"), "manifest"); err != nil {
		t.Fatal(err)
	}
	if _, err = os.Stat(v.Checkpoint.Path); err != nil {
		t.Fatal(err)
	}
	manifest.Payload.Keys[0].Status = "retired"
	if _, err = v.VerifyAndAccept(signedFixture(t, p, issuerPriv, "issuer-key"), "retired-key"); err == nil {
		t.Fatal("retired manifest key accepted")
	}
}

func TestSnapshotWire11RequiresCollectionAndRejectsWire10Injection(t *testing.T) {
	p, pub, priv := full11Fixture(t, "1")
	v := verifierFixture(t, pub)
	var content map[string]any
	if err := json.Unmarshal(p.Content, &content); err != nil {
		t.Fatal(err)
	}
	delete(content, "intelligence_supply_grants")
	p.Content, _ = json.Marshal(content)
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), ""); err == nil {
		t.Fatal("wire 1.1 without intelligence_supply_grants accepted")
	}
	p.SchemaVersion = "1.0"
	content["intelligence_supply_grants"] = []any{}
	p.Content, _ = json.Marshal(content)
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), ""); err == nil {
		t.Fatal("wire 1.0 intelligence_supply_grants injection accepted")
	}
}

func TestDecodeProjectionAcceptsOnlyFourVersionedWireShapes(t *testing.T) {
	base := legacyFullContent{Principals: []Principal{}, Memberships: []Membership{}, RoleDefinitions: []RoleDefinition{}, RoleAssignments: []RoleAssignment{}, Revocations: []Revocation{}}
	withVault10 := fullContent10WithVault{Principals: base.Principals, Memberships: base.Memberships, RoleDefinitions: base.RoleDefinitions, RoleAssignments: base.RoleAssignments, Revocations: base.Revocations, VaultServiceGrants: []VaultServiceGrant{}}
	withoutVault11 := fullContent11WithoutVault{Principals: base.Principals, Memberships: base.Memberships, RoleDefinitions: base.RoleDefinitions, RoleAssignments: base.RoleAssignments, Revocations: base.Revocations, IntelligenceSupplyGrants: []IntelligenceSupplyGrant{}}
	withVault11 := fullContent11WithVault{Principals: base.Principals, Memberships: base.Memberships, RoleDefinitions: base.RoleDefinitions, RoleAssignments: base.RoleAssignments, Revocations: base.Revocations, VaultServiceGrants: []VaultServiceGrant{}, IntelligenceSupplyGrants: []IntelligenceSupplyGrant{}}
	for _, tc := range []struct {
		name, version string
		value         any
	}{
		{"1.0 historical", "1.0", base},
		{"1.0 vault", "1.0", withVault10},
		{"1.1 no vault", "1.1", withoutVault11},
		{"1.1 vault", "1.1", withVault11},
	} {
		t.Run(tc.name, func(t *testing.T) {
			raw, _ := json.Marshal(tc.value)
			var projection FullContent
			if err := decodeProjection(raw, &projection, tc.version); err != nil {
				t.Fatal(err)
			}
			if tc.version == "1.1" && projection.IntelligenceSupplyGrants == nil {
				t.Fatal("wire 1.1 collection presence lost")
			}
		})
	}
	for _, tc := range []struct {
		name, version string
		value         any
	}{
		{"1.0 intelligence", "1.0", withoutVault11},
		{"1.1 missing intelligence", "1.1", base},
	} {
		t.Run(tc.name, func(t *testing.T) {
			raw, _ := json.Marshal(tc.value)
			var projection FullContent
			if err := decodeProjection(raw, &projection, tc.version); err == nil {
				t.Fatal("invalid versioned shape accepted")
			}
		})
	}
	raw, _ := json.Marshal(withoutVault11)
	var object map[string]any
	_ = json.Unmarshal(raw, &object)
	object["unknown"] = true
	raw, _ = json.Marshal(object)
	var projection FullContent
	if err := decodeProjection(raw, &projection, "1.1"); err == nil {
		t.Fatal("unknown wire property accepted")
	}
}

func TestSnapshotWire11TransitionDeltaAndDowngradeRules(t *testing.T) {
	p10, pub, priv := fullFixture(t, "1")
	v := verifierFixture(t, pub)
	if _, err := v.VerifyAndAccept(signedFixture(t, p10, priv, "key"), "v10"); err != nil {
		t.Fatal(err)
	}
	p11, _, _ := full11Fixture(t, "2")
	p11.IssuedAt, p11.NotBefore, p11.ExpiresAt = p10.IssuedAt, p10.NotBefore, p10.ExpiresAt
	base := "1"
	delta, _ := json.Marshal(DeltaContent{ResultDigest: "unused", Operations: []DeltaOperation{}})
	p11.Kind, p11.BaseAuthorityVersion, p11.Content = "delta", &base, delta
	if _, err := v.VerifyAndAccept(signedFixture(t, p11, priv, "key"), "cross-schema-delta"); err == nil {
		t.Fatal("wire 1.0 to 1.1 delta accepted")
	}
	p11.Kind, p11.BaseAuthorityVersion = "full", nil
	empty := []IntelligenceSupplyGrant{}
	full := FullContent{Principals: []Principal{}, Memberships: []Membership{}, RoleDefinitions: []RoleDefinition{}, RoleAssignments: []RoleAssignment{}, Revocations: []Revocation{}, IntelligenceSupplyGrants: &empty}
	p11.Content, _ = json.Marshal(full)
	if _, err := v.VerifyAndAccept(signedFixture(t, p11, priv, "key"), "full-transition"); err != nil {
		t.Fatal(err)
	}
	p10.AuthorityVersion, p10.SnapshotID = "3", "downgrade-schema"
	if _, err := v.VerifyAndAccept(signedFixture(t, p10, priv, "key"), "downgrade"); err == nil {
		t.Fatal("wire schema downgrade accepted")
	}
}

func TestSnapshotWire11DeltaGrantAndImmutability(t *testing.T) {
	p, pub, priv := full11Fixture(t, "1")
	v := verifierFixture(t, pub)
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "initial"); err != nil {
		t.Fatal(err)
	}
	var result FullContent
	if err := json.Unmarshal(p.Content, &result); err != nil {
		t.Fatal(err)
	}
	grant := intelligenceGrantFixture(p.IssuedAt)
	grant.ReplacesGrantID = nil
	values := []IntelligenceSupplyGrant{grant}
	result.IntelligenceSupplyGrants = &values
	digest, err := StateDigest(result, "org")
	if err != nil {
		t.Fatal(err)
	}
	value, _ := json.Marshal(grant)
	delta := DeltaContent{ResultDigest: digest, Operations: []DeltaOperation{{Sequence: "1", Operation: "upsert", Collection: "intelligence_supply_grants", EntityID: grant.GrantID, Value: value}}}
	p.Kind, p.AuthorityVersion, p.SnapshotID = "delta", "2", "grant-issued"
	base := "1"
	p.BaseAuthorityVersion = &base
	p.Content, _ = json.Marshal(delta)
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "issue"); err != nil {
		t.Fatal(err)
	}
	grant.Purpose = "changed"
	value, _ = json.Marshal(grant)
	delta.Operations[0].Value = value
	delta.ResultDigest = "irrelevant"
	p.AuthorityVersion, p.SnapshotID = "3", "grant-mutated"
	base = "2"
	p.Content, _ = json.Marshal(delta)
	if _, err := v.VerifyAndAccept(signedFixture(t, p, priv, "key"), "mutation"); err == nil || !strings.Contains(err.Error(), "history cannot change") {
		t.Fatalf("grant mutation accepted: %v", err)
	}
}
