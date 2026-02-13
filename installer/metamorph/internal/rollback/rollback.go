package rollback

import (
	"fmt"

	"github.com/bloom/metamorph/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("ROLLBACK", createRollbackCommand)
}

func createRollbackCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "rollback",
		Short: "Rollback to previous snapshot",
		Long:  `Rollback the system to a previous snapshot state.`,
		Annotations: map[string]string{
			"category": "ROLLBACK",
			"json_response": `{"status": "success", "snapshot": "..."}`,
		},
		Example: `  metamorph rollback
  metamorph --json rollback`,
		Run: func(cmd *cobra.Command, args []string) {
			if c.Config.OutputJSON {
				data := map[string]interface{}{
					"status":  "not_implemented",
					"message": "Rollback not yet implemented",
				}
				c.OutputJSON(data)
			} else {
				fmt.Println("⚠️  Rollback command not yet implemented")
			}
		},
	}
}
