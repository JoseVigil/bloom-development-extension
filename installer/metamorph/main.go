package main

import (
	"fmt"
	"os"
	"github.com/bloom/metamorph/internal/cli"
	"github.com/bloom/metamorph/internal/core"
	_ "github.com/bloom/metamorph/internal/inspection"
	_ "github.com/bloom/metamorph/internal/maintenance"
	_ "github.com/bloom/metamorph/internal/reconciliation"
	_ "github.com/bloom/metamorph/internal/rollback"
	_ "github.com/bloom/metamorph/internal/system"
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