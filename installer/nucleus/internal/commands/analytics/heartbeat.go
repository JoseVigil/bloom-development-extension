package analytics

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
		var workers int
		var volume int

		cmd := &cobra.Command{
			Use:   "heartbeat",
			Short: "Send heartbeat to central server",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				record, err := governance.LoadOwnership()
				if err != nil || record == nil {
					fmt.Println("Error: organization not initialized")
					os.Exit(1)
				}

				client := analytics.NewClient(record.OrgID, "demo-key")

				versionInfo := core.GetVersionInfo()

				hb := &analytics.Heartbeat{
					Version:       versionInfo.Version,
					ActiveWorkers: workers,
					IntentVolume:  volume,
					SystemHealth:  "ok",
				}

				err = client.SendHeartbeat(hb)
				if err != nil {
					fmt.Printf("Error: %v\n", err)
					os.Exit(1)
				}

				if c.IsJSON {
					fmt.Println("{\"status\":\"sent\"}")
				} else {
					fmt.Println("💓 Heartbeat sent")
				}
			},
		}

		cmd.Flags().IntVar(&workers, "workers", 0, "Active workers count")
		cmd.Flags().IntVar(&volume, "volume", 0, "Intent volume")

		return cmd
	})
}
