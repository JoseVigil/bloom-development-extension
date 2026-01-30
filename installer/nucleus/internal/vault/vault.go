package vault

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"
)

type VaultStatus struct {
	Locked      bool      `json:"locked"`
	KeyCount    int       `json:"key_count"`
	LastAccess  time.Time `json:"last_access"`
	MasterKeyID string    `json:"master_key_id"`
}

type VaultKey struct {
	ID          string    `json:"id"`
	Label       string    `json:"label"`
	CreatedAt   time.Time `json:"created_at"`
	AccessCount int       `json:"access_count"`
	Hash        string    `json:"hash"`
}

func GetVaultPath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	nucleusRoot := filepath.Join(homeDir, ".bloom", ".nucleus")
	return filepath.Join(nucleusRoot, "vault.json"), nil
}

func GetVaultStatus() (*VaultStatus, error) {
	path, err := GetVaultPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &VaultStatus{
				Locked:     true,
				KeyCount:   0,
				LastAccess: time.Time{},
			}, nil
		}
		return nil, err
	}

	var status VaultStatus
	if err := json.Unmarshal(data, &status); err != nil {
		return nil, err
	}

	return &status, nil
}

func LockVault() error {
	status, err := GetVaultStatus()
	if err != nil {
		return err
	}

	status.Locked = true
	return saveVaultStatus(status)
}

func UnlockVault() error {
	status, err := GetVaultStatus()
	if err != nil {
		return err
	}

	status.Locked = false
	status.LastAccess = time.Now()
	return saveVaultStatus(status)
}

func RequestKey(keyID string) (string, error) {
	status, err := GetVaultStatus()
	if err != nil {
		return "", err
	}

	if status.Locked {
		return "", errors.New("vault is locked")
	}

	hash := sha256.Sum256([]byte(keyID + time.Now().String()))
	return hex.EncodeToString(hash[:]), nil
}

func saveVaultStatus(status *VaultStatus) error {
	path, err := GetVaultPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(status, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}

func InitializeVault(masterKeyID string) error {
	status := &VaultStatus{
		Locked:      true,
		KeyCount:    0,
		LastAccess:  time.Now(),
		MasterKeyID: masterKeyID,
	}

	return saveVaultStatus(status)
}

func GetVaultKeys() ([]VaultKey, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	keysPath := filepath.Join(homeDir, ".bloom", ".nucleus", "vault_keys.json")
	data, err := os.ReadFile(keysPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []VaultKey{}, nil
		}
		return nil, err
	}

	var keys []VaultKey
	if err := json.Unmarshal(data, &keys); err != nil {
		return nil, err
	}

	return keys, nil
}

func AddVaultKey(id, label string) error {
	keys, err := GetVaultKeys()
	if err != nil {
		return err
	}

	hash := sha256.Sum256([]byte(id))
	key := VaultKey{
		ID:          id,
		Label:       label,
		CreatedAt:   time.Now(),
		AccessCount: 0,
		Hash:        hex.EncodeToString(hash[:]),
	}

	keys = append(keys, key)

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	keysPath := filepath.Join(homeDir, ".bloom", ".nucleus", "vault_keys.json")
	data, err := json.MarshalIndent(keys, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(keysPath, data, 0600)
}
