package vault

import (
	"path/filepath"
	"testing"
	"time"
)

func TestReplayNoncePersistsAcrossCalls(t *testing.T) {
	path := filepath.Join(t.TempDir(), "replay.json")
	now := time.Now().UTC()
	if err := ClaimNonce(path, "grant", "nonce", now); err != nil {
		t.Fatal(err)
	}
	if err := ClaimNonce(path, "grant", "nonce", now); err == nil {
		t.Fatal("replayed nonce accepted")
	}
	if err := ClaimNonce(path, "grant", "another", now); err != nil {
		t.Fatal(err)
	}
}
