package authority

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/gofrs/flock"
)

type LocalIdentity struct {
	InstallationID string
	PublicKey      ed25519.PublicKey
	PrivateKey     ed25519.PrivateKey
}

type localIdentityWire struct {
	InstallationID string `json:"installation_id"`
	PublicKey      string `json:"public_key"`
	PrivateKey     string `json:"private_key"`
}

func LoadOrCreateLocalIdentity(path string) (*LocalIdentity, error) {
	raw, err := os.ReadFile(path)
	if err == nil {
		return parseLocalIdentity(raw)
	}
	if !os.IsNotExist(err) {
		return nil, err
	}
	if err = os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, err
	}
	lock := flock.New(path + ".lock")
	if err = lock.Lock(); err != nil {
		return nil, err
	}
	defer func() { _ = lock.Unlock() }()
	if existing, readErr := os.ReadFile(path); readErr == nil {
		return parseLocalIdentity(existing)
	} else if !os.IsNotExist(readErr) {
		return nil, readErr
	}
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	id, err := randomUUID()
	if err != nil {
		return nil, err
	}
	wire := localIdentityWire{id, base64.StdEncoding.EncodeToString(publicKey), base64.StdEncoding.EncodeToString(privateKey)}
	raw, err = json.Marshal(wire)
	if err != nil {
		return nil, err
	}
	if err = atomicFile(path, append(raw, '\n')); err != nil {
		return nil, err
	}
	if err = os.Chmod(path, 0600); err != nil {
		return nil, err
	}
	return parseLocalIdentity(raw)
}

func parseLocalIdentity(raw []byte) (*LocalIdentity, error) {
	if err := rejectDuplicateKeys(raw); err != nil {
		return nil, err
	}
	var wire localIdentityWire
	if err := decodeStrict(raw, &wire); err != nil {
		return nil, err
	}
	publicKey, err := decodeStandardBase64(wire.PublicKey, ed25519.PublicKeySize)
	if err != nil {
		return nil, fmt.Errorf("invalid identity public key: %w", err)
	}
	privateKey, err := decodeStandardBase64(wire.PrivateKey, ed25519.PrivateKeySize)
	if err != nil {
		return nil, fmt.Errorf("invalid identity private key: %w", err)
	}
	if !validUUID(wire.InstallationID) || !bytes.Equal(privateKey[32:], publicKey) {
		return nil, errors.New("invalid local installation identity")
	}
	return &LocalIdentity{wire.InstallationID, ed25519.PublicKey(publicKey), ed25519.PrivateKey(privateKey)}, nil
}

func decodeStandardBase64(value string, size int) ([]byte, error) {
	raw, err := base64.StdEncoding.Strict().DecodeString(value)
	if err != nil || len(raw) != size || base64.StdEncoding.EncodeToString(raw) != value {
		return nil, errors.New("non-canonical standard base64")
	}
	return raw, nil
}

func randomUUID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	raw[6] = (raw[6] & 0x0f) | 0x40
	raw[8] = (raw[8] & 0x3f) | 0x80
	hexValue := hex.EncodeToString(raw)
	return hexValue[0:8] + "-" + hexValue[8:12] + "-" + hexValue[12:16] + "-" + hexValue[16:20] + "-" + hexValue[20:32], nil
}

func validUUID(value string) bool {
	if len(value) != 36 || value[8] != '-' || value[13] != '-' || value[18] != '-' || value[23] != '-' {
		return false
	}
	compact := value[0:8] + value[9:13] + value[14:18] + value[19:23] + value[24:36]
	_, err := hex.DecodeString(compact)
	return err == nil
}
