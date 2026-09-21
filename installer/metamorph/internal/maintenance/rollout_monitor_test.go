package maintenance

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"metamorph/internal/core"
)

func TestMonitorRolloutComponentContract(t *testing.T) {
	var monitor *component
	for i := range allComponents {
		if allComponents[i].Key == "monitor" {
			monitor = &allComponents[i]
			break
		}
	}
	if monitor == nil {
		t.Fatal("monitor is not registered as a rollout component")
	}

	repoRoot := filepath.Join("repo", "root")
	wantSource := filepath.Join(repoRoot, "installer", "native", "bin", nativePlatformDir(), "monitor")
	if got := monitor.SourceFn(repoRoot); got != wantSource {
		t.Fatalf("Monitor SourceFn() = %q, want %q", got, wantSource)
	}

	basePath := filepath.Join("app", "data")
	wantDestination := filepath.Join(basePath, "bin", "monitor")
	if got := monitor.DestFn(basePath); got != wantDestination {
		t.Fatalf("Monitor DestFn() = %q, want %q", got, wantDestination)
	}

	if !strings.Contains(componentKeysDetailed(), "monitor") {
		t.Fatal("monitor is missing from the rollout --only values")
	}

	c, err := core.NewCoreSilent()
	if err != nil {
		t.Fatal(err)
	}
	cmd := createRolloutCommand(c)
	if !strings.Contains(cmd.Example, "rollout --only monitor") {
		t.Fatal("monitor rollout example is missing from Cobra help")
	}
}

func TestMonitorRolloutCopiesExecutableAndHelp(t *testing.T) {
	src := t.TempDir()
	dst := t.TempDir()
	binaryName := exe("monitor")
	files := map[string]string{
		binaryName:               "binary",
		"help/monitor_help.txt":  "text help",
		"help/monitor_help.json": `{"name":"monitor"}`,
	}

	for relative, content := range files {
		path := filepath.Join(src, filepath.FromSlash(relative))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	copied, err := copyDir(src, dst)
	if err != nil {
		t.Fatal(err)
	}
	if copied != len(files) {
		t.Fatalf("copyDir copied %d files, want %d", copied, len(files))
	}
	for relative, want := range files {
		path := filepath.Join(dst, filepath.FromSlash(relative))
		got, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("missing rollout artifact %s: %v", relative, err)
		}
		if string(got) != want {
			t.Fatalf("artifact %s = %q, want %q", relative, got, want)
		}
	}
}
