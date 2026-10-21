package mandatedefinition

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// PUBLIC TEST KEY ONLY: deterministic seed, never a publisher credential.
var testSeed = bytes.Repeat([]byte{0x02}, ed25519.SeedSize)

const testKeyID = "mandate-definition-test-key"

func repoFile(t *testing.T, rel string) []byte {
	t.Helper()
	_, here, _, _ := runtime.Caller(0)
	raw, err := os.ReadFile(filepath.Join(filepath.Dir(here), "..", "..", "..", "..", rel))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func testPayload(t *testing.T) Payload {
	t.Helper()
	p, err := BuildInitialOfferPayload(InitialOfferInput{
		DefinitionID: "0b8e4b9e-6d0f-4c55-9d8e-2f4b7a1c3e21", Version: "1.0.0", Label: "Genesis",
		Purpose: "Estructuración semántica inicial de un proyecto", PublisherID: "bloom", KeyID: testKeyID,
		PublishedAt: "2026-10-19T12:00:00Z",
		PolicyRaw:   repoFile(t, "installer/aitap/policies/initial-mandate-v1.json"),
		RegistryRaw: repoFile(t, "installer/aitap/registry/initial-mandate-v1.json"),
	})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func testKeys() (ed25519.PrivateKey, map[string]ed25519.PublicKey) {
	priv := ed25519.NewKeyFromSeed(testSeed)
	return priv, map[string]ed25519.PublicKey{testKeyID: priv.Public().(ed25519.PublicKey)}
}

func TestVerifyAcceptsSignedInitialOfferAndKeepsExactBytes(t *testing.T) {
	priv, keys := testKeys()
	raw, err := Sign(testPayload(t), priv)
	if err != nil {
		t.Fatal(err)
	}
	d, err := Verify(raw, keys)
	if err != nil {
		t.Fatal(err)
	}
	if d.Digest != FileDigest(raw) || !bytes.Equal(d.Raw, raw) || d.Payload.Label != "Genesis" || d.Payload.Preparation.Status != PreparationNotDefined {
		t.Fatalf("unexpected definition: %+v", d.Payload)
	}
	if strings.Contains(string(raw), "domain_rule") || strings.Contains(string(raw), "input_requirements") ||
		strings.Contains(string(raw), "organization") || strings.Contains(string(raw), "project_id") {
		t.Fatal("definition carries a deferred or local field")
	}
}

func TestVerifyRejectsUntrustedKeyTamperingAndShapeChanges(t *testing.T) {
	priv, keys := testKeys()
	raw, err := Sign(testPayload(t), priv)
	if err != nil {
		t.Fatal(err)
	}
	// Firmada por una clave que el manifest no designa como mandate-definition.
	if _, err := Verify(raw, map[string]ed25519.PublicKey{"authority-key": keys[testKeyID]}); err == nil {
		t.Fatal("definition accepted with a key outside the mandate-definition set")
	}
	tampered := bytes.Replace(raw, []byte(`"label":"Genesis"`), []byte(`"label":"Genesix"`), 1)
	if _, err := Verify(tampered, keys); err == nil {
		t.Fatal("tampered payload accepted")
	}
	var generic map[string]any
	_ = json.Unmarshal(raw, &generic)
	generic["extra"] = true
	extra, _ := json.Marshal(generic)
	if _, err := Verify(extra, keys); err == nil {
		t.Fatal("unknown envelope property accepted")
	}
	// Una versión que diga «defined» no es firmable ni verificable en schema 1.0.
	p := testPayload(t)
	p.Preparation.Status = "defined"
	if _, err := Sign(p, priv); err == nil {
		t.Fatal("schema 1.0 payload with a defined preparation was signed")
	}
	// Contenido embebido distinto de su digest.
	p = testPayload(t)
	p.Policy.ContentBase64 = base64.StdEncoding.EncodeToString([]byte(`{"policy_version":"initial-mandate/v1"}`))
	if err := p.Validate(); err == nil {
		t.Fatal("policy content accepted with a mismatching digest")
	}
}

func TestPreparationIsRefusedForEveryInstallableDefinition(t *testing.T) {
	priv, keys := testKeys()
	raw, err := Sign(testPayload(t), priv)
	if err != nil {
		t.Fatal(err)
	}
	d, err := Verify(raw, keys)
	if err != nil {
		t.Fatal(err)
	}
	if err := RequirePreparable(d); !errors.Is(err, ErrNotPrepared) {
		t.Fatalf("not_defined definition was preparable: %v", err)
	}
	forged := d
	forged.Payload.Preparation.Status = "defined"
	if err := RequirePreparable(forged); !errors.Is(err, ErrNotPrepared) {
		t.Fatalf("a locally forged defined status opened preparation: %v", err)
	}
}

// El vector lo consume backend/test/mandate-offers.spec.ts: el Backend verifica
// la firma del publicador con exactamente los mismos bytes.
func TestMandateDefinitionInteropVector(t *testing.T) {
	priv, keys := testKeys()
	raw, err := Sign(testPayload(t), priv)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Verify(raw, keys); err != nil {
		t.Fatal(err)
	}
	tampered := bytes.Replace(raw, []byte(`"label":"Genesis"`), []byte(`"label":"Genesix"`), 1)
	vector := map[string]any{
		"format": "mandate-definition-v1", "warning": "PUBLIC TEST KEY - NEVER USE IN PRODUCTION",
		"generator": "installer/nucleus/internal/mandatedefinition/definition_test.go",
		"key_id":    testKeyID, "public_key_base64url": base64.RawURLEncoding.EncodeToString(keys[testKeyID]),
		"seed_base64":       base64.StdEncoding.EncodeToString(testSeed),
		"definition_base64": base64.StdEncoding.EncodeToString(raw), "digest": FileDigest(raw),
		"tampered_base64": base64.StdEncoding.EncodeToString(tampered),
	}
	encoded, _ := json.MarshalIndent(vector, "", "  ")
	encoded = append(encoded, '\n')
	path := filepath.Join("testdata", "mandate-definition-v1.json")
	if os.Getenv("MANDATE_DEFINITION_UPDATE_VECTOR") == "1" {
		if err := os.MkdirAll("testdata", 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, encoded, 0644); err != nil {
			t.Fatal(err)
		}
	}
	existing, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(existing, encoded) {
		t.Fatal("mandate-definition-v1 vector is stale; regenerate with MANDATE_DEFINITION_UPDATE_VECTOR=1")
	}
}
