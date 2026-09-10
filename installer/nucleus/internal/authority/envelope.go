package authority

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

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
	if err := decodeWire(raw, &env); err != nil {
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
	if err != nil || base64.RawURLEncoding.EncodeToString(digest) != env.Integrity.Digest || subtle.ConstantTimeCompare(digest, sum[:]) != 1 {
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
	if err != nil || len(sig) != ed25519.SignatureSize || base64.RawURLEncoding.EncodeToString(sig) != env.Integrity.Signature {
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
	if !utf8.Valid(raw) {
		return errors.New("invalid UTF-8")
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	var walk func() error
	walk = func() error {
		tok, e := d.Token()
		if e != nil {
			return e
		}
		switch v := tok.(type) {
		case json.Number:
			f, err := strconv.ParseFloat(string(v), 64)
			if err != nil || (f == 0 && strings.HasPrefix(string(v), "-")) {
				return errors.New("invalid I-JSON number")
			}
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

// Wire fields are mandatory and case-sensitive, unlike encoding/json's defaults.
// Pointer fields alone admit null. DeltaOperation.value also admits null for remove.
func decodeWire(raw []byte, dst any) error {
	if err := rejectDuplicateKeys(raw); err != nil {
		return err
	}
	var value any
	d := json.NewDecoder(bytes.NewReader(raw))
	d.UseNumber()
	if err := d.Decode(&value); err != nil {
		return err
	}
	if err := checkWireShape(value, reflect.TypeOf(dst).Elem()); err != nil {
		return err
	}
	return decodeStrict(raw, dst)
}

var wireTimePattern = regexp.MustCompile(`^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?Z$`)

func checkWireShape(value any, t reflect.Type) error {
	if t.Kind() == reflect.Pointer {
		if value == nil {
			return nil
		}
		return checkWireShape(value, t.Elem())
	}
	if t == reflect.TypeOf(json.RawMessage{}) {
		return nil
	}
	if t == reflect.TypeOf(time.Time{}) {
		s, ok := value.(string)
		if !ok || !wireTimePattern.MatchString(s) || strings.HasPrefix(s, "0000") {
			return errors.New("UTC wire timestamp required")
		}
		_, err := time.Parse(time.RFC3339Nano, s)
		return err
	}
	if value == nil {
		return errors.New("required wire value is null")
	}
	switch t.Kind() {
	case reflect.Struct:
		m, ok := value.(map[string]any)
		if !ok {
			return errors.New("wire object required")
		}
		if len(m) != t.NumField() {
			return errors.New("missing or unknown wire property")
		}
		for i := 0; i < t.NumField(); i++ {
			field := t.Field(i)
			key := strings.Split(field.Tag.Get("json"), ",")[0]
			v, exists := m[key]
			if !exists {
				return fmt.Errorf("missing wire property %s", key)
			}
			if field.Type == reflect.TypeOf(json.RawMessage{}) && v == nil && key != "value" {
				return errors.New("null wire content")
			}
			if err := checkWireShape(v, field.Type); err != nil {
				return fmt.Errorf("%s: %w", key, err)
			}
		}
	case reflect.Slice:
		a, ok := value.([]any)
		if !ok {
			return errors.New("wire array required")
		}
		for _, v := range a {
			if err := checkWireShape(v, t.Elem()); err != nil {
				return err
			}
		}
	case reflect.String:
		if _, ok := value.(string); !ok {
			return errors.New("wire string required")
		}
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
