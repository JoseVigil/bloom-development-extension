package gene

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/gowebpki/jcs"
	"golang.org/x/text/unicode/norm"
)

var digestPattern = regexp.MustCompile(`^sha256:([0-9a-f]{64})$`)

func canonicalize(raw []byte) ([]byte, error) {
	if err := validateJSON(raw); err != nil {
		return nil, err
	}
	out, err := jcs.Transform(raw)
	if err != nil {
		return nil, fmt.Errorf("JCS RFC 8785: %w", err)
	}
	return out, nil
}

func canonicalValue(v any) ([]byte, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return canonicalize(raw)
}

func digestValue(v any) (string, []byte, error) {
	b, err := canonicalValue(v)
	if err != nil {
		return "", nil, err
	}
	sum := sha256.Sum256(b)
	return "sha256:" + hex.EncodeToString(sum[:]), b, nil
}

func digestBytes(b []byte) string {
	sum := sha256.Sum256(b)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func digestFilename(digest string) (string, error) {
	m := digestPattern.FindStringSubmatch(digest)
	if m == nil {
		return "", ErrDigestInvalid
	}
	return m[1] + ".json", nil
}

func digestFromFilename(name string) (string, error) {
	if len(name) != 69 || !strings.HasSuffix(name, ".json") {
		return "", ErrDigestInvalid
	}
	d := "sha256:" + strings.TrimSuffix(name, ".json")
	if !digestPattern.MatchString(d) {
		return "", ErrDigestInvalid
	}
	return d, nil
}

func validateJSON(raw []byte) error {
	if !utf8.Valid(raw) {
		return fmt.Errorf("invalid UTF-8")
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var walk func(json.Token) error
	walk = func(tok json.Token) error {
		switch d := tok.(type) {
		case json.Delim:
			switch d {
			case '{':
				seen := map[string]bool{}
				for dec.More() {
					kt, err := dec.Token()
					if err != nil {
						return err
					}
					k, ok := kt.(string)
					if !ok || seen[k] {
						return fmt.Errorf("duplicate or invalid JSON key %q", k)
					}
					if !norm.NFC.IsNormalString(k) {
						return fmt.Errorf("JSON key is not NFC")
					}
					seen[k] = true
					v, err := dec.Token()
					if err != nil {
						return err
					}
					if err = walk(v); err != nil {
						return err
					}
				}
				_, err := dec.Token()
				return err
			case '[':
				for dec.More() {
					v, err := dec.Token()
					if err != nil {
						return err
					}
					if err = walk(v); err != nil {
						return err
					}
				}
				_, err := dec.Token()
				return err
			}
		case string:
			if !norm.NFC.IsNormalString(d) {
				return fmt.Errorf("JSON string is not NFC")
			}
		}
		return nil
	}
	tok, err := dec.Token()
	if err != nil {
		return err
	}
	if err = walk(tok); err != nil {
		return err
	}
	if _, err = dec.Token(); err != io.EOF {
		return fmt.Errorf("trailing JSON")
	}
	return nil
}

func strictDecode(raw []byte, dst any) error {
	if err := validateJSON(raw); err != nil {
		return err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	return nil
}

func normalizeContribution(c Contribution) Contribution {
	sort.Slice(c.Assets, func(i, j int) bool { return c.Assets[i].AssetID < c.Assets[j].AssetID })
	return c
}

func withoutField(v any, field string) (map[string]any, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var m map[string]any
	if err = json.Unmarshal(raw, &m); err != nil {
		return nil, err
	}
	delete(m, field)
	return m, nil
}
