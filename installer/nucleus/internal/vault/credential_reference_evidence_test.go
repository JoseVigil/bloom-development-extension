package vault

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestObserveCredentialReferenceIsSanitized(t *testing.T) {
	original := osKeyring
	fake := &fakeKeyring{store: map[string]string{}}
	osKeyring = fake
	t.Cleanup(func() { osKeyring = original })

	now := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	path := filepath.Join(t.TempDir(), "vault.json")
	if err := saveVaultStatusAt(path, &VaultStatus{Locked: false}); err != nil {
		t.Fatal(err)
	}
	const keyID = "gemini-key:default"
	const credentialRef = "credential-ref://gemini/default"
	const secret = "fixture-secret-never-output"
	fake.store[vaultServiceName()+"/"+keyID] = secret

	evidence, err := ObserveCredentialReference(path, credentialRef, now, now.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if !evidence.Usable || evidence.Code != "" || evidence.CredentialRef != credentialRef || !evidence.ObservedAt.Equal(now) || !evidence.ValidUntil.Equal(now.Add(30*time.Second)) || !strings.HasPrefix(evidence.Fingerprint, "sha256:") {
		t.Fatalf("unexpected evidence: %+v", evidence)
	}
	raw, err := json.Marshal(evidence)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), keyID) || strings.Contains(string(raw), secret) || strings.Contains(string(raw), "code") || strings.Contains(string(raw), "observed_at") {
		t.Fatalf("credential material leaked in evidence: %s", raw)
	}
	var fields map[string]any
	if json.Unmarshal(raw, &fields) != nil || len(fields) != 4 || fields["credential_ref"] != credentialRef || fields["usable"] != true {
		t.Fatalf("AITAP credential evidence shape mismatch: %s", raw)
	}
}

func TestObserveCredentialReferenceFailsClosed(t *testing.T) {
	original := osKeyring
	fake := &fakeKeyring{store: map[string]string{}}
	osKeyring = fake
	t.Cleanup(func() { osKeyring = original })

	now := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	dir := t.TempDir()
	locked := filepath.Join(dir, "locked.json")
	if err := saveVaultStatusAt(locked, &VaultStatus{Locked: true}); err != nil {
		t.Fatal(err)
	}
	got, err := ObserveCredentialReference(locked, "credential-ref://gemini/default", now, now.Add(time.Minute))
	if err != nil || got.Usable || got.Code != "VAULT_LOCKED" || got.Fingerprint == "" {
		t.Fatalf("locked Vault was not rejected: %+v", got)
	}

	unlocked := filepath.Join(dir, "unlocked.json")
	if err := saveVaultStatusAt(unlocked, &VaultStatus{Locked: false}); err != nil {
		t.Fatal(err)
	}
	got, err = ObserveCredentialReference(unlocked, "credential-ref://gemini/default", now, now.Add(time.Minute))
	if err != nil || got.Usable || got.Code != "CREDENTIAL_NOT_FOUND" || got.Fingerprint == "" {
		t.Fatalf("missing credential was not rejected: %+v", got)
	}
	if _, err = ObserveCredentialReference(unlocked, "credential-ref://unknown/default", now, now.Add(time.Minute)); err == nil {
		t.Fatal("unknown reference binding was accepted")
	}
	if _, err = ObserveCredentialReference(unlocked, "credential-ref://gemini/default", now, now); err == nil {
		t.Fatal("expired evidence ceiling was accepted")
	}
}
