package mandatedelivery

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"nucleus/internal/authority"
	"os"
	"testing"
	"time"
)

func vector(t *testing.T) (map[string]string, []byte, Context) {
	t.Helper()
	raw, err := os.ReadFile("testdata/mandate-delivery-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var v map[string]string
	if err = json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	body, err := base64.StdEncoding.DecodeString(v["valid_body_base64"])
	if err != nil {
		t.Fatal(err)
	}
	public, err := base64.StdEncoding.DecodeString(v["public_key_base64"])
	if err != nil {
		t.Fatal(err)
	}
	now, err := time.Parse(time.RFC3339Nano, v["now"])
	if err != nil {
		t.Fatal(err)
	}
	return v, body, Context{OrganizationID: "org-test", InstallationID: "installation-test", Issuer: v["issuer"], Trust: authority.TrustBundle{v["issuer"]: {v["key_id"]: ed25519.PublicKey(public)}}, Now: func() time.Time { return now }}
}
func TestTypeScriptInteroperability(t *testing.T) {
	v, body, ctx := vector(t)
	d, content, err := Verify(body, ctx)
	if err != nil {
		t.Fatal(err)
	}
	if base64.StdEncoding.EncodeToString(content) != v["artifact_base64"] || d.Envelope.Digest != v["digest"] {
		t.Fatal("artifact mismatch")
	}
	var raw map[string]json.RawMessage
	_ = json.Unmarshal(body, &raw)
	var envelope map[string]any
	_ = json.Unmarshal(raw["envelope"], &envelope)
	delete(envelope, "signature")
	delete(envelope, "signing_key_id")
	encoded, _ := json.Marshal(envelope)
	canonical, err := authority.Canonicalize(encoded)
	if err != nil || base64.StdEncoding.EncodeToString(canonical) != v["canonical_base64"] {
		t.Fatal("JCS mismatch")
	}
	wrong, _ := base64.StdEncoding.DecodeString(v["wrong_domain_body_base64"])
	if _, _, err = Verify(wrong, ctx); err == nil {
		t.Fatal("accepted cross-domain TypeScript vector")
	}
	store := &Store{Root: t.TempDir()}
	if result, err := store.Accept(body, ctx); err != nil || result != "accepted" {
		t.Fatalf("%s %v", result, err)
	}
	path := store.path(d.Envelope)
	first, _ := os.ReadFile(path)
	restarted := &Store{Root: store.Root}
	if result, err := restarted.Accept(body, ctx); err != nil || result != "replay" {
		t.Fatalf("%s %v", result, err)
	}
	second, _ := os.ReadFile(path)
	if !bytes.Equal(first, second) {
		t.Fatal("replay rewrote receipt")
	}
}
