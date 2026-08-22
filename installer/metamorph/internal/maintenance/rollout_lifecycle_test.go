package maintenance

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCanonicalServiceNames(t *testing.T) {
	tests := []struct{ goos, component, want string }{
		{"windows", "nucleus", "BloomNucleusService"},
		{"windows", "brain", "BloomBrainService"},
		{"linux", "nucleus", "com.bloom.nucleus.service"},
		{"linux", "brain", "com.bloom.brain.service"},
		{"linux", "sensor", "com.bloom.sensor.service"},
		{"darwin", "nucleus", "com.bloom.nucleus"},
		{"darwin", "brain", "com.bloom.brain"},
		{"darwin", "sensor", "com.bloom.sensor"},
	}
	for _, tt := range tests {
		if got := serviceNameFor(tt.goos, tt.component); got != tt.want {
			t.Errorf("serviceNameFor(%q, %q) = %q, want %q", tt.goos, tt.component, got, tt.want)
		}
	}
}

func TestFindRepoRootSupportsVariableOriginDepth(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "installer", "metamorph"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "installer", "native", "bin", "win64", "nucleus"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "installer", "metamorph", "go.mod"), []byte("module test"), 0o644); err != nil {
		t.Fatal(err)
	}

	for _, start := range []string{
		filepath.Join(root, "installer", "native", "bin", "win64"),
		filepath.Join(root, "installer", "native", "bin", "win64", "nucleus"),
	} {
		got, ok := findRepoRoot(start)
		if !ok || got != root {
			t.Fatalf("findRepoRoot(%q) = %q, %v; want %q, true", start, got, ok, root)
		}
	}
}
