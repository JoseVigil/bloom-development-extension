package authority

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"testing"
)

func TestTrustManifestKeyPurposeSeparatesAuthorityAndMandateDefinitionKeys(t *testing.T) {
	p, rootPub, rootPriv, _, _, now := trustFixture(t)
	publisherPub, _, _ := ed25519.GenerateKey(rand.Reader)
	p.SchemaVersion = "1.1"
	p.Keys[0].Purpose = TrustKeyPurposeAuthority
	p.Keys = append(p.Keys, TrustKey{KeyID: "mandate-definition-key", PublicKey: base64.RawURLEncoding.EncodeToString(publisherPub),
		Status: "active", ValidFrom: p.Keys[0].ValidFrom, Purpose: TrustKeyPurposeMandateDefinition})
	roots := map[string]ed25519.PublicKey{"root": rootPub}
	binding := Binding{"org", "issuer", "installation"}
	m, err := ParseAndVerifyTrustManifest(signedTrustFixture(t, p, rootPriv, "root"), roots, binding, now)
	if err != nil {
		t.Fatal(err)
	}
	trust, err := m.SnapshotTrust(now)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := trust["issuer"]["mandate-definition-key"]; ok || len(trust["issuer"]) != 1 {
		t.Fatalf("authority trust bundle includes a mandate-definition key: %v", trust)
	}
	publishers := m.MandateDefinitionKeys(now)
	if len(publishers) != 1 || publishers["mandate-definition-key"] == nil {
		t.Fatalf("mandate-definition keys = %v", publishers)
	}
	if _, ok := publishers["issuer-key"]; ok {
		t.Fatal("authority key accepted as mandate-definition key")
	}

	missing := p
	missing.Keys = append([]TrustKey(nil), p.Keys...)
	missing.Keys[1].Purpose = ""
	if _, err := ParseAndVerifyTrustManifest(signedTrustFixture(t, missing, rootPriv, "root"), roots, binding, now); err == nil {
		t.Fatal("schema 1.1 key without purpose accepted")
	}
	unknown := p
	unknown.Keys = append([]TrustKey(nil), p.Keys...)
	unknown.Keys[1].Purpose = "anything"
	if _, err := ParseAndVerifyTrustManifest(signedTrustFixture(t, unknown, rootPriv, "root"), roots, binding, now); err == nil {
		t.Fatal("unknown key purpose accepted")
	}
	legacy := p
	legacy.SchemaVersion = "1.0"
	if _, err := ParseAndVerifyTrustManifest(signedTrustFixture(t, legacy, rootPriv, "root"), roots, binding, now); err == nil {
		t.Fatal("schema 1.0 manifest carrying purpose accepted")
	}
}

func TestTrustManifestSchema10HasNoMandateDefinitionKeys(t *testing.T) {
	p, rootPub, rootPriv, _, _, now := trustFixture(t)
	m, err := ParseAndVerifyTrustManifest(signedTrustFixture(t, p, rootPriv, "root"), map[string]ed25519.PublicKey{"root": rootPub}, Binding{"org", "issuer", "installation"}, now)
	if err != nil {
		t.Fatal(err)
	}
	if keys := m.MandateDefinitionKeys(now); len(keys) != 0 {
		t.Fatalf("schema 1.0 exposed mandate-definition keys: %v", keys)
	}
}
