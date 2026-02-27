// internal/cmdregistry/cmdregistry.go

package cmdregistry

import (
	"encoding/json"
	"os"

	"github.com/spf13/cobra"
)

// CommandFactory retorna un comando Cobra ya configurado.
type CommandFactory func() *cobra.Command

var registry []CommandFactory

// Register agrega una factory al registry global.
func Register(f CommandFactory) {
	registry = append(registry, f)
}

// Commands retorna todas las factories registradas.
func Commands() []CommandFactory {
	return registry
}

// PrintJSON es el helper compartido para output JSON.
func PrintJSON(v interface{}) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}