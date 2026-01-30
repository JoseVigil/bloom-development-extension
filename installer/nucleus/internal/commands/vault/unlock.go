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
			Use:   "vault-unlock",
			Short: "Unlock vault",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				if core.GetUserRole() != core.RoleMaster {
					fmt.Println("Error: requires master role")
					os.Exit(1)
				}

				err := vault.UnlockVault()
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
}
