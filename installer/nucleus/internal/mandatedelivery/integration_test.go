package mandatedelivery

import (
	"bytes"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"nucleus/internal/authority"
	"nucleus/internal/mandateinstall"
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
	if result, err := store.Accept(body, ctx); err != nil || result.Status != "accepted" {
		t.Fatalf("%+v %v", result, err)
	}
	path := store.path(d.Envelope)
	first, _ := os.ReadFile(path)
	restarted := &Store{Root: store.Root}
	if result, err := restarted.Accept(body, ctx); err != nil || result.Status != "replay" {
		t.Fatalf("%+v %v", result, err)
	}
	second, _ := os.ReadFile(path)
	if !bytes.Equal(first, second) {
		t.Fatal("replay rewrote receipt")
	}
}

// TestMandatePublishBootstrapRoundtrip lee el vector de interoperabilidad opcional de
// §3.4 del Encargo_Implementacion_AutoEncadenamiento_Sync_Install_y_Validacion_Backend_v1_0.md
// — generado del lado Backend a partir del round-trip real publishMandate →
// resolveMandateDelivery, no de una fila de DB sintética como el resto de este archivo.
// Si el archivo todavía no aterrizó (el cowork de Backend corre en paralelo, no es
// prerrequisito de este ciclo), el test se saltea explícitamente en vez de fallar el
// build — mismo criterio que el resto de §3.4/§4 del encargo.
func TestMandatePublishBootstrapRoundtrip(t *testing.T) {
	raw, err := os.ReadFile("testdata/mandate-publish-then-bootstrap-v1.json")
	if err != nil {
		if os.IsNotExist(err) {
			t.Skip("vector de round-trip publish→bootstrap (§3.4) todavía no generado por Backend — ver testdata/README.md")
		}
		t.Fatal(err)
	}
	var v map[string]string
	if err := json.Unmarshal(raw, &v); err != nil {
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
	ctx := Context{OrganizationID: "org-test", InstallationID: "installation-test", Issuer: v["issuer"], Trust: authority.TrustBundle{v["issuer"]: {v["key_id"]: ed25519.PublicKey(public)}}, Now: func() time.Time { return now }}

	d, content, err := Verify(body, ctx)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if base64.StdEncoding.EncodeToString(content) != v["artifact_base64"] || d.Envelope.Digest != v["digest"] {
		t.Fatal("artifact mismatch")
	}

	receipt := Receipt{
		OrganizationID: ctx.OrganizationID,
		InstallationID: ctx.InstallationID,
		MandateID:      d.Envelope.MandateID,
		Version:        d.Envelope.Version,
		Digest:         d.Envelope.Digest,
		KeyID:          d.Envelope.KeyID,
		Domain:         Domain,
		AcceptedAt:     now,
		Body:           body,
	}
	if _, _, err := mandateinstall.ExtractContent(receipt); err != nil {
		t.Fatalf("mandateinstall.ExtractContent: %v", err)
	}
}
