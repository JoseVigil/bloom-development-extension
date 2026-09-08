package mandatedelivery

import (
	"context"
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"nucleus/internal/authority"
	"os"
	"path/filepath"
	"testing"
)

func TestClientS2SAndPending(t *testing.T) {
	v, body, ctx := vector(t)
	der, _ := base64.StdEncoding.DecodeString(v["test_private_pkcs8_base64"])
	parsed, _ := x509.ParsePKCS8PrivateKey(der)
	key := parsed.(ed25519.PrivateKey)
	for _, status := range []int{200, 404, 502} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/v1/mandate/bootstrap" || r.URL.Query().Get("org") != ctx.OrganizationID || r.URL.Query().Get("installation_id") != ctx.InstallationID {
					t.Error("request mismatch")
				}
				p, _ := json.Marshal(map[string]string{"installation_id": r.Header.Get("X-Bloom-Installation-Id"), "organization_id": ctx.OrganizationID, "method": "GET", "path": r.URL.Path, "timestamp": r.Header.Get("X-Bloom-Timestamp")})
				canonical, _ := authority.Canonicalize(p)
				sig, _ := base64.StdEncoding.DecodeString(r.Header.Get("X-Bloom-Signature"))
				if !ed25519.Verify(key.Public().(ed25519.PublicKey), append(append([]byte("BLOOM-INSTALLATION-AUTH-v1"), 0), canonical...), sig) {
					t.Error("invalid S2S signature")
				}
				w.WriteHeader(status)
				w.Write(body)
			}))
			defer server.Close()
			root := filepath.Join(t.TempDir(), "receipts")
			c := Client{BaseURL: server.URL, Signer: key, Context: ctx, Store: &Store{Root: root}}
			result, err := c.Receive(context.Background())
			if status == 200 && (err != nil || result != "accepted") {
				t.Fatalf("%s %v", result, err)
			}
			if status == 404 && (err != nil || result != "pending") {
				t.Fatalf("%s %v", result, err)
			}
			if status == 502 && err == nil {
				t.Fatal("accepted HTTP error")
			}
			if status != 200 {
				if _, err = os.Stat(root); !os.IsNotExist(err) {
					t.Fatal("HTTP non-success mutated store")
				}
			}
		})
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type partialReader struct{}

func (partialReader) Read([]byte) (int, error) { return 0, io.ErrUnexpectedEOF }
func (partialReader) Close() error             { return nil }
func TestPartialResponseNoMutation(t *testing.T) {
	v, _, ctx := vector(t)
	der, _ := base64.StdEncoding.DecodeString(v["test_private_pkcs8_base64"])
	key, _ := x509.ParsePKCS8PrivateKey(der)
	root := filepath.Join(t.TempDir(), "absent")
	c := Client{BaseURL: "http://fixture.test", Signer: key.(ed25519.PrivateKey), Context: ctx, Store: &Store{Root: root}, HTTP: &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: partialReader{}}, nil
	})}}
	if _, err := c.Receive(context.Background()); err == nil {
		t.Fatal("accepted partial response")
	}
	if _, err := os.Stat(root); !os.IsNotExist(err) {
		t.Fatal("mutated root")
	}
}
