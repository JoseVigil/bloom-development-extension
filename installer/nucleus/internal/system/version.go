package system

import (
	"encoding/json"
	"fmt"
	"nucleus/internal/core"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("SYSTEM", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "version",
			Short: "Display version and build information",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				info := core.GetVersionInfo()

				if c.IsJSON {
					data, _ := json.MarshalIndent(info, "", "  ")
					fmt.Println(string(data))
				} else {
					fmt.Printf("nucleus release %s build %d\n",
						info.Version, info.BuildNumber)
				}
			},
		}
		return cmd
	})
}
