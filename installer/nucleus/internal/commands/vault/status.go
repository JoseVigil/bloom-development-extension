package vault

import (
	"encoding/json"
	"fmt"
	"nucleus/internal/core"
	"nucleus/internal/vault"
	"os"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("GOVERNANCE", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "vault-status",
			Short: "Display vault status",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				status, err := vault.GetVaultStatus()
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
}
