package mandatedelivery

import (
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"nucleus/internal/authority"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// Mutation signing uses only the explicitly public TypeScript fixture key.
func mutate(t *testing.T, body []byte, change func(*Delivery), domain string) []byte {
	t.Helper()
	v, _, _ := vector(t)
	der, _ := base64.StdEncoding.DecodeString(v["test_private_pkcs8_base64"])
	key, err := x509.ParsePKCS8PrivateKey(der)
	if err != nil {
		t.Fatal(err)
	}
	var d Delivery
	_ = json.Unmarshal(body, &d)
	change(&d)
	b, _ := json.Marshal(d.Envelope)
	var p map[string]any
	_ = json.Unmarshal(b, &p)
	delete(p, "signature")
	delete(p, "signing_key_id")
	b, _ = json.Marshal(p)
	canonical, err := authority.Canonicalize(b)
	if err != nil {
		t.Fatal(err)
	}
	d.Envelope.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(key.(ed25519.PrivateKey), append(append([]byte(domain), 0), canonical...)))
	b, _ = json.Marshal(d)
	return b
}
func changedBytes(d *Delivery) {
	d.MandateBase64 = base64.StdEncoding.EncodeToString([]byte("other bytes"))
	sum := sha256.Sum256([]byte("other bytes"))
	d.Envelope.Digest = hex.EncodeToString(sum[:])
}
func TestEnvelopeRejections(t *testing.T) {
	_, body, ctx := vector(t)
	cases := map[string][]byte{
		"partial":    body[:len(body)-1],
		"duplicate":  []byte(strings.Replace(string(body), `"mandate_id":`, `"mandate_id":"duplicate","mandate_id":`, 1)),
		"unknown":    []byte(strings.Replace(string(body), `"envelope":`, `"extra":1,"envelope":`, 1)),
		"signature":  []byte(strings.Replace(string(body), `"signature":"`, `"signature":"A`, 1)),
		"field_case": []byte(strings.Replace(string(body), `"mandate_id":`, `"Mandate_id":`, 1)),
		"outer_case": []byte(strings.Replace(string(body), `"envelope":`, `"Envelope":`, 1)),
	}
	for name, change := range map[string]func(*Delivery){
		"digest":       func(d *Delivery) { d.Envelope.Digest = strings.Repeat("0", 64) },
		"key":          func(d *Delivery) { d.Envelope.KeyID = "unknown" },
		"organization": func(d *Delivery) { d.Envelope.OrganizationID = "other" },
		"installation": func(d *Delivery) { d.Envelope.InstallationID = "other" },
		"date":         func(d *Delivery) { d.Envelope.IssuedAt = "invalid" },
		"future":       func(d *Delivery) { d.Envelope.IssuedAt = "2099-01-01T00:00:00Z" },
		"offset":       func(d *Delivery) { d.Envelope.IssuedAt = "2026-09-07T12:00:00+01:00" },
		"base64":       func(d *Delivery) { d.MandateBase64 = "???" },
	} {
		cases[name] = mutate(t, body, change, Domain)
	}
	for _, domain := range []string{"BLOOM-AUTHORITY-SNAPSHOT-v1", "BLOOM-INSTALLATION-AUTH-v1", "BLOOM-S2S-WRITE-v1"} {
		cases[domain] = mutate(t, body, func(*Delivery) {}, domain)
	}
	for name, raw := range cases {
		t.Run(name, func(t *testing.T) {
			if _, _, err := Verify(raw, ctx); err == nil {
				t.Fatal("accepted invalid envelope")
			}
			root := filepath.Join(t.TempDir(), "absent")
			store := &Store{Root: root}
			before := tree(t, root)
			if _, err := store.Accept(raw, ctx); err == nil {
				t.Fatal("persisted rejected candidate")
			}
			if !reflect.DeepEqual(before, tree(t, root)) {
				t.Fatal("rejection mutated empty store")
			}
			if _, err := store.Accept(body, ctx); err != nil {
				t.Fatal(err)
			}
			before = tree(t, root)
			if _, err := store.Accept(raw, ctx); err == nil {
				t.Fatal("accepted rejected candidate with prior receipt")
			}
			if !reflect.DeepEqual(before, tree(t, root)) {
				t.Fatal("rejection mutated existing store")
			}
		})
	}
}
