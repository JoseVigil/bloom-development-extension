package maintenance

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"metamorph/internal/core"
)

func uninstallBuildFixture(t *testing.T) string {
	t.Helper()
	path := filepath.Join("..", "..", "..", "native", "bin", "win64", "uninstall", "bloom-uninstall.exe")
	if _, err := os.Stat(path); err != nil {
		t.Skip("Windows uninstall build fixture unavailable")
	}
	return path
}

func copyUninstallFixture(t *testing.T, source, dest string) {
	t.Helper()
	data, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dest, data, 0755); err != nil {
		t.Fatal(err)
	}
}

func TestUninstallRolloutComponentContract(t *testing.T) {
	var found *component
	for i := range allComponents {
		if allComponents[i].Key == "uninstall" {
			found = &allComponents[i]
			break
		}
	}
	if found == nil {
		t.Fatal("uninstall component missing")
	}
	root := filepath.Join("repo", "root")
	base := filepath.Join("app", "data")
	if want := filepath.Join(root, "installer", "native", "bin", "win64", "uninstall", "bloom-uninstall.exe"); found.SourceFn(root) != want {
		t.Fatalf("source=%s, want %s", found.SourceFn(root), want)
	}
	if want := filepath.Join(base, "bin", "uninstall"); found.DestFn(base) != want {
		t.Fatalf("destination=%s, want %s", found.DestFn(base), want)
	}
	if len(found.Platforms) != 1 || found.Platforms[0] != "windows" {
		t.Fatalf("platforms=%v", found.Platforms)
	}
	active := false
	for _, comp := range activeComponents() {
		if comp.Key == "uninstall" {
			active = true
		}
	}
	if active != (runtime.GOOS == "windows") {
		t.Fatalf("active=%t on %s", active, runtime.GOOS)
	}
	if !strings.Contains(componentKeysDetailed(), "uninstall [windows only]") {
		t.Fatal("uninstall missing from --only help")
	}
	c, err := core.NewCoreSilent()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(createRolloutCommand(c).Example, "rollout --only uninstall") {
		t.Fatal("uninstall example missing")
	}
}

func TestUninstallExplicitMissingSourceFails(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows rollout")
	}
	dst := filepath.Join(t.TempDir(), "bin", "uninstall", "bloom-uninstall.exe")
	if _, err := rolloutUninstall(filepath.Join(t.TempDir(), "missing.exe"), dst, false); err == nil {
		t.Fatal("missing candidate accepted")
	}
	if _, err := os.Stat(dst); !os.IsNotExist(err) {
		t.Fatalf("destination created: %v", err)
	}
	// Exercise the Cobra command path: an explicit missing source must have a
	// nonzero result rather than entering the generic skipped branch.
	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, "installer", "metamorph"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(repo, "installer", "native", "bin"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "installer", "metamorph", "go.mod"), []byte("module fixture"), 0644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("BLOOM_REPO_ROOT", repo)
	c, err := core.NewCoreSilent()
	if err != nil {
		t.Fatal(err)
	}
	if err := runRollout(c, false, "uninstall", "", ""); err == nil {
		t.Fatal("explicit missing source returned success")
	}
}

func TestUninstallDryRunAndInvalidSource(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows rollout")
	}
	fixture := uninstallBuildFixture(t)
	dst := filepath.Join(t.TempDir(), "uninstall", "bloom-uninstall.exe")
	report, err := rolloutUninstall(fixture, dst, true)
	if err != nil || report.Result != "dry_run" || report.Version != "1.0.0" || report.Build < 0 || report.SHA256 == "" {
		t.Fatalf("dry-run: %+v, %v", report, err)
	}
	if _, statErr := os.Stat(filepath.Dir(dst)); !os.IsNotExist(statErr) {
		t.Fatalf("dry-run wrote destination: %v", statErr)
	}
	invalid := filepath.Join(t.TempDir(), "invalid.exe")
	if err := os.WriteFile(invalid, []byte("not a PE executable"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := rolloutUninstall(invalid, dst, false); err == nil {
		t.Fatal("invalid Windows executable accepted")
	}
}

func TestUninstallFirstInstallReplaceAndIdempotence(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows rollout")
	}
	fixture := uninstallBuildFixture(t)
	src := filepath.Join(t.TempDir(), "bloom-uninstall.exe")
	copyUninstallFixture(t, fixture, src)
	dstDir := filepath.Join(t.TempDir(), "uninstall")
	dst := filepath.Join(dstDir, "bloom-uninstall.exe")
	first, err := rolloutUninstall(src, dst, false)
	if err != nil || first.Result != "deployed" {
		t.Fatalf("first install: %+v, %v", first, err)
	}
	if got, _ := uninstallSHA256File(dst); got != first.SHA256 {
		t.Fatal("first install hash mismatch")
	}
	marker := filepath.Join(dstDir, "keep.txt")
	if err := os.WriteFile(marker, []byte("preserve"), 0644); err != nil {
		t.Fatal(err)
	}
	second, err := rolloutUninstall(src, dst, false)
	if err != nil || second.Result != "unchanged" {
		t.Fatalf("repeat: %+v, %v", second, err)
	}
	f, err := os.OpenFile(src, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.Write([]byte("different build content")); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	third, err := rolloutUninstall(src, dst, false)
	if err != nil || third.Result != "deployed" || third.SHA256 == first.SHA256 || third.Version != first.Version || third.Build != first.Build {
		t.Fatalf("changed content: %+v, %v", third, err)
	}
	if got, _ := os.ReadFile(marker); string(got) != "preserve" {
		t.Fatal("unrelated destination file changed")
	}
	if got, _ := uninstallSHA256File(dst); got != third.SHA256 {
		t.Fatal("replacement hash mismatch")
	}
}

func TestUninstallVerificationFailureRestoresPrevious(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows rollout")
	}
	fixture := uninstallBuildFixture(t)
	src := filepath.Join(t.TempDir(), "bloom-uninstall.exe")
	copyUninstallFixture(t, fixture, src)
	dst := filepath.Join(t.TempDir(), "uninstall", "bloom-uninstall.exe")
	if _, err := rolloutUninstall(src, dst, false); err != nil {
		t.Fatal(err)
	}
	previousHash, _ := uninstallSHA256File(dst)
	f, err := os.OpenFile(src, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = f.Write([]byte("replacement"))
	_ = f.Close()
	probe := func(path string) (uninstallVersion, error) {
		if path == dst {
			return uninstallVersion{}, fmt.Errorf("injected verification failure")
		}
		return probeUninstallVersion(path)
	}
	report, err := rolloutUninstallWithProbe(src, dst, false, probe)
	if err == nil || report.Rollback != "restored" {
		t.Fatalf("rollback: %+v, %v", report, err)
	}
	if got, _ := uninstallSHA256File(dst); got != previousHash {
		t.Fatal("previous executable not restored")
	}
}
