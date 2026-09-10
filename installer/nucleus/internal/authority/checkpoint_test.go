package authority

import (
	"crypto/ed25519"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCheckpointCommitsAndDetectsPartialExternalRestore(t *testing.T) {
	p, pub, priv := fullFixture(t, "1")
	dir := t.TempDir()
	v := &Verifier{Trust: TrustBundle{"issuer": {"key": pub}}, Binding: Binding{"org", "issuer", "installation"}, Store: &Store{Path: filepath.Join(dir, "state.json")}, Checkpoint: &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}, Now: func() time.Time { return time.Date(2026, 9, 4, 12, 1, 0, 0, time.UTC) }}
	raw := signedFixture(t, p, priv, "key")
	if _, err := v.VerifyAndAccept(raw, "accepted"); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(v.Store.Path)
	if _, err := os.Stat(v.Checkpoint.Path); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(v.Checkpoint.Path); err != nil {
		t.Fatal(err)
	}
	if _, err := v.VerifyAndAccept(raw, "partial"); !errors.Is(err, ErrRecoveryRequired) {
		t.Fatalf("partial restore not rejected: %v", err)
	}
	after, _ := os.ReadFile(v.Store.Path)
	if string(after) != string(before) {
		t.Fatal("rejected partial restore changed state")
	}
}

func TestCheckpointJournalRecoversEveryInterruptedStage(t *testing.T) {
	for _, stage := range []string{"after_journal", "after_state", "after_checkpoint"} {
		t.Run(stage, func(t *testing.T) {
			p, pub, priv := fullFixture(t, "1")
			dir := t.TempDir()
			v := &Verifier{Trust: TrustBundle{"issuer": {"key": pub}}, Binding: Binding{"org", "issuer", "installation"}, Store: &Store{Path: filepath.Join(dir, "state.json")}, Checkpoint: &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}, Now: func() time.Time { return time.Date(2026, 9, 4, 12, 1, 0, 0, time.UTC) }}
			raw := signedFixture(t, p, priv, "key")
			checkpointHook = func(s string) error {
				if s == stage {
					return errors.New("crash")
				}
				return nil
			}
			if _, err := v.VerifyAndAccept(raw, "crash"); err == nil {
				t.Fatal("expected crash")
			}
			checkpointHook = nil
			if _, err := v.VerifyAndAccept(raw, "retry"); err != nil {
				t.Fatal(err)
			}
			st, err := v.Store.Load()
			if err != nil || st.Monotonic.HighWaterMark != "1" {
				t.Fatalf("did not converge: %v %+v", err, st)
			}
			if _, err = os.Stat(v.Checkpoint.txnPath()); !os.IsNotExist(err) {
				t.Fatal("transaction journal retained")
			}
		})
	}
	checkpointHook = nil
}

func TestCheckpointRejectsContradictionAndManifestRollback(t *testing.T) {
	p, pub, priv := fullFixture(t, "1")
	dir := t.TempDir()
	v := &Verifier{Trust: TrustBundle{"issuer": {"key": pub}}, Binding: Binding{"org", "issuer", "installation"}, Store: &Store{Path: filepath.Join(dir, "state.json")}, Checkpoint: &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}, Now: func() time.Time { return time.Date(2026, 9, 4, 12, 1, 0, 0, time.UTC) }}
	raw := signedFixture(t, p, priv, "key")
	if _, err := v.VerifyAndAccept(raw, "accepted"); err != nil {
		t.Fatal(err)
	}
	cp, err := os.ReadFile(v.Checkpoint.Path)
	if err != nil {
		t.Fatal(err)
	}
	cp[len(cp)/2] ^= 1
	if err = os.WriteFile(v.Checkpoint.Path, cp, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = v.VerifyAndAccept(raw, "corrupt"); !errors.Is(err, ErrRecoveryRequired) {
		t.Fatalf("corrupt checkpoint accepted: %v", err)
	}
}

func TestCheckpointRejectsTrustManifestRollback(t *testing.T) {
	manifestPayload, rootPub, rootPriv, _, issuerPriv, now := trustFixture(t)
	manifestPayload.ManifestVersion = "2"
	manifestPayload.Issuer = "issuer"
	m2, err := ParseAndVerifyTrustManifest(signedTrustFixture(t, manifestPayload, rootPriv, "root"), map[string]ed25519.PublicKey{"root": rootPub}, Binding{"org", "issuer", "installation"}, now)
	if err != nil {
		t.Fatal(err)
	}
	p, _, _ := fullFixture(t, "1")
	p.IssuedAt, p.NotBefore, p.ExpiresAt = now.Add(-time.Minute), now.Add(-time.Minute), now.Add(time.Hour)
	dir := t.TempDir()
	v := &Verifier{Manifest: m2, Binding: Binding{"org", "issuer", "installation"}, Store: &Store{Path: filepath.Join(dir, "state.json")}, Checkpoint: &CheckpointStore{Path: filepath.Join(dir, "checkpoint.json")}, Now: func() time.Time { return now }}
	raw := signedFixture(t, p, issuerPriv, "issuer-key")
	if _, err = v.VerifyAndAccept(raw, "m2"); err != nil {
		t.Fatal(err)
	}
	manifestPayload.ManifestVersion = "1"
	m1, err := ParseAndVerifyTrustManifest(signedTrustFixture(t, manifestPayload, rootPriv, "root"), map[string]ed25519.PublicKey{"root": rootPub}, Binding{"org", "issuer", "installation"}, now)
	if err != nil {
		t.Fatal(err)
	}
	v.Manifest = m1
	if _, err = v.VerifyAndAccept(raw, "rollback"); err == nil {
		t.Fatal("trust manifest rollback accepted")
	}
}
