package supervisor

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestResolveManagedNodeBinUsesBloomRuntime(t *testing.T) {
	binDir := t.TempDir()
	name := "node"
	if runtime.GOOS == "windows" {
		name = "node.exe"
	}
	expected := filepath.Join(binDir, "node", name)
	if err := os.MkdirAll(filepath.Dir(expected), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(expected, []byte("managed-node"), 0o755); err != nil {
		t.Fatal(err)
	}

	resolved, err := resolveManagedNodeBin(binDir)
	if err != nil {
		t.Fatal(err)
	}
	if resolved != expected {
		t.Fatalf("resolved %q, want %q", resolved, expected)
	}
}

func TestResolveManagedNodeBinRejectsMissingRuntime(t *testing.T) {
	binDir := t.TempDir()
	resolved, err := resolveManagedNodeBin(binDir)
	if err == nil {
		t.Fatalf("resolved missing managed runtime as %q", resolved)
	}
	if !strings.Contains(err.Error(), "managed Node runtime not found") {
		t.Fatalf("unexpected error: %v", err)
	}
}
