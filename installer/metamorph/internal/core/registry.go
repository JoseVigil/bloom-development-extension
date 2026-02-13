package core

import (
	"github.com/spf13/cobra"
)

// CommandFactory crea un comando usando Core
type CommandFactory func(*Core) *cobra.Command

// registry global de comandos por categoría
var commandRegistry = make(map[string][]CommandFactory)

// RegisterCommand registra un comando en una categoría
func RegisterCommand(category string, factory CommandFactory) {
	commandRegistry[category] = append(commandRegistry[category], factory)
}

// BuildCommands construye todos los comandos registrados
func BuildCommands(c *Core, root *cobra.Command) {
	for _, factories := range commandRegistry {
		for _, factory := range factories {
			cmd := factory(c)
			if cmd != nil {
				root.AddCommand(cmd)
			}
		}
	}
}
