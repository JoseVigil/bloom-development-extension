package team

import (
	"encoding/json"
	"fmt"
	"nucleus/internal/core"
	"nucleus/internal/governance"
	"os"

	"github.com/spf13/cobra"
)

// ============================================
// CLI COMMANDS (Auto-registration via init())
// ============================================

func init() {
	// Command: add
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

	// Command: list
	core.RegisterCommand("IDENTITY", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "list",
			Short: "List team members",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				record, err := governance.LoadOwnership()
				if err != nil || record == nil {
					fmt.Println("Error: organization not initialized")
					os.Exit(1)
				}

				if c.IsJSON {
					data, _ := json.MarshalIndent(record.TeamMembers, "", "  ")
					fmt.Println(string(data))
				} else {
					fmt.Printf("Owner: %s (%s)\n\n", record.OwnerName, record.OwnerID)
					if len(record.TeamMembers) == 0 {
						fmt.Println("No team members")
					} else {
						fmt.Println("Team Members:")
						for _, m := range record.TeamMembers {
							status := "active"
							if !m.Active {
								status = "inactive"
							}
							fmt.Printf("  %s (%s) - %s [%s]\n", m.Name, m.ID, m.Role, status)
						}
					}
				}
			},
		}

		return cmd
	})

	// Command: remove
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