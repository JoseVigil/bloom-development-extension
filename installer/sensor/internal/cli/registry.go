// internal/cli/registry.go

package cli

import (
	"encoding/json"
	"os"

	"bloom-sensor/internal/core"
	"github.com/spf13/cobra"
)

// CommandFactory es una función que recibe el Core y retorna un comando Cobra.
type CommandFactory func(c *core.Core) *cobra.Command

// registry almacena todas las factories registradas por los paquetes via init().
var registry []CommandFactory

// Register agrega una factory al registry global.
// Debe ser llamado desde init() en cada paquete que define un comando.
func Register(f CommandFactory) {
	registry = append(registry, f)
}

// Commands retorna todas las factories registradas.
func Commands() []CommandFactory {
	return registry
}

// PrintJSON es el helper compartido para output JSON.
// Exportado para que los paquetes de origen puedan usarlo.
func PrintJSON(v interface{}) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}