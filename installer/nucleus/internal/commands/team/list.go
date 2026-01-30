package team

import (
	"encoding/json"
	"fmt"
	"nucleus/internal/core"
	"nucleus/internal/governance"
	"os"

	"github.com/spf13/cobra"
)

func init() {
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
}
