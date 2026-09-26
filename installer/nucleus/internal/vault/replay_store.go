package vault

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/gofrs/flock"
)

var errReplay = errors.New("VAULT_ACCESS_DENIED")

// ClaimNonce durably records an authenticated nonce before the key is read.
// A crash after the claim can deny a retry, but can never allow a replay.
func ClaimNonce(path, grantID, nonce string, now time.Time) error {
	if path == "" || grantID == "" || nonce == "" {
		return errReplay
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	lock := flock.New(path + ".lock")
	if err := lock.Lock(); err != nil {
		return err
	}
	defer lock.Unlock()
	values := map[string]int64{}
	if raw, err := os.ReadFile(path); err == nil {
		if json.Unmarshal(raw, &values) != nil {
			return errReplay
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	key := grantID + ":" + nonce
	if _, exists := values[key]; exists {
		return errReplay
	}
	for k, timestamp := range values {
		if now.Unix()-timestamp > 600 {
			delete(values, k)
		}
	}
	values[key] = now.Unix()
	raw, err := json.Marshal(values)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".vault-replay-*.tmp")
	if err != nil {
		return err
	}
	name := file.Name()
	defer os.Remove(name)
	if err = file.Chmod(0600); err == nil {
		_, err = file.Write(raw)
	}
	if err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(name, path)
}
