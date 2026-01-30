package team

import (
	"fmt"
	"nucleus/internal/core"
	"nucleus/internal/governance"
	"os"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("IDENTITY", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "remove <github-id>",
			Short: "Remove team member",
			Args:  cobra.ExactArgs(1),
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

				githubID := args[0]
				found := false

				for i := range record.TeamMembers {
					if record.TeamMembers[i].ID == githubID {
						record.TeamMembers[i].Active = false
						found = true
						break
					}
				}

				if !found {
					fmt.Printf("Error: member not found: %s\n", githubID)
					os.Exit(1)
				}

				err = governance.SaveOwnership(record)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					fmt.Printf("{\"member_id\":\"%s\",\"status\":\"removed\"}\n", githubID)
				} else {
					fmt.Printf("✅ Member removed: %s\n", githubID)
				}
			},
		}

		return cmd
	})
}
