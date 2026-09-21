// Impact's CLI entry point. Evaluation logic and contracts live in internal.
package main

import (
	_ "impact/internal/assessment"
	"impact/internal/cli"
	"impact/internal/core"
	_ "impact/internal/system"
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
