//go:build windows

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFunctionalRootValidationIgnoresRedirectedTemp(t *testing.T) {
	parent, err := filepath.Abs(filepath.Join("..", "..", ".runner-core-temp"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(parent, 0700); err != nil {
		t.Fatal(err)
	}
	root, err := os.MkdirTemp(parent, "rc-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(root); _ = os.Remove(parent) })
	if err := os.MkdirAll(filepath.Join(root, ".runner-core"), 0700); err != nil {
		t.Fatal(err)
	}
	m := functionalManifest{Kind: "functional_only", RunID: "test-run", Root: root}
	b, _ := json.Marshal(m)
	if err := os.WriteFile(filepath.Join(root, ".runner-core", "manifest.json"), b, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("RUNNER_CORE_RUN_ID", m.RunID)
	t.Setenv("TEMP", filepath.Join(root, "tmp"))
	t.Setenv("TMP", filepath.Join(root, "tmp"))
	if _, err := functionalRoot(root); err != nil {
		t.Fatalf("redirected TEMP should be accepted: %v", err)
	}
	t.Setenv("RUNNER_CORE_RUN_ID", "wrong-run")
	if _, err := functionalRoot(root); err == nil {
		t.Fatal("mismatched run accepted")
	}
}

func TestControlledParentResolvesToItself(t *testing.T) {
	parent := filepath.Join(os.TempDir(), "bloom-runner-core")
	if _, err := controlledParent(); err != nil {
		t.Fatalf("controlled parent cannot be inspected: %v", err)
	}
	if err := assertNoReparseAncestors(parent); err != nil {
		t.Fatal(err)
	}
}

func TestRootValidationRejectsOutsideControlledParent(t *testing.T) {
	if err := validateRoot(filepath.Join(t.TempDir(), "rc-outside")); err == nil {
		t.Fatal("outside root accepted")
	}
	if err := validateRoot(`C:\repos\eias-repos`); err == nil {
		t.Fatal("productive-looking root accepted")
	}
}

func TestRootSDDLHasOnlyThreeExplicitPrincipals(t *testing.T) {
	m := rootMarker{User: "S-1-5-21-1", Logon: "S-1-5-5-1-2", Restrictor: "S-1-5-21-2"}
	s := expectedRootSDDL(m)
	if !strings.HasPrefix(s, "D:P") || strings.Count(s, "(A;") != 3 {
		t.Fatalf("protected three-principal DACL expected")
	}
	for _, sid := range []string{m.User, m.Logon, m.Restrictor} {
		if !strings.Contains(s, sid) {
			t.Fatal("principal absent")
		}
	}
}

func TestRunAndRestrictorAreUnique(t *testing.T) {
	a, err := randomRunID()
	if err != nil {
		t.Fatal(err)
	}
	b, err := randomRunID()
	if err != nil {
		t.Fatal(err)
	}
	if a == b || len(a) != 36 {
		t.Fatal("run ID invalid or repeated")
	}
	x, err := randomRestrictorSID()
	if err != nil {
		t.Fatal(err)
	}
	y, err := randomRestrictorSID()
	if err != nil {
		t.Fatal(err)
	}
	if x == y || !strings.HasPrefix(x, "S-1-5-21-") {
		t.Fatal("restrictor SID invalid or repeated")
	}
}

func TestProbeRequiresEveryAccessOutcome(t *testing.T) {
	p := accessProbes{true, true, true, true, true, true, true}
	if !p.passed() {
		t.Fatal("complete probe rejected")
	}
	p.ForbiddenWriteOwner = false
	if p.passed() {
		t.Fatal("incomplete probe accepted")
	}
}
