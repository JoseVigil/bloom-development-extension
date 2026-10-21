package mandateoffer

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"nucleus/internal/authority"
	"nucleus/internal/mandatedefinition"
	"nucleus/internal/mandatedelivery"
)

const (
	testOrg          = "9f1de71c-b252-4f90-bbdd-984e1cd5c9c2"
	testInstallation = "installation-test"
	testProject      = "65572042-229e-4ea6-ad13-37b11fce5fdd"
	testMandateID    = "7d0c2f5e-3a51-4f0e-9c7b-2b1f6f4d9a10"
	testIssuer       = "issuer-test"
)

func repoFile(t *testing.T, rel string) []byte {
	t.Helper()
	_, here, _, _ := runtime.Caller(0)
	raw, err := os.ReadFile(filepath.Join(filepath.Dir(here), "..", "..", "..", "..", rel))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

type harness struct {
	t                 *testing.T
	appData, mandates string
	definition        []byte
	sel               mandatedelivery.OfferSelection
	publisherKeys     map[string]ed25519.PublicKey
	authorityKey      ed25519.PrivateKey
	server            *httptest.Server
	requests          atomic.Int32
	serve             func(w http.ResponseWriter, r *http.Request) // override
	eligibility       Eligibility
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	h := &harness{t: t, appData: t.TempDir(), mandates: filepath.Join(t.TempDir(), ".mandates"),
		eligibility: Eligibility{BindingStatus: "bound", BindingRevision: "3", BindingCheckedAt: "2026-10-19T19:00:00Z", LocationStatus: "present", ContinuityStatus: "matched"}}
	_, publisher, _ := ed25519.GenerateKey(rand.Reader)
	payload, err := mandatedefinition.BuildInitialOfferPayload(mandatedefinition.InitialOfferInput{
		DefinitionID: "0b8e4b9e-6d0f-4c55-9d8e-2f4b7a1c3e21", Version: "1.0.0", Label: "Genesis", Purpose: "Oferta inicial",
		PublisherID: "bloom", KeyID: "publisher-key", PublishedAt: "2026-10-19T12:00:00Z",
		PolicyRaw:   repoFile(t, "installer/aitap/policies/initial-mandate-v1.json"),
		RegistryRaw: repoFile(t, "installer/aitap/registry/initial-mandate-v1.json")})
	if err != nil {
		t.Fatal(err)
	}
	if h.definition, err = mandatedefinition.Sign(payload, publisher); err != nil {
		t.Fatal(err)
	}
	h.publisherKeys = map[string]ed25519.PublicKey{"publisher-key": publisher.Public().(ed25519.PublicKey)}
	h.sel = mandatedelivery.OfferSelection{DefinitionID: payload.DefinitionID, Version: payload.Version, Digest: mandatedefinition.FileDigest(h.definition)}
	_, h.authorityKey, _ = ed25519.GenerateKey(rand.Reader)
	h.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h.requests.Add(1)
		if h.serve != nil {
			h.serve(w, r)
			return
		}
		h.deliver(w, r, h.definition, r.URL.Query().Get("digest"))
	}))
	t.Cleanup(h.server.Close)
	return h
}

// deliver emulates the Backend: Authority signs the envelope for (org, installation).
func (h *harness) deliver(w http.ResponseWriter, r *http.Request, content []byte, digest string) {
	want := "/v1/mandate/offers/" + h.sel.DefinitionID + "/versions/" + h.sel.Version
	if r.URL.Path != want || r.URL.Query().Get("org") != testOrg || r.URL.Query().Get("installation_id") != testInstallation {
		w.WriteHeader(404)
		return
	}
	if digest != mandatedefinition.FileDigest(content) {
		w.WriteHeader(409)
		_, _ = w.Write([]byte(`{"error":"offer_digest_mismatch"}`))
		return
	}
	payload := map[string]string{"mandate_id": h.sel.DefinitionID, "organization_id": testOrg, "installation_id": testInstallation,
		"mandate_version": h.sel.Version, "mandate_digest": digest, "issued_at": time.Now().UTC().Format(time.RFC3339Nano)}
	encoded, _ := json.Marshal(payload)
	canonical, _ := authority.Canonicalize(encoded)
	sig := ed25519.Sign(h.authorityKey, append(append([]byte(mandatedelivery.Domain), 0), canonical...))
	env := map[string]string{}
	for k, v := range payload {
		env[k] = v
	}
	env["signature"] = base64.StdEncoding.EncodeToString(sig)
	env["signing_key_id"] = "authority-key"
	body, _ := json.Marshal(map[string]any{"envelope": env, "mandate_base64": base64.StdEncoding.EncodeToString(content)})
	_, _ = w.Write(body)
}

func (h *harness) installer() *Installer {
	_, installationKey, _ := ed25519.GenerateKey(rand.Reader)
	client := &mandatedelivery.Client{BaseURL: h.server.URL, Signer: installationKey,
		Store: &mandatedelivery.Store{Root: filepath.Join(h.appData, "authority", "mandate-delivery")},
		Context: mandatedelivery.Context{OrganizationID: testOrg, InstallationID: testInstallation, Issuer: testIssuer,
			Trust: authority.TrustBundle{testIssuer: {"authority-key": h.authorityKey.Public().(ed25519.PublicKey)}}}}
	return &Installer{OrganizationID: testOrg, InstallationID: testInstallation, AppDataDir: h.appData, MandatesRoot: h.mandates,
		Receiver:      client,
		PublisherKeys: func() (map[string]ed25519.PublicKey, error) { return h.publisherKeys, nil },
		Eligibility:   func(string) (Eligibility, error) { return h.eligibility, nil },
		NewID:         func() (string, error) { return testMandateID, nil },
		Now:           func() time.Time { return time.Date(2026, 10, 19, 19, 0, 0, 0, time.UTC) }}
}

func files(t *testing.T, roots ...string) []string {
	t.Helper()
	var out []string
	for _, root := range roots {
		_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err == nil && !info.IsDir() {
				out = append(out, path)
			}
			return nil
		})
	}
	return out
}

func TestExplicitInstallProducesOneVerifiedInactiveInstance(t *testing.T) {
	h := newHarness(t)
	in := h.installer()
	result, err := in.Install(context.Background(), h.sel, testProject)
	if err != nil {
		t.Fatal(err)
	}
	if h.requests.Load() != 1 || result.Status != "installed" || result.ReceiptStatus != "accepted" {
		t.Fatalf("requests=%d result=%+v", h.requests.Load(), result)
	}
	def, err := os.ReadFile(result.DefinitionPath)
	if err != nil || !bytes.Equal(def, h.definition) {
		t.Fatal("definition is not the exact delivered bytes")
	}
	all := files(t, h.appData, h.mandates)
	if len(all) != 3 {
		t.Fatalf("expected receipt + definition + instance, got %v", all)
	}
	for _, f := range all {
		if filepath.Base(f) == "mandate.json" || strings.Contains(f, "inputs") || strings.Contains(f, "docs") {
			t.Fatalf("install wrote an operational artifact: %s", f)
		}
	}
	raw, _ := os.ReadFile(result.StatePath)
	var generic map[string]any
	_ = json.Unmarshal(raw, &generic)
	for _, forbidden := range []string{"mandateType", "adoption", "signature", "phases", "source", "currentPhase"} {
		if _, ok := generic[forbidden]; ok {
			t.Fatalf("instance carries %q", forbidden)
		}
	}
	inst := result.Instance
	if inst.Status != StatusInstalled || inst.ProjectID != testProject || inst.Definition.Digest != h.sel.Digest ||
		inst.Definition.Preparation != mandatedefinition.PreparationNotDefined || inst.Authorization.Kind != AuthorizationMasterLocal {
		t.Fatalf("unexpected instance %+v", inst)
	}

	// Repetir la acción no descarga ni crea otra instancia.
	again, err := in.Install(context.Background(), h.sel, testProject)
	if err != nil || again.Status != "already_installed" || again.MandateID != result.MandateID || h.requests.Load() != 1 {
		t.Fatalf("repeat: requests=%d result=%+v err=%v", h.requests.Load(), again, err)
	}
	if n := len(files(t, h.appData, h.mandates)); n != 3 {
		t.Fatalf("repeat changed file count to %d", n)
	}

	list, err := Installations(h.appData, h.mandates)
	if err != nil || len(list) != 1 || !list[0].Consistent {
		t.Fatalf("installations=%+v err=%v", list, err)
	}
	if err := RefusePreparation(h.appData, h.mandates, result.MandateID); !errors.Is(err, mandatedefinition.ErrNotPrepared) {
		t.Fatalf("preparation was not refused: %v", err)
	}
}

func TestIneligibleProjectIsRefusedBeforeAnyRequestOrWrite(t *testing.T) {
	for _, e := range []Eligibility{
		{BindingStatus: "not_evaluable", LocationStatus: "present", ContinuityStatus: "matched", Reason: "binding_not_read"},
		{BindingStatus: "bound", LocationStatus: "missing", ContinuityStatus: "matched"},
		{BindingStatus: "bound", LocationStatus: "present", ContinuityStatus: "conflict"},
	} {
		h := newHarness(t)
		h.eligibility = e
		_, err := h.installer().Install(context.Background(), h.sel, testProject)
		var typed *ProjectNotEligibleError
		if !errors.As(err, &typed) || h.requests.Load() != 0 || len(files(t, h.appData, h.mandates)) != 0 {
			t.Fatalf("eligibility %+v: err=%v requests=%d files=%v", e, err, h.requests.Load(), files(t, h.appData, h.mandates))
		}
	}
}

func TestRejectedDeliveriesWriteNothing(t *testing.T) {
	cases := map[string]func(h *harness){
		"backend rejects digest": func(h *harness) { h.sel.Digest = strings.Repeat("0", 64) },
		"untrusted publisher key": func(h *harness) {
			_, other, _ := ed25519.GenerateKey(rand.Reader)
			h.publisherKeys = map[string]ed25519.PublicKey{"publisher-key": other.Public().(ed25519.PublicKey)}
		},
		"publisher key only under an authority id": func(h *harness) {
			h.publisherKeys = map[string]ed25519.PublicKey{"authority-key": h.publisherKeys["publisher-key"]}
		},
		"backend serves other bytes for the requested digest": func(h *harness) {
			other := bytes.Replace(h.definition, []byte(`"purpose":"Oferta inicial"`), []byte(`"purpose":"Oferta alterada"`), 1)
			h.serve = func(w http.ResponseWriter, r *http.Request) {
				h.deliver(w, r, other, mandatedefinition.FileDigest(other))
			}
		},
		"envelope for another version": func(h *harness) {
			h.serve = func(w http.ResponseWriter, r *http.Request) {
				original := h.sel
				h.sel.Version = "1.0.1"
				defer func() { h.sel = original }()
				r.URL.Path = "/v1/mandate/offers/" + h.sel.DefinitionID + "/versions/1.0.1"
				h.deliver(w, r, h.definition, r.URL.Query().Get("digest"))
			}
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t)
			mutate(h)
			if _, err := h.installer().Install(context.Background(), h.sel, testProject); err == nil {
				t.Fatal("rejected delivery was installed")
			}
			if left := files(t, h.appData, h.mandates); len(left) != 0 {
				t.Fatalf("rejection left files: %v", left)
			}
		})
	}
}

func TestInstanceFormatIsTheWatcherInertiaFixture(t *testing.T) {
	// El test de inercia del watcher fija este mismo formato; si cambia, ambos deben cambiar.
	h := newHarness(t)
	result, err := h.installer().Install(context.Background(), h.sel, testProject)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(result.StatePath)
	var keys map[string]json.RawMessage
	_ = json.Unmarshal(raw, &keys)
	want := []string{"authorization", "definition", "installedAt", "mandateId", "organizationId", "projectBinding", "projectId", "receiptRef", "schema", "schemaVersion", "status"}
	if len(keys) != len(want) {
		t.Fatalf("instance keys changed: %v", keys)
	}
	for _, k := range want {
		if _, ok := keys[k]; !ok {
			t.Fatalf("missing %s", k)
		}
	}
}
