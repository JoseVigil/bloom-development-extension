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

func TestAITAPFailureStatesPreserveOrReportPreviousBundle(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows build fixture")
	}
	src := filepath.Clean(filepath.Join("..", "..", "..", "native", "bin", "win64", "aitap"))
	if _, err := os.Stat(filepath.Join(src, "bundle-manifest.json")); err != nil {
		t.Skip("Build bundle unavailable")
	}
	for _, phase := range []string{"staging", "production", "rollback"} {
		t.Run(phase, func(t *testing.T) {
			dst := filepath.Join(t.TempDir(), "aitap")
			if err := os.MkdirAll(dst, 0755); err != nil {
				t.Fatal(err)
			}
			marker := filepath.Join(dst, "previous.txt")
			if err := os.WriteFile(marker, []byte("previous"), 0644); err != nil {
				t.Fatal(err)
			}
			checks := 0
			report := runAITAPRolloutWithSmokes(src, dst, false, func(root, version string, build int) (map[string]string, error) {
				checks++
				if phase == "staging" || root == dst {
					if phase == "rollback" && root == dst {
						backups, _ := filepath.Glob(filepath.Join(filepath.Dir(dst), ".aitap-backup-*"))
						if len(backups) != 1 {
							return nil, fmt.Errorf("missing backup")
						}
						if err := os.Rename(backups[0], backups[0]+".moved"); err != nil {
							return nil, err
						}
					}
					return nil, fmt.Errorf("injected %s failure", phase)
				}
				return map[string]string{"system.version": "passed"}, nil
			})
			if report.Error == "" || checks == 0 {
				t.Fatalf("failure not reported: %+v", report)
			}
			if phase == "rollback" {
				if report.State != "rollback_failed" || report.Rollback == "" {
					t.Fatalf("rollback failure not explicit: %+v", report)
				}
				return
			}
			want := "staging_failed"
			if phase == "production" {
				want = "production_failed_and_restored"
			}
			if report.State != want {
				t.Fatalf("state=%s, want %s", report.State, want)
			}
			if got, err := os.ReadFile(marker); err != nil || string(got) != "previous" {
				t.Fatalf("previous bundle lost: %q, %v", got, err)
			}
		})
	}
}

func TestAITAPRolloutRejectsInvalidManifestBeforeProduction(t *testing.T) {
	src := t.TempDir()
	dst := filepath.Join(t.TempDir(), "aitap")
	if err := os.MkdirAll(dst, 0755); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(dst, "previous.txt")
	if err := os.WriteFile(marker, []byte("previous"), 0644); err != nil {
		t.Fatal(err)
	}
	report := runAITAPRollout(src, dst, false)
	if report.State != "rejected_before_copy" || report.Error == "" {
		t.Fatalf("unexpected report: %+v", report)
	}
	if data, err := os.ReadFile(marker); err != nil || string(data) != "previous" {
		t.Fatalf("production changed: %q, %v", data, err)
	}
}

func TestAITAPBuild15DryRunDoesNotCreateDestination(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows build fixture")
	}
	src := filepath.Clean(filepath.Join("..", "..", "..", "native", "bin", "win64", "aitap"))
	if _, err := os.Stat(filepath.Join(src, "bundle-manifest.json")); err != nil {
		t.Skip("Build bundle unavailable")
	}
	dst := filepath.Join(t.TempDir(), "aitap")
	report := runAITAPRollout(src, dst, true)
	if report.Error != "" || report.State != "source_validated" || report.Files != 148 {
		t.Fatalf("unexpected dry-run: %+v", report)
	}
	if _, err := os.Stat(dst); !os.IsNotExist(err) {
		t.Fatalf("dry-run created destination: %v", err)
	}
}

func TestAITAPBuild15TransactionalRolloutInTemporaryDirectory(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows build fixture")
	}
	src := filepath.Clean(filepath.Join("..", "..", "..", "native", "bin", "win64", "aitap"))
	if _, err := os.Stat(filepath.Join(src, "bundle-manifest.json")); err != nil {
		t.Skip("Build bundle unavailable")
	}
	dst := filepath.Join(t.TempDir(), "aitap")
	if err := os.MkdirAll(dst, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dst, "obsolete.txt"), []byte("old"), 0644); err != nil {
		t.Fatal(err)
	}
	first := runAITAPRollout(src, dst, false)
	if first.Error != "" || first.State != "completed" || first.Build != 15 || first.Files != 148 {
		t.Fatalf("first rollout: %+v", first)
	}
	if _, err := os.Stat(filepath.Join(dst, "_internal")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dst, "obsolete.txt")); !os.IsNotExist(err) {
		t.Fatalf("obsolete file retained: %v", err)
	}
	second := runAITAPRollout(src, dst, false)
	if second.Error != "" || second.State != "completed" || second.Swap != "already_current" {
		t.Fatalf("idempotent rollout: %+v", second)
	}
}

func TestAitapRolloutComponentContract(t *testing.T) {
	var aitap *component
	for i := range allComponents {
		if allComponents[i].Key == "aitap" {
			aitap = &allComponents[i]
			break
		}
	}
	if aitap == nil {
		t.Fatal("aitap is not registered as a rollout component")
	}

	repoRoot := filepath.Join("repo", "root")
	wantSource := filepath.Join(repoRoot, "installer", "native", "bin", nativePlatformDir(), "aitap")
	if got := aitap.SourceFn(repoRoot); got != wantSource {
		t.Fatalf("Aitap SourceFn() = %q, want %q", got, wantSource)
	}

	basePath := filepath.Join("app", "data")
	wantDestination := filepath.Join(basePath, "bin", "aitap")
	if got := aitap.DestFn(basePath); got != wantDestination {
		t.Fatalf("Aitap DestFn() = %q, want %q", got, wantDestination)
	}

	if !strings.Contains(componentKeysDetailed(), "aitap") {
		t.Fatal("aitap is missing from the rollout --only values")
	}

	c, err := core.NewCoreSilent()
	if err != nil {
		t.Fatal(err)
	}
	cmd := createRolloutCommand(c)
	if !strings.Contains(cmd.Example, "rollout --only aitap") {
		t.Fatal("aitap rollout example is missing from Cobra help")
	}
}

func TestAitapRolloutCopiesExecutableAndHelp(t *testing.T) {
	src := t.TempDir()
	dst := t.TempDir()
	binaryName := exe("aitap")
	files := map[string]string{
		binaryName:             "binary",
		"help/aitap_help.txt":  "text help",
		"help/aitap_help.json": `{"name":"aitap"}`,
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
