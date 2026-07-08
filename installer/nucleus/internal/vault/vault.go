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
	"github.com/zalando/go-keyring"
)

type VaultStatus struct {
	Locked       bool      `json:"locked"`
	KeyCount     int       `json:"key_count"`
	LastAccess   time.Time `json:"last_access"`
	MasterKeyID  string    `json:"master_key_id"`
}

type VaultKey struct {
	ID          string    `json:"id"`
	Label       string    `json:"label"`
	CreatedAt   time.Time `json:"created_at"`
	AccessCount int       `json:"access_count"`
	Hash        string    `json:"hash"`
}

// ============================================
// AUTHORIZATION GATE (v1.1)
// ============================================

type Role = core.Role

type Scope string

const (
	ScopeReadOnly   Scope = "read"
	ScopeWrite      Scope = "write"
	ScopeDelete     Scope = "delete"
	ScopeRepoPush   Scope = "repo:push"
	ScopeRepoCreate Scope = "repo:create"
)

var ErrUnauthorized = errors.New("vault: unauthorized")

func Authorize(role Role, scope Scope, keyID string) bool {
	if role != core.RoleMaster {
		return false
	}

	switch scope {
	case ScopeReadOnly, ScopeWrite, ScopeDelete, ScopeRepoPush, ScopeRepoCreate:
		return true
	default:
		return false
	}
}

// ============================================
// OS KEYRING WRAPPER
// ============================================

const vaultServiceNameConst = "bloom-brain"

func vaultServiceName() string { return vaultServiceNameConst }

type osKeyringT struct{}

var osKeyring = osKeyringT{}

func (osKeyringT) Get(service, key string) (string, error) {
	return keyring.Get(service, key)
}

func (osKeyringT) Set(service, key, value string) error {
	return keyring.Set(service, key, value)
}

func (osKeyringT) Delete(service, key string) error {
	return keyring.Delete(service, key)
}

// ============================================
// CORE VAULT LOGIC
// ============================================

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

func RequestKey(keyID string, requesterRole Role, scope Scope) (string, error) {
	status, err := GetVaultStatus()
	if err != nil {
		return "", err
	}

	if status.Locked {
		return "", errors.New("vault is locked")
	}

	if !Authorize(requesterRole, scope, keyID) {
		return "", ErrUnauthorized
	}

	return osKeyring.Get(vaultServiceName(), keyID)
}

// SetKey escribe/rota un secreto en el Keyring real. Mismo gate que
// RequestKey: nada toca osKeyring.Set si Authorize() no lo aprueba primero.
func SetKey(keyID string, value string, requesterRole Role, scope Scope) error {
	status, err := GetVaultStatus()
	if err != nil {
		return err
	}

	if status.Locked {
		return errors.New("vault is locked")
	}

	if !Authorize(requesterRole, scope, keyID) {
		return ErrUnauthorized
	}

	return osKeyring.Set(vaultServiceName(), keyID, value)
}

// DeleteKey borra un secreto del Keyring real. Mismo gate que RequestKey/SetKey.
func DeleteKey(keyID string, requesterRole Role, scope Scope) error {
	status, err := GetVaultStatus()
	if err != nil {
		return err
	}

	if status.Locked {
		return errors.New("vault is locked")
	}

	if !Authorize(requesterRole, scope, keyID) {
		return ErrUnauthorized
	}

	return osKeyring.Delete(vaultServiceName(), keyID)
}

func saveVaultStatus(status *VaultStatus) error {
	path, err := GetVaultPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(status, "", " ")
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
	data, err := json.MarshalIndent(keys, "", " ")
	if err != nil {
		return err
	}

	return os.WriteFile(keysPath, data, 0600)
}

func IsVaultUnlocked() (bool, error) {
	status, err := GetVaultStatus()
	if err != nil {
		return false, err
	}
	return !status.Locked, nil
}

// ============================================
// CLI COMMAND
// ============================================

func init() {
	core.RegisterCommand("VAULT", createVaultCommand)
}

func createVaultCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "vault",
		Short: "Secure key and credential vault",
		Long:  "Lock, unlock, inspect, and request keys from the Nucleus vault.",
		Annotations: map[string]string{
			"category": "VAULT",
		},
	}

	cmd.AddCommand(createVaultLockCommand(c))
	cmd.AddCommand(createVaultUnlockCommand(c))
	cmd.AddCommand(createVaultStatusCommand(c))
	cmd.AddCommand(createVaultRequestCommand(c))
	cmd.AddCommand(createVaultSetCommand(c))
	cmd.AddCommand(createVaultDeleteCommand(c))

	return cmd
}

func createVaultLockCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "lock",
		Short: "Lock vault",
		Args:  cobra.NoArgs,
		Annotations: map[string]string{
			"category":      "VAULT",
			"json_response": `{"status":"locked"}`,
		},
		Example: `nucleus vault lock
nucleus --json vault lock`,
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
				fmt.Println(`{"status":"locked"}`)
			} else {
				fmt.Println("🔒 Vault locked")
			}
		},
	}
}

func createVaultUnlockCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "unlock",
		Short: "Unlock vault",
		Args:  cobra.NoArgs,
		Annotations: map[string]string{
			"category":      "VAULT",
			"json_response": `{"status":"unlocked"}`,
		},
		Example: `nucleus vault unlock
nucleus --json vault unlock`,
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
				fmt.Println(`{"status":"unlocked"}`)
			} else {
				fmt.Println("🔓 Vault unlocked")
			}
		},
	}
}

func createVaultStatusCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Display vault status",
		Args:  cobra.NoArgs,
		Annotations: map[string]string{
			"category": "VAULT",
			"json_response": `{
  "locked": true,
  "key_count": 0,
  "last_access": "2026-07-08T00:00:00Z",
  "master_key_id": ""
}`,
		},
		Example: `nucleus vault status
nucleus --json vault status`,
		Run: func(cmd *cobra.Command, args []string) {
			status, err := GetVaultStatus()
			if err != nil {
				fmt.Printf("Error: %v\n", err)
				os.Exit(1)
			}

			if c.IsJSON {
				data, _ := json.MarshalIndent(status, "", " ")
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
}

func createVaultRequestCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "request <key-id>",
		Short: "Request key from vault",
		Args:  cobra.ExactArgs(1),
		Annotations: map[string]string{
			"category":      "VAULT",
			"json_response": `{"key_id":"example-key","key":"<secret-value>"}`,
		},
		Example: `nucleus vault request gemini-key:Personal
nucleus --json vault request gemini-key:Personal`,
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
			key, err := RequestKey(keyID, core.GetUserRole(), ScopeReadOnly)
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
}

func createVaultSetCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "set <key-id> <value>",
		Short: "Store or rotate a key in the vault",
		Args:  cobra.ExactArgs(2),
		Annotations: map[string]string{
			"category":      "VAULT",
			"json_response": `{"status":"stored","key_id":"example-key"}`,
		},
		Example: `nucleus vault set gemini-key:Personal AIza...
nucleus --json vault set gemini-key:Personal AIza...`,
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

			keyID, value := args[0], args[1]
			if err := SetKey(keyID, value, core.GetUserRole(), ScopeWrite); err != nil {
				fmt.Printf("Error: %v\n", err)
				os.Exit(1)
			}

			if c.IsJSON {
				fmt.Printf("{\"status\":\"stored\",\"key_id\":\"%s\"}\n", keyID)
			} else {
				fmt.Printf("🔑 Key stored: %s\n", keyID)
			}
		},
	}
}

func createVaultDeleteCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "delete <key-id>",
		Short: "Delete a key from the vault",
		Args:  cobra.ExactArgs(1),
		Annotations: map[string]string{
			"category":      "VAULT",
			"json_response": `{"status":"deleted","key_id":"example-key"}`,
		},
		Example: `nucleus vault delete gemini-key:Personal
nucleus --json vault delete gemini-key:Personal`,
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
			if err := DeleteKey(keyID, core.GetUserRole(), ScopeDelete); err != nil {
				fmt.Printf("Error: %v\n", err)
				os.Exit(1)
			}

			if c.IsJSON {
				fmt.Printf("{\"status\":\"deleted\",\"key_id\":\"%s\"}\n", keyID)
			} else {
				fmt.Printf("🗑️  Key deleted: %s\n", keyID)
			}
		},
	}
}