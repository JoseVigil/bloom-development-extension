package gene

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDigestFilenamePortableRoundTrip(t *testing.T) {
	d := "sha256:" + strings.Repeat("a", 64)
	name, err := digestFilename(d)
	if err != nil || name != strings.Repeat("a", 64)+".json" || strings.Contains(name, ":") {
		t.Fatalf("name=%q err=%v", name, err)
	}
	back, err := digestFromFilename(name)
	if err != nil || back != d {
		t.Fatalf("back=%q err=%v", back, err)
	}
	for _, bad := range []string{"sha256:ABC", "sha256:" + strings.Repeat("A", 64), "sha512:" + strings.Repeat("a", 64), "../" + strings.Repeat("a", 64)} {
		if _, err := digestFilename(bad); !errors.Is(err, ErrDigestInvalid) {
			t.Fatalf("accepted %q", bad)
		}
	}
}

func TestCanonicalJSONStrictAndStable(t *testing.T) {
	b, err := canonicalize([]byte(`{"z":1,"a":"é"}`))
	if err != nil || string(b) != `{"a":"é","z":1}` {
		t.Fatalf("%s %v", b, err)
	}
	for _, bad := range []string{`{"x":1,"x":2}`, "{\"x\":\"e\u0301\"}", `{"x":1e400}`} {
		if _, err := canonicalize([]byte(bad)); err == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
	if _, err := canonicalize([]byte{'{', '"', 'x', '"', ':', '"', 0xff, '"', '}'}); err == nil {
		t.Fatal("invalid UTF-8 accepted")
	}
}

func TestImmutableObjectAndContentAddressVerification(t *testing.T) {
	s := &Store{Root: t.TempDir()}
	const project = "11111111-1111-4111-8111-111111111111"
	if _, err := s.initializeProject(project); err != nil {
		t.Fatal(err)
	}
	v := Identity{SchemaVersion: SchemaVersion, ProjectID: project, GeneID: "33333333-3333-4333-8333-333333333333", Function: "one"}
	if _, err := s.writeObject(project, "identities", v.GeneID, false, v); err != nil {
		t.Fatal(err)
	}
	v.Function = "two"
	if _, err := s.writeObject(project, "identities", v.GeneID, false, v); err == nil {
		t.Fatal("immutable overwrite accepted")
	}

	r := Revision{SchemaVersion: SchemaVersion, ProjectID: project, GeneID: v.GeneID, DeclaredFunction: "x", ConstitutiveAssets: []AssetRef{}, StableProvenance: map[string]string{}, Verification: Verification{EvidenceDigest: "sha256:" + strings.Repeat("0", 64), Verifier: SchemaVersion}}
	p, _ := withoutField(r, "revision_digest")
	r.RevisionDigest, _, _ = digestValue(p)
	path, _ := s.writeObject(project, "revisions", r.RevisionDigest, true, r)
	if strings.Contains(filepath.Base(path), ":") {
		t.Fatal("non-portable physical digest")
	}
	abs := filepath.Join(s.Root, ".genes", "projects", project, filepath.FromSlash(path))
	raw, _ := os.ReadFile(abs)
	raw[len(raw)-1] ^= 1
	_ = os.WriteFile(abs, raw, 0600)
	if _, err := s.readRevision(project, r.RevisionDigest); err == nil {
		t.Fatal("tampered content accepted")
	}
}
