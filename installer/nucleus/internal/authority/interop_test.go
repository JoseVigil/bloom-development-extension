package authority

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

type interopFixture struct {
	KeyID       string      `json:"key_id"`
	PrivateKey  string      `json:"private_key_pkcs8_base64"`
	PublicKey   string      `json:"public_key_base64url"`
	Now         time.Time   `json:"now"`
	BaseState   FullContent `json:"base_state"`
	ResultState FullContent `json:"result_state"`
	Expected    struct {
		BaseJCS     string `json:"base_state_jcs"`
		StateJCS    string `json:"state_jcs"`
		BaseDigest  string `json:"base_state_digest"`
		StateDigest string `json:"state_digest"`
	} `json:"expected"`
	Envelopes map[string]json.RawMessage `json:"envelopes"`
}

func readInterop(t *testing.T) interopFixture {
	t.Helper()
	_, file, _, _ := runtime.Caller(0)
	raw, err := os.ReadFile(filepath.Join(filepath.Dir(file), "../../../../docs/ROLES/fixtures/authority_interop_v1.json"))
	if err != nil {
		t.Fatal(err)
	}
	var f interopFixture
	if err := json.Unmarshal(raw, &f); err != nil {
		t.Fatal(err)
	}
	return f
}
func interopVerifier(t *testing.T, f interopFixture) *Verifier {
	t.Helper()
	pub, err := base64.RawURLEncoding.DecodeString(f.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	return &Verifier{Trust: TrustBundle{"fixture-issuer": {f.KeyID: ed25519.PublicKey(pub)}}, Binding: Binding{OrganizationID: "org-fixture", Issuer: "fixture-issuer", InstallationID: "installation-a"}, Store: &Store{Path: filepath.Join(t.TempDir(), "state.json")}, Now: func() time.Time { return f.Now }}
}
func interopPrivate(t *testing.T, f interopFixture) ed25519.PrivateKey {
	t.Helper()
	der, err := base64.StdEncoding.DecodeString(f.PrivateKey)
	if err != nil {
		t.Fatal(err)
	}
	key, err := x509.ParsePKCS8PrivateKey(der)
	if err != nil {
		t.Fatal(err)
	}
	return key.(ed25519.PrivateKey)
}
func resignPayload(t *testing.T, payload any, f interopFixture) []byte {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	canonical, err := Canonicalize(raw)
	if err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(canonical)
	sig := ed25519.Sign(interopPrivate(t, f), append(append([]byte(signatureDomain), 0), canonical...))
	env, err := json.Marshal(Envelope{Payload: raw, Integrity: Integrity{"JCS-RFC8785", "SHA-256", base64.RawURLEncoding.EncodeToString(sum[:]), "Ed25519", f.KeyID, base64.RawURLEncoding.EncodeToString(sig)}})
	if err != nil {
		t.Fatal(err)
	}
	return env
}

func exerciseInterop(t *testing.T, f interopFixture, envelopes map[string]json.RawMessage) *DurableState {
	t.Helper()
	v := interopVerifier(t, f)
	first, err := v.VerifyAndAccept(envelopes["full1"], "base")
	if err != nil {
		t.Fatal(err)
	}
	if first.Monotonic.StateDigest != f.Expected.BaseDigest {
		t.Fatal("base digest differs from literal fixture")
	}
	state, err := v.VerifyAndAccept(envelopes["delta2"], "delta")
	if err != nil {
		t.Fatal(err)
	}
	if state.Monotonic.StateDigest != f.Expected.StateDigest || len(state.Projection.RoleDefinitions) != 2 || state.Projection.RoleDefinitions[0].RoleVersion != "2" || state.Projection.RoleDefinitions[1].RoleVersion != "10" {
		t.Fatal("delta normalization lost historical roles")
	}
	raw, _ := json.Marshal(state.Projection)
	canonical, err := Canonicalize(raw)
	if err != nil || string(canonical) != f.Expected.StateJCS {
		t.Fatal("normalized bytes differ from literal fixture")
	}
	before, _ := os.ReadFile(v.Store.Path)
	for _, kind := range []string{"delta2", "full2"} {
		replayed, err := v.VerifyAndAccept(envelopes[kind], "replay")
		if err != nil {
			t.Fatalf("%s: %v", kind, err)
		}
		after, _ := os.ReadFile(v.Store.Path)
		if !bytes.Equal(before, after) || len(replayed.Journal) != 2 {
			t.Fatal("replay/equivalent full changed durable evidence")
		}
	}
	fresh := interopVerifier(t, f)
	full, err := fresh.VerifyAndAccept(envelopes["full2"], "fresh-full")
	if err != nil {
		t.Fatal(err)
	}
	if full.Monotonic.StateDigest != state.Monotonic.StateDigest || !sameJSON(full.Emission, state.Emission) || full.Monotonic.Digest == state.Monotonic.Digest {
		t.Fatal("full/delta equivalence or distinct payload digest violated")
	}
	if _, err := fresh.VerifyAndAccept(envelopes["delta2"], "unknown-replay"); err == nil {
		t.Fatal("unverifiable delta replay accepted")
	}
	renewal, err := v.VerifyAndAccept(envelopes["renewal3"], "renewal")
	if err != nil {
		t.Fatal(err)
	}
	if renewal.Monotonic.StateDigest != state.Monotonic.StateDigest || renewal.Monotonic.HighWaterMark != "9007199254740995" || !renewal.Emission.IssuedAt.After(state.Emission.IssuedAt) || len(renewal.Journal) != 3 {
		t.Fatal("renewal must advance version and emission, not state digest")
	}
	return renewal
}
func TestAuthorityInteropStaticFixture(t *testing.T) {
	f := readInterop(t)
	exerciseInterop(t, f, f.Envelopes)
	for name, raw := range f.Envelopes {
		v := interopVerifier(t, f)
		env, _, err := ParseAndVerifyEnvelope(raw, v.Trust)
		if err != nil {
			t.Fatal(err)
		}
		var p SnapshotPayload
		if err := decodeWire(env.Payload, &p); err != nil {
			t.Fatal(err)
		}
		var goEnvelope Envelope
		if err := json.Unmarshal(signedFixture(t, p, interopPrivate(t, f), f.KeyID), &goEnvelope); err != nil {
			t.Fatal(err)
		}
		if !sameJSON(env, goEnvelope) {
			t.Fatalf("Go signature differs for %s", name)
		}
	}
}

// Invoked by the Backend test using newly emitted temporary artifacts, not only static vectors.
func TestAuthorityInteropBackendArtifacts(t *testing.T) {
	path := os.Getenv("AUTHORITY_INTEROP_ARTIFACT")
	if path == "" {
		t.Skip("run by Backend interoperability test")
	}
	f := readInterop(t)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var envelopes map[string]json.RawMessage
	if err := json.Unmarshal(raw, &envelopes); err != nil {
		t.Fatal(err)
	}
	state := exerciseInterop(t, f, envelopes)
	var env Envelope
	if err := json.Unmarshal(envelopes["full2"], &env); err != nil {
		t.Fatal(err)
	}
	var p SnapshotPayload
	if err := decodeWire(env.Payload, &p); err != nil {
		t.Fatal(err)
	}
	receipt, err := json.Marshal(map[string]any{"state_digest": state.Monotonic.StateDigest, "high_water_mark": state.Monotonic.HighWaterMark, "journal_entries": len(state.Journal), "go_envelope": json.RawMessage(signedFixture(t, p, interopPrivate(t, f), f.KeyID))})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path+".receipt.json", receipt, 0600); err != nil {
		t.Fatal(err)
	}
}

func TestAuthorityInteropRejectsSignedInvalidCandidatesWithoutMutation(t *testing.T) {
	f := readInterop(t)
	cases := map[string]func(map[string]any){
		"missing collection": func(p map[string]any) { delete(p["content"].(map[string]any), "memberships") },
		"null collection":    func(p map[string]any) { p["content"].(map[string]any)["memberships"] = nil },
		"unknown property":   func(p map[string]any) { p["unexpected"] = true },
		"wrong case":         func(p map[string]any) { p["Issuer"] = p["issuer"]; delete(p, "issuer") },
		"numeric version":    func(p map[string]any) { p["authority_version"] = 2 },
		"overflow version":   func(p map[string]any) { p["authority_version"] = "18446744073709551616" },
		"leading zero":       func(p map[string]any) { p["authority_version"] = "02" },
		"signed version":     func(p map[string]any) { p["authority_version"] = "+2" },
		"wrong audience":     func(p map[string]any) { p["audience"].(map[string]any)["installation_ids"] = []string{"other"} },
		"duplicate audience": func(p map[string]any) {
			p["audience"].(map[string]any)["installation_ids"] = []string{"installation-a", "installation-a"}
		},
		"wrong org":             func(p map[string]any) { p["organization_id"] = "other" },
		"offset timestamp":      func(p map[string]any) { p["issued_at"] = "2026-09-08T12:01:00+00:00" },
		"too precise timestamp": func(p map[string]any) { p["issued_at"] = "2026-09-08T12:01:00.1234567891Z" },
		"expired":               func(p map[string]any) { p["expires_at"] = "2026-09-08T12:02:00Z" },
		"future":                func(p map[string]any) { p["issued_at"] = "2026-09-08T12:06:00Z" },
		"oversize ttl":          func(p map[string]any) { p["expires_at"] = "2026-09-10T12:01:00Z" },
		"full base":             func(p map[string]any) { p["base_authority_version"] = "1" },
		"duplicate role version": func(p map[string]any) {
			c := p["content"].(map[string]any)
			r := c["role_definitions"].([]any)
			c["role_definitions"] = append(r, r[0])
		},
		"unknown permission": func(p map[string]any) {
			p["content"].(map[string]any)["role_definitions"].([]any)[0].(map[string]any)["permissions"] = []string{"*"}
		},
		"missing revocation": func(p map[string]any) { p["content"].(map[string]any)["revocations"] = []any{} },
		"future revocation": func(p map[string]any) {
			p["content"].(map[string]any)["revocations"].([]any)[0].(map[string]any)["recorded_in_authority_version"] = "18446744073709551615"
		},
		"missing reference": func(p map[string]any) {
			p["content"].(map[string]any)["role_assignments"].([]any)[0].(map[string]any)["membership_id"] = "absent"
		},
		"missing scope": func(p map[string]any) {
			delete(p["content"].(map[string]any)["role_assignments"].([]any)[0].(map[string]any), "scope")
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			v := interopVerifier(t, f)
			if _, err := v.VerifyAndAccept(f.Envelopes["full1"], ""); err != nil {
				t.Fatal(err)
			}
			before, _ := os.ReadFile(v.Store.Path)
			var env map[string]any
			if err := json.Unmarshal(f.Envelopes["full2"], &env); err != nil {
				t.Fatal(err)
			}
			p := env["payload"].(map[string]any)
			mutate(p)
			if _, err := v.VerifyAndAccept(resignPayload(t, p, f), ""); err == nil {
				t.Fatal("signed invalid candidate accepted")
			}
			after, _ := os.ReadFile(v.Store.Path)
			if !bytes.Equal(before, after) {
				t.Fatal("rejection changed durable state")
			}
		})
	}
}

func TestAuthorityInteropSameVersionConflictsAndLegacyState(t *testing.T) {
	f := readInterop(t)
	for _, field := range []string{"snapshot_id", "issued_at", "not_before", "expires_at", "audience", "content"} {
		t.Run(field, func(t *testing.T) {
			v := interopVerifier(t, f)
			if _, err := v.VerifyAndAccept(f.Envelopes["full2"], ""); err != nil {
				t.Fatal(err)
			}
			before, _ := os.ReadFile(v.Store.Path)
			var env map[string]any
			_ = json.Unmarshal(f.Envelopes["full2"], &env)
			p := env["payload"].(map[string]any)
			switch field {
			case "snapshot_id":
				p[field] = "another-emission"
			case "issued_at", "not_before":
				p[field] = "2026-09-08T12:02:00Z"
			case "expires_at":
				p[field] = "2026-09-09T11:59:00Z"
			case "audience":
				p[field].(map[string]any)["installation_ids"] = []string{"installation-a"}
			case "content":
				p[field].(map[string]any)["principals"].([]any)[0].(map[string]any)["status"] = "suspended"
			}
			if _, err := v.VerifyAndAccept(resignPayload(t, p, f), ""); err == nil {
				t.Fatal("same-version conflict accepted")
			}
			after, _ := os.ReadFile(v.Store.Path)
			if !bytes.Equal(before, after) {
				t.Fatal("conflict mutated evidence")
			}
		})
	}
	v := interopVerifier(t, f)
	st, err := v.VerifyAndAccept(f.Envelopes["full1"], "")
	if err != nil {
		t.Fatal(err)
	}
	st.Emission = nil
	st.Monotonic.StateDigest = ""
	legacy, _ := json.Marshal(st)
	if err := os.WriteFile(v.Store.Path, legacy, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := v.VerifyAndAccept(f.Envelopes["full2"], ""); !errors.Is(err, ErrLegacyState) {
		t.Fatalf("legacy evidence not recognized: %v", err)
	}
	after, _ := os.ReadFile(v.Store.Path)
	if !bytes.Equal(legacy, after) {
		t.Fatal("legacy state reset")
	}
}

func TestAuthorityInteropStrictJSONAndIntegrity(t *testing.T) {
	f := readInterop(t)
	v := interopVerifier(t, f)
	for _, raw := range []string{`{"x":1,"x":2}`, `{"x":"\ud800"}`, `{"x":-0}`, `{"x":1e400}`} {
		if _, err := Canonicalize([]byte(raw)); err == nil {
			t.Fatalf("invalid JSON accepted: %s", raw)
		}
	}
	for _, field := range []string{"digest", "signature", "key_id", "canonicalization"} {
		t.Run(field, func(t *testing.T) {
			var env map[string]any
			_ = json.Unmarshal(f.Envelopes["full2"], &env)
			i := env["integrity"].(map[string]any)
			i[field] = i[field].(string) + "="
			raw, _ := json.Marshal(env)
			if _, _, err := ParseAndVerifyEnvelope(raw, v.Trust); err == nil {
				t.Fatal("invalid integrity accepted")
			}
		})
	}
	if _, _, err := ParseAndVerifyEnvelope([]byte(strings.Repeat(" ", (16<<20)+1)), v.Trust); err == nil {
		t.Fatal("oversize accepted")
	}
}

func TestAuthorityInteropDeltaFailuresRequireFull(t *testing.T) {
	f := readInterop(t)
	for _, kind := range []string{"base gap", "sequence gap", "wrong digest", "wrong entity", "unknown collection", "remove value", "null upsert"} {
		t.Run(kind, func(t *testing.T) {
			v := interopVerifier(t, f)
			if _, err := v.VerifyAndAccept(f.Envelopes["full1"], ""); err != nil {
				t.Fatal(err)
			}
			before, _ := os.ReadFile(v.Store.Path)
			var env map[string]any
			_ = json.Unmarshal(f.Envelopes["delta2"], &env)
			p := env["payload"].(map[string]any)
			content := p["content"].(map[string]any)
			ops := content["operations"].([]any)
			switch kind {
			case "base gap":
				p["base_authority_version"] = "9007199254740992"
			case "sequence gap":
				ops[0].(map[string]any)["sequence"] = "2"
			case "wrong digest":
				content["result_digest"] = f.Expected.BaseDigest
			case "wrong entity":
				ops[0].(map[string]any)["entity_id"] = "other"
			case "unknown collection":
				ops[0].(map[string]any)["collection"] = "unknown"
			case "remove value":
				ops[2].(map[string]any)["value"] = map[string]any{}
			case "null upsert":
				ops[0].(map[string]any)["value"] = nil
			}
			if _, err := v.VerifyAndAccept(resignPayload(t, p, f), ""); err == nil {
				t.Fatal("invalid delta accepted")
			}
			after, _ := os.ReadFile(v.Store.Path)
			if !bytes.Equal(before, after) {
				t.Fatal("invalid delta changed durable state")
			}
			if _, err := v.VerifyAndAccept(f.Envelopes["full2"], "reconstruct"); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestAuthorityInteropCannotRedefineAssignedRoleVersion(t *testing.T) {
	f := readInterop(t)
	v := interopVerifier(t, f)
	if _, err := v.VerifyAndAccept(f.Envelopes["full1"], ""); err != nil {
		t.Fatal(err)
	}
	var env map[string]any
	_ = json.Unmarshal(f.Envelopes["full2"], &env)
	p := env["payload"].(map[string]any)
	p["content"].(map[string]any)["role_definitions"].([]any)[0].(map[string]any)["permissions"] = []string{"intent.create"}
	if _, err := v.VerifyAndAccept(resignPayload(t, p, f), ""); err == nil || !strings.Contains(err.Error(), "new role version") {
		t.Fatalf("role version redefined: %v", err)
	}
}

func TestAuthorityInteropRejectsValidlyEncodedBadSignatureAndWrongDomain(t *testing.T) {
	f := readInterop(t)
	v := interopVerifier(t, f)
	for _, kind := range []string{"bad signature", "wrong domain", "tampered payload"} {
		t.Run(kind, func(t *testing.T) {
			var env Envelope
			_ = json.Unmarshal(f.Envelopes["full2"], &env)
			switch kind {
			case "bad signature":
				sig, _ := base64.RawURLEncoding.DecodeString(env.Integrity.Signature)
				sig[0] ^= 1
				env.Integrity.Signature = base64.RawURLEncoding.EncodeToString(sig)
			case "wrong domain":
				canonical, err := Canonicalize(env.Payload)
				if err != nil {
					t.Fatal(err)
				}
				env.Integrity.Signature = base64.RawURLEncoding.EncodeToString(ed25519.Sign(interopPrivate(t, f), append([]byte("OTHER-DOMAIN\x00"), canonical...)))
			case "tampered payload":
				env.Payload = bytes.Replace(env.Payload, []byte("emission-2"), []byte("emission-X"), 1)
			}
			raw, _ := json.Marshal(env)
			if _, _, err := ParseAndVerifyEnvelope(raw, v.Trust); err == nil {
				t.Fatal("invalid envelope accepted")
			}
		})
	}
}
