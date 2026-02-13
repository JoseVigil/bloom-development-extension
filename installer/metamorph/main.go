package main

import (
	"fmt"
	"os"

	"github.com/bloom/metamorph/internal/cli"
	"github.com/bloom/metamorph/internal/core"

	// Importar comandos (auto-registro via init())
	_ "github.com/bloom/metamorph/internal/inspection"
	_ "github.com/bloom/metamorph/internal/maintenance"
	_ "github.com/bloom/metamorph/internal/reconciliation"
	_ "github.com/bloom/metamorph/internal/rollback"
	_ "github.com/bloom/metamorph/internal/system"
)

func main() {
	// Detectar si se está solicitando ayuda
	isHelp := false
	for _, arg := range os.Args[1:] {
		if arg == "--help" || arg == "-h" || arg == "--json-help" {
			isHelp = true
			break
		}
	}

	// Inicializar Core (silencioso si es help)
	var c *core.Core
	var err error

	if isHelp {
		c, err = core.NewCoreSilent()
	} else {
		c, err = core.NewCore(os.Stdout)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "Error initializing metamorph: %v\n", err)
		os.Exit(1)
	}
	defer c.Close()

	// Ejecutar CLI
	if err := cli.Execute(c); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
