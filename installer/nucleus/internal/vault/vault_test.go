package vault

import (
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"nucleus/internal/core"
)

// ============================================
// TEST FIXTURES
// ============================================

// fakeKeyring is an in-memory stand-in for the OS keyring so tests never
// touch the real secret service (not available in headless CI).
type fakeKeyring struct {
	mu    sync.Mutex
	store map[string]string
	// calls records every method invocation, so tests can assert the
	// keyring was (or was NOT) touched.
	calls []string
}

func newFakeKeyring() *fakeKeyring {
	return &fakeKeyring{store: map[string]string{}}
}

func (f *fakeKeyring) Get(service, key string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, "get:"+service+":"+key)
	v, ok := f.store[service+"/"+key]
	if !ok {
		return "", errors.New("secret not found")
	}
	return v, nil
}

func (f *fakeKeyring) Set(service, key, value string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, "set:"+service+":"+key)
	f.store[service+"/"+key] = value
	return nil
}

func (f *fakeKeyring) Delete(service, key string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, "delete:"+service+":"+key)
	delete(f.store, service+"/"+key)
	return nil
}

// withFakeKeyring swaps the package-level osKeyring for a fresh fake for
// the duration of the test and restores the original afterwards.
func withFakeKeyring(t *testing.T) *fakeKeyring {
	t.Helper()
	original := osKeyring
	fk := newFakeKeyring()
	osKeyring = fk
	t.Cleanup(func() { osKeyring = original })
	return fk
}

// withTempHome points os.UserHomeDir() (via $HOME) at a fresh temp dir so
// GetVaultPath()/saveVaultStatus() never touch the real filesystem, and
// resets it after the test.
func withTempHome(t *testing.T) string {
	t.Helper()
	tmp := t.TempDir()
	original, hadOriginal := os.LookupEnv("HOME")
	if err := os.Setenv("HOME", tmp); err != nil {
		t.Fatalf("failed to set HOME: %v", err)
	}
	t.Cleanup(func() {
		if hadOriginal {
			os.Setenv("HOME", original)
		} else {
			os.Unsetenv("HOME")
		}
	})
	return tmp
}

// writeVaultStatus writes a vault.json directly, bypassing Lock/Unlock, so
// each test can start from a known, explicit state.
func writeVaultStatus(t *testing.T, locked bool) {
	t.Helper()
	path, err := GetVaultPath()
	if err != nil {
		t.Fatalf("GetVaultPath() error: %v", err)
	}
	// NOTE: saveVaultStatus() does not create its parent directory itself
	// (see BUG note in the accompanying report) — the real vault.json is
	// only ever written after InitializeVault(), which has the same gap.
	// Test setup works around it here; this is not something a test
	// helper should silently paper over in production code.
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		t.Fatalf("failed to create vault dir: %v", err)
	}
	if err := saveVaultStatus(&VaultStatus{Locked: locked}); err != nil {
		t.Fatalf("failed to seed vault status (locked=%v): %v", locked, err)
	}
}

// ============================================
// 1. HAPPY PATH: SetKey then RequestKey, RoleMaster + ScopeRepoPush
// ============================================

func TestSetKeyThenRequestKey_HappyPath(t *testing.T) {
	withTempHome(t)
	fk := withFakeKeyring(t)
	writeVaultStatus(t, false) // unlocked

	const keyID = "github-app-token:profile-123"
	const value = "ghs_supersecrettoken"

	err := SetKey(keyID, value, core.RoleMaster, ScopeRepoPush)
	if err != nil {
		t.Fatalf("SetKey() with RoleMaster/ScopeRepoPush on an unlocked vault should succeed, got error: %v", err)
	}

	got, err := RequestKey(keyID, core.RoleMaster, ScopeReadOnly)
	if err != nil {
		t.Fatalf("RequestKey() right after a successful SetKey() should succeed, got error: %v", err)
	}
	if got != value {
		t.Fatalf("RequestKey() returned %q, want the value just stored by SetKey(): %q", got, value)
	}

	// Sanity: the fake keyring was actually exercised (proves the gate
	// let the call through rather than the test passing vacuously).
	if len(fk.calls) < 2 {
		t.Fatalf("expected at least a set + a get call against the keyring backend, got calls=%v", fk.calls)
	}
}

// ============================================
// 2. UNAUTHORIZED ROLE: non-master role must be rejected, keyring untouched
// ============================================

func TestNonMasterRole_RejectedWithoutTouchingKeyring(t *testing.T) {
	withTempHome(t)
	writeVaultStatus(t, false) // unlocked, so we know rejection comes from Authorize(), not the lock check

	const keyID = "some-key"

	t.Run("RequestKey", func(t *testing.T) {
		fk := withFakeKeyring(t)
		_, err := RequestKey(keyID, core.RoleUser, ScopeReadOnly)
		if !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("RequestKey() with a non-master role: want ErrUnauthorized, got %v", err)
		}
		if len(fk.calls) != 0 {
			t.Fatalf("RequestKey() must not touch the keyring when unauthorized, but got calls=%v", fk.calls)
		}
	})

	t.Run("SetKey", func(t *testing.T) {
		fk := withFakeKeyring(t)
		err := SetKey(keyID, "value", core.RoleUser, ScopeWrite)
		if !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("SetKey() with a non-master role: want ErrUnauthorized, got %v", err)
		}
		if len(fk.calls) != 0 {
			t.Fatalf("SetKey() must not touch the keyring when unauthorized, but got calls=%v", fk.calls)
		}
	})

	t.Run("DeleteKey", func(t *testing.T) {
		fk := withFakeKeyring(t)
		err := DeleteKey(keyID, core.RoleUser, ScopeDelete)
		if !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("DeleteKey() with a non-master role: want ErrUnauthorized, got %v", err)
		}
		if len(fk.calls) != 0 {
			t.Fatalf("DeleteKey() must not touch the keyring when unauthorized, but got calls=%v", fk.calls)
		}
	})
}

// ============================================
// 3. INVALID SCOPE: unrecognized scope must be rejected, even for RoleMaster
// ============================================

func TestInvalidScope_RejectedEvenForMaster(t *testing.T) {
	withTempHome(t)
	writeVaultStatus(t, false) // unlocked

	const keyID = "some-key"
	const bogusScope = Scope("scope:does-not-exist")

	t.Run("RequestKey", func(t *testing.T) {
		fk := withFakeKeyring(t)
		_, err := RequestKey(keyID, core.RoleMaster, bogusScope)
		if !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("RequestKey() with an invalid scope: want ErrUnauthorized, got %v", err)
		}
		if len(fk.calls) != 0 {
			t.Fatalf("RequestKey() must not touch the keyring on an invalid scope, but got calls=%v", fk.calls)
		}
	})

	t.Run("SetKey", func(t *testing.T) {
		fk := withFakeKeyring(t)
		err := SetKey(keyID, "value", core.RoleMaster, bogusScope)
		if !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("SetKey() with an invalid scope: want ErrUnauthorized, got %v", err)
		}
		if len(fk.calls) != 0 {
			t.Fatalf("SetKey() must not touch the keyring on an invalid scope, but got calls=%v", fk.calls)
		}
	})
}

// ============================================
// 4. LOCKED VAULT: must fail before Authorize() is ever reached
// ============================================

func TestLockedVault_FailsBeforeAuthorize(t *testing.T) {
	withTempHome(t)
	writeVaultStatus(t, true) // locked

	const keyID = "some-key"

	t.Run("RequestKey", func(t *testing.T) {
		fk := withFakeKeyring(t)
		_, err := RequestKey(keyID, core.RoleMaster, ScopeReadOnly)
		if err == nil {
			t.Fatal("RequestKey() on a locked vault: want an error, got nil")
		}
		if errors.Is(err, ErrUnauthorized) {
			t.Fatalf("RequestKey() on a locked vault must fail with the lock error, not ErrUnauthorized (got %v) — this would mean Authorize() ran before the lock check", err)
		}
		if err.Error() != "vault is locked" {
			t.Fatalf("RequestKey() on a locked vault: want error %q, got %q", "vault is locked", err.Error())
		}
		if len(fk.calls) != 0 {
			t.Fatalf("RequestKey() must not touch the keyring when locked, but got calls=%v", fk.calls)
		}
	})

	t.Run("SetKey", func(t *testing.T) {
		fk := withFakeKeyring(t)
		err := SetKey(keyID, "value", core.RoleMaster, ScopeWrite)
		if err == nil {
			t.Fatal("SetKey() on a locked vault: want an error, got nil")
		}
		if errors.Is(err, ErrUnauthorized) {
			t.Fatalf("SetKey() on a locked vault must fail with the lock error, not ErrUnauthorized (got %v)", err)
		}
		if err.Error() != "vault is locked" {
			t.Fatalf("SetKey() on a locked vault: want error %q, got %q", "vault is locked", err.Error())
		}
		if len(fk.calls) != 0 {
			t.Fatalf("SetKey() must not touch the keyring when locked, but got calls=%v", fk.calls)
		}
	})

	t.Run("DeleteKey", func(t *testing.T) {
		fk := withFakeKeyring(t)
		err := DeleteKey(keyID, core.RoleMaster, ScopeDelete)
		if err == nil {
			t.Fatal("DeleteKey() on a locked vault: want an error, got nil")
		}
		if errors.Is(err, ErrUnauthorized) {
			t.Fatalf("DeleteKey() on a locked vault must fail with the lock error, not ErrUnauthorized (got %v)", err)
		}
		if err.Error() != "vault is locked" {
			t.Fatalf("DeleteKey() on a locked vault: want error %q, got %q", "vault is locked", err.Error())
		}
		if len(fk.calls) != 0 {
			t.Fatalf("DeleteKey() must not touch the keyring when locked, but got calls=%v", fk.calls)
		}
	})
}

// ============================================
// Extra: GetVaultPath sanity, so a HOME misconfiguration fails loudly
// instead of silently reading/writing the real filesystem.
// ============================================

func TestGetVaultPath_UsesTempHome(t *testing.T) {
	tmp := withTempHome(t)
	path, err := GetVaultPath()
	if err != nil {
		t.Fatalf("GetVaultPath() error: %v", err)
	}
	want := filepath.Join(tmp, ".bloom", ".nucleus", "vault.json")
	if path != want {
		t.Fatalf("GetVaultPath() = %q, want %q", path, want)
	}
}
