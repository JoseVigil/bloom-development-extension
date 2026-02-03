package vault

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"nucleus/internal/core"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/cobra"
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

// IsVaultUnlocked verifica si el vault está desbloqueado
func IsVaultUnlocked() (bool, error) {
	status, err := GetVaultStatus()
	if err != nil {
		return false, err
	}
	return !status.Locked, nil
}

// ============================================
// CLI COMMANDS (Auto-registration via init())
// ============================================

func init() {
	// Command: vault-lock
	core.RegisterCommand("VAULT", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "vault-lock",
			Short: "Lock vault",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				if core.GetUserRole() != core.RoleMaster {
					fmt.Println("Error: requires master role")
					os.Exit(1)
				}

				err := LockVault()
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					fmt.Println("{\"status\":\"locked\"}")
				} else {
					fmt.Println("🔒 Vault locked")
				}
			},
		}

		return cmd
	})

	// Command: vault-unlock
	core.RegisterCommand("VAULT", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "vault-unlock",
			Short: "Unlock vault",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				if core.GetUserRole() != core.RoleMaster {
					fmt.Println("Error: requires master role")
					os.Exit(1)
				}

				err := UnlockVault()
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					fmt.Println("{\"status\":\"unlocked\"}")
				} else {
					fmt.Println("🔓 Vault unlocked")
				}
			},
		}

		return cmd
	})

	// Command: vault-status
	core.RegisterCommand("VAULT", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "vault-status",
			Short: "Display vault status",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				status, err := GetVaultStatus()
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					data, _ := json.MarshalIndent(status, "", "  ")
					fmt.Println(string(data))
				} else {
					lockStatus := "🔒 LOCKED"
					if !status.Locked {
						lockStatus = "🔓 UNLOCKED"
					}

					fmt.Printf("Vault Status: %s\n", lockStatus)
					fmt.Printf("Keys: %d\n", status.KeyCount)
					if !status.LastAccess.IsZero() {
						fmt.Printf("Last Access: %s\n", status.LastAccess.Format("2006-01-02 15:04:05"))
					}
					if status.MasterKeyID != "" {
						fmt.Printf("Master Key: %s\n", status.MasterKeyID)
					}
				}
			},
		}

		return cmd
	})

	// Command: vault-request
	core.RegisterCommand("VAULT", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "vault-request <key-id>",
			Short: "Request key from vault",
			Args:  cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				if core.GetUserRole() != core.RoleMaster {
					fmt.Println("Error: vault access denied - requires master role")
					os.Exit(1)
				}

				unlocked, err := IsVaultUnlocked()
				if err != nil {
					fmt.Printf("Error checking vault status: %v\n", err)
					os.Exit(1)
				}

				if !unlocked {
					fmt.Println("Error: vault is locked")
					os.Exit(1)
				}

				keyID := args[0]
				key, err := RequestKey(keyID)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					fmt.Printf("{\"key_id\":\"%s\",\"key\":\"%s\"}\n", keyID, key)
				} else {
					fmt.Printf("Key: %s\n", key)
				}
			},
		}

		return cmd
	})
}