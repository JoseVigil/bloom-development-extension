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
		var name string
		var role string

		cmd := &cobra.Command{
			Use:   "add <github-id>",
			Short: "Add team member",
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
				if name == "" {
					name = githubID
				}
				if role == "" {
					role = "specialist"
				}

				err = governance.AddTeamMember(record, githubID, name, role)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					fmt.Printf("{\"member_id\":\"%s\",\"role\":\"%s\",\"status\":\"added\"}\n", githubID, role)
				} else {
					fmt.Printf("✅ Member added: %s (%s)\n", name, role)
				}
			},
		}

		cmd.Flags().StringVar(&name, "name", "", "Display name")
		cmd.Flags().StringVar(&role, "role", "specialist", "Role")

		return cmd
	})
}
