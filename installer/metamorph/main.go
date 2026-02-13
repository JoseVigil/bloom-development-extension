package main

import (
	"fmt"
	"os"

	"github.com/bloom/metamorph/internal/cli"
)

func main() {
	// Parsear flags globales
	jsonMode := false
	verbose := false
	showHelp := false

	args := os.Args[1:]
	filteredArgs := []string{}

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--json":
			jsonMode = true
		case "--verbose":
			verbose = true
		case "--help", "-h":
			showHelp = true
		default:
			filteredArgs = append(filteredArgs, args[i])
		}
	}

	// Si no hay comando y se pide help, mostrar help general
	if len(filteredArgs) == 0 && showHelp {
		cli.ShowHelp()
		os.Exit(0)
	}

	// Si no hay comando, mostrar help
	if len(filteredArgs) == 0 {
		cli.ShowHelp()
		os.Exit(1)
	}

	command := filteredArgs[0]
	commandArgs := filteredArgs[1:]

	// Ejecutar comando
	if err := cli.ExecuteCommand(command, commandArgs, jsonMode, verbose); err != nil {
		if !jsonMode {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		} else {
			fmt.Fprintf(os.Stdout, `{"success": false, "error": "%s"}`+"\n", err.Error())
		}
		os.Exit(1)
	}
}