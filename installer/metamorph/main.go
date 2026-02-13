package main

import (
	"os"

	"github.com/bloom/metamorph/internal/cli/commands"
)

func main() {
	if err := commands.Execute(); err != nil {
		os.Exit(1)
	}
}
