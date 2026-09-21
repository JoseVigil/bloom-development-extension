// Monitor's CLI entry point. Runtime observation logic lives in internal.
package main

import (
	"monitor/internal/cli"
	"monitor/internal/core"
	_ "monitor/internal/status"
	_ "monitor/internal/system"
	"os"
)

func main() {
	err := cli.Execute(os.Args[1:], os.Stdout, os.Stderr, func(jsonMode bool) (*core.Logger, error) {
		p, err := core.ResolvePaths()
		if err != nil {
			return nil, err
		}
		console := os.Stdout
		if jsonMode {
			console = os.Stderr
		}
		return core.NewLogger(core.LoggerOptions{LogsDir: p.LogsDir, Console: console, Errors: os.Stderr, Registrar: core.NucleusRegistrar{Paths: p}})
	})
	if err != nil {
		os.Exit(1)
	}
}
