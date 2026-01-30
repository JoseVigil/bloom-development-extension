package system

import (
	"encoding/json"
	"fmt"
	"nucleus/internal/core"
	"sort"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("SYSTEM", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:   "info",
			Short: "Display detailed system information",
			Args:  cobra.NoArgs,
			Run: func(cmd *cobra.Command, args []string) {
				info := core.GetSystemInfo()

				if c.IsJSON {
					data, _ := json.MarshalIndent(info, "", "  ")
					fmt.Println(string(data))
				} else {
					printSystemInfoText(info)
				}
			},
		}
		return cmd
	})
}

func printSystemInfoText(info core.SystemInfo) {
	// Ordenar alfabéticamente
	fields := map[string]string{
		"app_name":        info.AppName,
		"app_release":     info.AppRelease,
		"build_counter":   fmt.Sprintf("%d", info.BuildCounter),
		"compile_date":    info.CompileDate,
		"compile_time":    info.CompileTime,
		"current_time":    info.CurrentTime,
		"platform_arch":   info.PlatformArch,
		"platform_os":     info.PlatformOS,
		"runtime_engine":  info.RuntimeEngine,
		"runtime_release": info.RuntimeRelease,
		"user_role":       info.UserRole,
	}

	var keys []string
	for k := range fields {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	for _, k := range keys {
		fmt.Printf("%s: %s\n", k, fields[k])
	}
}
