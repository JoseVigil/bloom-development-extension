// Package mandatedelivery receives authenticated bytes; it never installs or executes them.
package mandatedelivery

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"nucleus/internal/authority"
	"regexp"
	"strings"
	"time"
)

const Domain = "BLOOM-MANDATE-DELIVERY-v1"
const maxBody = 16 << 20

var utcTimestamp = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$`)

type Envelope struct {
	MandateID      string `json:"mandate_id"`
	OrganizationID string `json:"organization_id"`
	InstallationID string `json:"installation_id"`
	Version        string `json:"mandate_version"`
	Digest         string `json:"mandate_digest"`
	IssuedAt       string `json:"issued_at"`
	Signature      string `json:"signature"`
	KeyID          string `json:"signing_key_id"`
}
type Delivery struct {
	Envelope      Envelope `json:"envelope"`
	MandateBase64 string   `json:"mandate_base64"`
}
type Context struct {
	OrganizationID, InstallationID, Issuer string
	Trust                                  authority.TrustBundle
	Now                                    func() time.Time
}

func strict(raw []byte, out any) error {
	// Canonicalize rejects duplicate keys at every depth and malformed/trailing JSON.
	if _, err := authority.Canonicalize(raw); err != nil {
		return err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(out); err != nil {
		return err
	}
	if dec.Decode(new(any)) != io.EOF {
		return errors.New("trailing JSON")
	}
	return nil
}
func decode64(s string) ([]byte, error) {
	b, e := base64.StdEncoding.Strict().DecodeString(s)
	if e != nil || base64.StdEncoding.EncodeToString(b) != s {
		return nil, errors.New("invalid standard base64")
	}
	return b, nil
}
func Verify(raw []byte, ctx Context) (Delivery, []byte, error) {
	if len(raw) > maxBody {
		return Delivery{}, nil, errors.New("delivery exceeds size limit")
	}
	var d Delivery
	fail := func(s string) (Delivery, []byte, error) { return Delivery{}, nil, errors.New(s) }
	if err := strict(raw, &d); err != nil {
		return Delivery{}, nil, err
	}
	var required map[string]json.RawMessage
	_ = json.Unmarshal(raw, &required)
	if len(required) != 2 || required["envelope"] == nil || required["mandate_base64"] == nil || bytes.Equal(required["mandate_base64"], []byte("null")) {
		return fail("missing delivery fields")
	}
	// encoding/json matches struct fields case-insensitively; the wire contract does not.
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(required["envelope"], &fields); err != nil || len(fields) != 8 {
		return fail("invalid envelope fields")
	}
	for _, name := range []string{"mandate_id", "organization_id", "installation_id", "mandate_version", "mandate_digest", "issued_at", "signature", "signing_key_id"} {
		if fields[name] == nil || bytes.Equal(fields[name], []byte("null")) {
			return fail("missing envelope field")
		}
	}
	e := d.Envelope
	if e.MandateID == "" || e.Version == "" || e.KeyID == "" || ctx.Issuer == "" || ctx.OrganizationID == "" || ctx.InstallationID == "" || e.OrganizationID != ctx.OrganizationID || e.InstallationID != ctx.InstallationID {
		return fail("invalid delivery binding")
	}
	issued, err := time.Parse(time.RFC3339Nano, e.IssuedAt)
	now := time.Now().UTC()
	if ctx.Now != nil {
		now = ctx.Now().UTC()
	}
	if err != nil || !strings.HasSuffix(e.IssuedAt, "Z") || !utcTimestamp.MatchString(e.IssuedAt) || issued.After(now.Add(120*time.Second)) {
		return fail("invalid issued_at")
	}
	content, err := decode64(d.MandateBase64)
	if err != nil {
		return fail("invalid mandate_base64")
	}
	digest := sha256.Sum256(content)
	if e.Digest != hex.EncodeToString(digest[:]) {
		return fail("digest mismatch")
	}
	key := ctx.Trust[ctx.Issuer][e.KeyID]
	if len(key) != ed25519.PublicKeySize {
		return fail("unknown signing key")
	}
	sig, err := decode64(e.Signature)
	if err != nil {
		return fail("invalid signature encoding")
	}
	payload := map[string]string{"mandate_id": e.MandateID, "organization_id": e.OrganizationID, "installation_id": e.InstallationID, "mandate_version": e.Version, "mandate_digest": e.Digest, "issued_at": e.IssuedAt}
	encoded, _ := json.Marshal(payload)
	canonical, err := authority.Canonicalize(encoded)
	if err != nil {
		return Delivery{}, nil, err
	}
	if !ed25519.Verify(key, append(append([]byte(Domain), 0), canonical...), sig) {
		return fail("invalid delivery signature")
	}
	return d, content, nil
}
