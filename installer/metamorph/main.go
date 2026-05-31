package main

import (
	"fmt"
	"os"

	"metamorph/internal/cli"
	"metamorph/internal/core"
	_ "metamorph/internal/inspection"
	_ "metamorph/internal/ionpump"
	_ "metamorph/internal/maintenance"
	_ "metamorph/internal/rollback"
	_ "metamorph/internal/system"
)

func main() {
	isHelp := false
	jsonMode := false
	for _, arg := range os.Args[1:] {
		switch arg {
		case "--help", "-h", "--json-help":
			isHelp = true
		case "--json":
			jsonMode = true
		}
	}

	var c *core.Core
	var err error
	if isHelp {
		c, err = core.NewCoreSilent()
	} else {
		c, err = core.NewCore(jsonMode)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error initializing metamorph: %v\n", err)
		os.Exit(1)
	}
	defer c.Close()

	if err := cli.Execute(c); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}