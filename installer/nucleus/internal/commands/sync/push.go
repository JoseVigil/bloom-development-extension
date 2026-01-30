package sync

import (
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
			Use:   "sync-push",
			Short: "Push state to central server",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				if core.GetUserRole() != core.RoleMaster {
					fmt.Println("Error: requires master role")
					os.Exit(1)
				}

				record, err := governance.LoadOwnership()
				if err != nil || record == nil {
					fmt.Println("Error: organization not initialized")
					os.Exit(1)
				}

				client := analytics.NewClient(record.OrgID, "demo-key")

				state := map[string]interface{}{
					"org_id":       record.OrgID,
					"owner_id":     record.OwnerID,
					"team_count":   len(record.TeamMembers),
					"system_info":  core.GetSystemInfo(),
					"version_info": core.GetVersionInfo(),
				}

				err = client.PushState(state)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					fmt.Println("{\"status\":\"pushed\"}")
				} else {
					fmt.Println("✅ State pushed to central server")
				}
			},
		}

		return cmd
	})
}
