package commands

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"nucleus/internal/authority"
)

// ── readSignedMandateFile ────────────────────────────────────────────────

func TestReadSignedMandateFileNotFound(t *testing.T) {
	root := t.TempDir()
	_, err := readSignedMandateFile(root, "does-not-exist")
	if err == nil {
		t.Fatal("expected error for missing mandate.json")
	}
}

func TestReadSignedMandateFileNotSigned(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "m1")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "mandate.json"), []byte(`{"status":"building"}`), 0644); err != nil {
		t.Fatal(err)
	}
	_, err := readSignedMandateFile(root, "m1")
	if err == nil {
		t.Fatal("expected error for unsigned mandate")
	}
}

func TestReadSignedMandateFileSignedReturnsRawBytes(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "m1")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	raw := []byte(`{"mandateId":"m1","status":"signed","mandateType":"genesis"}`)
	if err := os.WriteFile(filepath.Join(dir, "mandate.json"), raw, 0644); err != nil {
		t.Fatal(err)
	}
	got, err := readSignedMandateFile(root, "m1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if string(got) != string(raw) {
		t.Fatalf("bytes mismatch: got %s want %s", got, raw)
	}
}

func TestReadSignedMandateFileInvalidJSON(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "m1")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "mandate.json"), []byte("not json"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := readSignedMandateFile(root, "m1"); err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

// ── sha256HexOf ──────────────────────────────────────────────────────────

func TestSHA256HexOfKnownVector(t *testing.T) {
	// sha256("") — vector conocido.
	got := sha256HexOf([]byte(""))
	want := "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
	if got != want {
		t.Fatalf("sha256HexOf empty = %s, want %s", got, want)
	}
}

// ── postMandatePublish ───────────────────────────────────────────────────

func testIdentity(t *testing.T) (*authority.LocalIdentity, ed25519.PublicKey) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return &authority.LocalIdentity{InstallationID: "installation-test", PublicKey: pub, PrivateKey: priv}, pub
}

// TestPostMandatePublishSignsWithInstallationAuthDomain reconstruye la firma del lado
// servidor con el mismo mecanismo que ya validan los tests cruzados existentes de
// BLOOM-INSTALLATION-AUTH-v1 (ver mandatedelivery/client_test.go) — mismo dominio, mismo
// canonical {installation_id, organization_id, method, path, timestamp}.
func TestPostMandatePublishSignsWithInstallationAuthDomain(t *testing.T) {
	identity, pub := testIdentity(t)
	now := time.Date(2026, 9, 14, 12, 0, 0, 0, time.UTC)
	var received publishMandateRequestBody

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/mandate/publish" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("org") != "org-test" {
			t.Errorf("unexpected org query: %s", r.URL.Query().Get("org"))
		}
		if r.Header.Get("X-Bloom-Installation-Id") != identity.InstallationID {
			t.Errorf("unexpected installation id header")
		}

		payload, _ := json.Marshal(map[string]string{
			"installation_id": identity.InstallationID,
			"organization_id": "org-test",
			"method":          http.MethodPost,
			"path":            "/v1/mandate/publish",
			"timestamp":       r.Header.Get("X-Bloom-Timestamp"),
		})
		canonical, _ := authority.Canonicalize(payload)
		sig, _ := base64.StdEncoding.DecodeString(r.Header.Get("X-Bloom-Signature"))
		if !ed25519.Verify(pub, append(append([]byte("BLOOM-INSTALLATION-AUTH-v1"), 0), canonical...), sig) {
			t.Error("invalid S2S signature")
		}

		if err := json.NewDecoder(r.Body).Decode(&received); err != nil {
			t.Fatalf("invalid request body: %v", err)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(publishMandateResponseBody{MandateID: "mandate-1", MandateVersionID: "version-1", BootstrapAssigned: true})
	}))
	defer server.Close()

	body := publishMandateRequestBody{
		Slug: "genesis-bootstrap", Version: "1.0.0", Description: "", Visibility: "private",
		MandateBase64: base64.StdEncoding.EncodeToString([]byte(`{"status":"signed"}`)),
		SHA256:        sha256HexOf([]byte(`{"status":"signed"}`)),
		Bootstrap:     true,
	}
	result, err := postMandatePublish(context.Background(), server.URL, "org-test", identity, body, now)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.MandateID != "mandate-1" || result.MandateVersionID != "version-1" || !result.BootstrapAssigned {
		t.Fatalf("unexpected result: %#v", result)
	}
	if received.Slug != body.Slug || received.Version != body.Version || received.SHA256 != body.SHA256 || !received.Bootstrap {
		t.Fatalf("body not transmitted correctly: %#v", received)
	}
}

// TestPostMandatePublishBootstrapFalseTravelsInBody confirma que --bootstrap=false no
// cambia nada del lado Nucleus más allá del valor del campo en el body (§4 del encargo).
func TestPostMandatePublishBootstrapFalseTravelsInBody(t *testing.T) {
	identity, _ := testIdentity(t)
	var received publishMandateRequestBody
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&received)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(publishMandateResponseBody{MandateID: "mandate-1", MandateVersionID: "version-1", BootstrapAssigned: false})
	}))
	defer server.Close()

	body := publishMandateRequestBody{Slug: "s", Version: "1.0.0", Visibility: "private", MandateBase64: "e30=", SHA256: sha256HexOf([]byte("{}")), Bootstrap: false}
	result, err := postMandatePublish(context.Background(), server.URL, "org-test", identity, body, time.Now())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if received.Bootstrap {
		t.Fatal("bootstrap=false was not transmitted as false")
	}
	if result.BootstrapAssigned {
		t.Fatal("expected bootstrap_assigned=false to pass through untouched")
	}
}

func TestPostMandatePublishNonOKStatus(t *testing.T) {
	identity, _ := testIdentity(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":"version_conflict"}`))
	}))
	defer server.Close()

	body := publishMandateRequestBody{Slug: "s", Version: "1.0.0", Visibility: "private", MandateBase64: "e30=", SHA256: sha256HexOf([]byte("{}")), Bootstrap: true}
	if _, err := postMandatePublish(context.Background(), server.URL, "org-test", identity, body, time.Now()); err == nil {
		t.Fatal("expected error for HTTP 409")
	}
}
