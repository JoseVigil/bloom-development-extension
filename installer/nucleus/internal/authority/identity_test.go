package authority

import (
	"bytes"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestLoadOrCreateLocalIdentityIsDurableAndPrivate(t *testing.T) {
	path := filepath.Join(t.TempDir(), "authority", "identity.json")
	first, err := LoadOrCreateLocalIdentity(path)
	if err != nil {
		t.Fatal(err)
	}
	second, err := LoadOrCreateLocalIdentity(path)
	if err != nil {
		t.Fatal(err)
	}
	if first.InstallationID != second.InstallationID || !bytes.Equal(first.PublicKey, second.PublicKey) || !bytes.Equal(first.PrivateKey, second.PrivateKey) {
		t.Fatal("identity changed across load")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0077 != 0 {
		t.Fatalf("identity permissions = %o", info.Mode().Perm())
	}
}

func TestLoadOrCreateLocalIdentityRejectsCorruption(t *testing.T) {
	path := filepath.Join(t.TempDir(), "identity.json")
	corrupt := []byte(`{"installation_id":"bad","public_key":"bad","private_key":"bad"}`)
	if err := os.WriteFile(path, corrupt, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadOrCreateLocalIdentity(path); err == nil {
		t.Fatal("corrupt identity replaced")
	}
	after, _ := os.ReadFile(path)
	if !bytes.Equal(corrupt, after) {
		t.Fatal("corrupt identity was mutated")
	}
}
