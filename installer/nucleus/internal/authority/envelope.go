package authority

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/gowebpki/jcs"
)

const signatureDomain = "BLOOM-AUTHORITY-SNAPSHOT-v1"

type Integrity struct {
	Canonicalization   string `json:"canonicalization"`
	DigestAlgorithm    string `json:"digest_algorithm"`
	Digest             string `json:"digest"`
	SignatureAlgorithm string `json:"signature_algorithm"`
	KeyID              string `json:"key_id"`
	Signature          string `json:"signature"`
}
type Envelope struct {
	Payload   json.RawMessage `json:"payload"`
	Integrity Integrity       `json:"integrity"`
}
type TrustBundle map[string]map[string]ed25519.PublicKey

func ParseAndVerifyEnvelope(raw []byte, trust TrustBundle) (Envelope, []byte, error) {
	if len(raw) > 16<<20 {
		return Envelope{}, nil, errors.New("authority envelope exceeds size limit")
	}
	if err := rejectDuplicateKeys(raw); err != nil {
		return Envelope{}, nil, err
	}
	var env Envelope
	if err := decodeStrict(raw, &env); err != nil {
		return Envelope{}, nil, err
	}
	if env.Integrity.Canonicalization != "JCS-RFC8785" || env.Integrity.DigestAlgorithm != "SHA-256" || env.Integrity.SignatureAlgorithm != "Ed25519" {
		return Envelope{}, nil, errors.New("unsupported integrity profile")
	}
	canonical, err := Canonicalize(env.Payload)
	if err != nil {
		return Envelope{}, nil, err
	}
	sum := sha256.Sum256(canonical)
	digest, err := base64.RawURLEncoding.DecodeString(env.Integrity.Digest)
	if err != nil || !bytes.Equal(digest, sum[:]) {
		return Envelope{}, nil, errors.New("authority digest mismatch")
	}
	var issuer struct {
		Issuer string `json:"issuer"`
	}
	if err := json.Unmarshal(env.Payload, &issuer); err != nil {
		return Envelope{}, nil, err
	}
	keys := trust[issuer.Issuer]
	key := keys[env.Integrity.KeyID]
	if len(key) != ed25519.PublicKeySize {
		return Envelope{}, nil, errors.New("untrusted authority key")
	}
	sig, err := base64.RawURLEncoding.DecodeString(env.Integrity.Signature)
	if err != nil {
		return Envelope{}, nil, errors.New("invalid signature encoding")
	}
	message := append(append([]byte(signatureDomain), 0), canonical...)
	if !ed25519.Verify(key, message, sig) {
		return Envelope{}, nil, errors.New("invalid authority signature")
	}
	return env, canonical, nil
}
func decodeStrict(raw []byte, dst any) error {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	d.UseNumber()
	if err := d.Decode(dst); err != nil {
		return err
	}
	if d.Decode(&struct{}{}) != io.EOF {
		return errors.New("trailing JSON")
	}
	return nil
}
func rejectDuplicateKeys(raw []byte) error {
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	var walk func() error
	walk = func() error {
		tok, e := d.Token()
		if e != nil {
			return e
		}
		switch v := tok.(type) {
		case json.Delim:
			if v == '{' {
				seen := map[string]bool{}
				for d.More() {
					k, err := d.Token()
					if err != nil {
						return err
					}
					s, ok := k.(string)
					if !ok {
						return errors.New("JSON object key is not a string")
					}
					if seen[s] {
						return fmt.Errorf("duplicate JSON property %q", s)
					}
					seen[s] = true
					if e := walk(); e != nil {
						return e
					}
				}
				_, e = d.Token()
				return e
			}
			if v == '[' {
				for d.More() {
					if e := walk(); e != nil {
						return e
					}
				}
				_, e = d.Token()
				return e
			}
		}
		return nil
	}
	if err := walk(); err != nil {
		return err
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return errors.New("trailing JSON")
	}
	return nil
}
func Canonicalize(raw []byte) ([]byte, error) {
	if err := rejectDuplicateKeys(raw); err != nil {
		return nil, err
	}
	canonical, err := jcs.Transform(raw)
	if err != nil {
		return nil, fmt.Errorf("JCS RFC 8785 canonicalization: %w", err)
	}
	return canonical, nil
}
