package core

import "github.com/spf13/cobra"

// CommandFactory define la firma de la función constructora
type CommandFactory func(*Core) *cobra.Command

// RegisteredCommand vincula un comando con su categoría visual
type RegisteredCommand struct {
	Factory  CommandFactory
	Category string
}

// CommandRegistry lista global de comandos descubiertos
var CommandRegistry []RegisteredCommand

// RegisterCommand registra un comando con su categoría
func RegisterCommand(category string, factory CommandFactory) {
	CommandRegistry = append(CommandRegistry, RegisteredCommand{
		Factory:  factory,
		Category: category,
	})
}

// BuildCommands construye y registra todos los comandos en el root
func BuildCommands(c *Core, root *cobra.Command) {
	for _, registered := range CommandRegistry {
		cmd := registered.Factory(c)
		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["category"] = registered.Category
		root.AddCommand(cmd)
	}
}
