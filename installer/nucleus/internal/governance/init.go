package governance

import (
	"fmt"
	"nucleus/internal/core"
	"os"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("GOVERNANCE", func(c *core.Core) *cobra.Command {
		var masterFlag bool
		var githubID string
		var name string

		cmd := &cobra.Command{
			Use:   "init",
			Short: "Initialize Nucleus organization",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				existing, _ := LoadOwnership()
				if existing != nil {
					fmt.Println("Organization already initialized")
					os.Exit(1)
				}

				if githubID == "" {
					fmt.Println("Error: --github-id required")
					os.Exit(1)
				}

				if name == "" {
					name = githubID
				}

				// Crear ownership record
				record, err := CreateInitialOwnership(githubID, name)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				// Crear blueprint.json
				_, err = CreateInitialBlueprint(githubID, name)
				if err != nil {
					fmt.Printf("Error creating blueprint: %v\n", err)
					os.Exit(1)
				}

				if masterFlag {
					if err := core.SetMasterRole(); err != nil {
						fmt.Printf("Error setting role: %v\n", err)
						os.Exit(1)
					}
				}

				if c.IsJSON {
					fmt.Printf("{\"org_id\":\"%s\",\"owner_id\":\"%s\",\"status\":\"initialized\"}\n",
						record.OrgID, record.OwnerID)
				} else {
					fmt.Printf("✅ Organization initialized\n")
					fmt.Printf("Org ID: %s\n", record.OrgID)
					fmt.Printf("Owner: %s\n", record.OwnerName)
					fmt.Printf("Blueprint: created\n")
				}
			},
		}

		cmd.Flags().BoolVar(&masterFlag, "master", false, "Initialize as master")
		cmd.Flags().StringVar(&githubID, "github-id", "", "GitHub username")
		cmd.Flags().StringVar(&name, "name", "", "Display name")

		return cmd
	})
}