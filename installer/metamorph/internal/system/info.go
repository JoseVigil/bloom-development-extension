package system

import (
	"fmt"
	"os"
	"runtime"

	"github.com/bloom/metamorph/internal/core"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("SYSTEM", createInfoCommand)
}

type systemInfo struct {
	Name         string            `json:"name"`
	Version      string            `json:"version"`
	BuildNumber  int               `json:"build_number"`
	OS           string            `json:"os"`
	Arch         string            `json:"arch"`
	GoVersion    string            `json:"go_version"`
	Capabilities []string          `json:"capabilities"`
	Paths        map[string]string `json:"paths"`
}

func createInfoCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "info",
		Short: "Display detailed system information",

		Annotations: map[string]string{
			"category": "SYSTEM",
			"json_response": `{
  "name": "Metamorph",
  "version": "1.0.0",
  "build_number": 2,
  "os": "darwin",
  "arch": "arm64",
  "go_version": "go1.22.0",
  "capabilities": ["state_inspection", "manifest_reconciliation"],
  "paths": {
    "base":    "~/Library/Application Support/BloomNucleus",
    "bin":     "~/Library/Application Support/BloomNucleus/bin",
    "config":  "~/Library/Application Support/BloomNucleus/config",
    "staging": "~/Library/Application Support/BloomNucleus/staging"
  }
}`,
		},

		Example: `  metamorph info
  metamorph --json info`,

		Run: func(cmd *cobra.Command, args []string) {
			base := core.GetBaseAppDataPath()
			info := systemInfo{
				Name:        "Metamorph",
				Version:     core.Version,
				BuildNumber: core.BuildNumber,
				OS:          runtime.GOOS,
				Arch:        runtime.GOARCH,
				GoVersion:   runtime.Version(),
				Capabilities: []string{
					"state_inspection",
					"manifest_reconciliation",
				},
				Paths: map[string]string{
					"base":    base,
					"bin":     core.GetBinPath(),
					"config":  core.GetConfigPath(),
					"staging": core.GetStagingPath(),
				},
			}

			if c.Config.OutputJSON {
				c.OutputJSON(info)
				return
			}

			fmt.Fprintf(os.Stdout, "Name        : %s\n", info.Name)
			fmt.Fprintf(os.Stdout, "Version     : %s (build %d)\n", info.Version, info.BuildNumber)
			fmt.Fprintf(os.Stdout, "OS / Arch   : %s / %s\n", info.OS, info.Arch)
			fmt.Fprintf(os.Stdout, "Go version  : %s\n", info.GoVersion)
			fmt.Fprintf(os.Stdout, "\nPaths:\n")
			fmt.Fprintf(os.Stdout, "  Base      : %s\n", info.Paths["base"])
			fmt.Fprintf(os.Stdout, "  Bin       : %s\n", info.Paths["bin"])
			fmt.Fprintf(os.Stdout, "  Config    : %s\n", info.Paths["config"])
			fmt.Fprintf(os.Stdout, "  Staging   : %s\n", info.Paths["staging"])
		},
	}
}
