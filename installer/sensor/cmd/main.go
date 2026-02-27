// cmd/main.go

package main

import (
	"os"

	"bloom-sensor/internal/cli"
	"bloom-sensor/internal/core"
)

func main() {
	cfg := &core.Config{
		Channel: "stable",
	}

	c := core.NewCore(cfg)
	defer c.Shutdown()

	root := cli.BuildRootCommand(c)

	if err := root.Execute(); err != nil {
		c.Logger.Error("fatal: %v", err)
		os.Exit(1)
	}
}
