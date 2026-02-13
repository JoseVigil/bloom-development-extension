package inspection

import (
	"fmt"

	"github.com/bloom/metamorph/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("INSPECTION", createInspectCommand)
}

func createInspectCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "inspect",
		Short: "Inspect all binaries and show detailed info",
		Long:  `Perform detailed inspection of all managed binaries and their metadata.`,
		Annotations: map[string]string{
			"category": "INSPECTION",
			"json_response": `{"binaries": [], "message": "Not yet implemented"}`,
		},
		Example: `  metamorph inspect
  metamorph --json inspect`,
		Run: func(cmd *cobra.Command, args []string) {
			if c.Config.OutputJSON {
				data := map[string]interface{}{
					"binaries": []string{},
					"message":  "Inspection not yet implemented",
				}
				c.OutputJSON(data)
			} else {
				fmt.Println("⚠️  Inspect command not yet implemented")
			}
		},
	}
}
