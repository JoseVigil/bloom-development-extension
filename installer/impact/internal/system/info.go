package system

import (
	"encoding/json"
	"fmt"
	"runtime"

	"impact/internal/core"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("SYSTEM", createInfoCommand)
}

type systemInfo struct {
	Name        string `json:"name"`
	Version     string `json:"version"`
	BuildNumber int    `json:"build_number"`
	OS          string `json:"os"`
	Arch        string `json:"arch"`
	GoVersion   string `json:"go_version"`
}

func createInfoCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "info",
		Short: "Display detailed system information",
		Args:  cobra.NoArgs,
		Annotations: map[string]string{
			"category": "SYSTEM",
			"json_response": `{
  "name": "Impact",
  "version": "1.0.0",
  "build_number": 2,
  "os": "linux",
  "arch": "amd64",
  "go_version": "go1.24.0"
}`,
		},
		Example: `  impact info
  impact --json info`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := c.Logger.Success("info reported"); err != nil {
				return err
			}
			info := systemInfo{
				Name:        core.AppName,
				Version:     core.Version,
				BuildNumber: core.BuildNumber(),
				OS:          runtime.GOOS,
				Arch:        runtime.GOARCH,
				GoVersion:   runtime.Version(),
			}
			if c.JSON {
				return json.NewEncoder(c.Out).Encode(info)
			}
			fmt.Fprintf(c.Out, "Name        : %s\n", info.Name)
			fmt.Fprintf(c.Out, "Version     : %s (build %d)\n", info.Version, info.BuildNumber)
			fmt.Fprintf(c.Out, "OS / Arch   : %s / %s\n", info.OS, info.Arch)
			fmt.Fprintf(c.Out, "Go version  : %s\n", info.GoVersion)
			return nil
		},
	}
}
