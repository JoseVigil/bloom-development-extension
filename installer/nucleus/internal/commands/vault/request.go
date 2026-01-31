package vault

import (
	"fmt"
	"nucleus/internal/core"
	"nucleus/internal/vault"
	"os"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("GOVERNANCE", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "vault-request <key-id>",
			Short: "Request key from vault",
			Args:  cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				if core.GetUserRole() != core.RoleMaster {
					fmt.Println("Error: vault access denied - requires master role")
					os.Exit(1)
				}

				// Verificar si vault está desbloqueado
				unlocked, err := vault.IsVaultUnlocked()
				if err != nil {
					fmt.Printf("Error checking vault status: %v\n", err)
					os.Exit(1)
				}

				if !unlocked {
					fmt.Println("Error: vault is locked")
					os.Exit(1)
				}

				keyID := args[0]
				key, err := vault.RequestKey(keyID)
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