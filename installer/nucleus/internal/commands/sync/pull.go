package sync

import (
	"encoding/json"
	"fmt"
	"nucleus/internal/analytics"
	"nucleus/internal/core"
	"nucleus/internal/governance"
	"os"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("GOVERNANCE", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "sync-pull",
			Short: "Pull permissions from central server",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				record, err := governance.LoadOwnership()
				if err != nil || record == nil {
					fmt.Println("Error: organization not initialized")
					os.Exit(1)
				}

				client := analytics.NewClient(record.OrgID, "demo-key")

				permissions, err := client.PullPermissions()
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					data, _ := json.MarshalIndent(permissions, "", "  ")
					fmt.Println(string(data))
				} else {
					fmt.Println("✅ Permissions pulled from central server")
					for k, v := range permissions {
						fmt.Printf("  %s: %v\n", k, v)
					}
				}
			},
		}

		return cmd
	})
}
