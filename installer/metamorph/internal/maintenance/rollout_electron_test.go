package maintenance

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func componentByKey(t *testing.T, key string) component {
	t.Helper()
	for _, candidate := range allComponents {
		if candidate.Key == key {
			return candidate
		}
	}
	t.Fatalf("component %q is not registered", key)
	return component{}
}

func TestElectronRolloutUsesCompleteApplicationDirectory(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows source layout")
	}
	repoRoot := filepath.Join("repo", "root")
	for _, key := range []string{"workspace", "setup"} {
		component := componentByKey(t, key)
		want := filepath.Join(repoRoot, "installer", "native", "bin", "win64", key, "win-unpacked")
		if got := component.SourceFn(repoRoot); got != want {
			t.Fatalf("%s source = %q, want %q", key, got, want)
		}
	}
}

func TestElectronRolloutCopiesExecutableResourcesAndMetadata(t *testing.T) {
	src := t.TempDir()
	dst := t.TempDir()
	files := []string{
		"bloom-workspace.exe",
		"resources/app.asar",
		"resources/app.asar.unpacked/build_info.json",
		"locales/en-US.pak",
		"ffmpeg.dll",
	}
	for _, relative := range files {
		path := filepath.Join(src, filepath.FromSlash(relative))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(relative), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	copied, err := copyDir(src, dst)
	if err != nil {
		t.Fatal(err)
	}
	if copied != len(files) {
		t.Fatalf("copied %d files, want %d", copied, len(files))
	}
	for _, relative := range files {
		if _, err := os.Stat(filepath.Join(dst, filepath.FromSlash(relative))); err != nil {
			t.Fatalf("missing deployed file %s: %v", relative, err)
		}
	}
}
