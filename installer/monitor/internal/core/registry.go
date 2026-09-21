package core

import "github.com/spf13/cobra"

type CommandFactory func(*Core) *cobra.Command
type registration struct {
	category string
	factory  CommandFactory
}

// Initialization-only CLI metadata. Never stores requests or runtime services.
var commandRegistry []registration

func RegisterCommand(category string, factory CommandFactory) {
	commandRegistry = append(commandRegistry, registration{category, factory})
}
func BuildCommands(c *Core, root *cobra.Command) {
	for _, r := range commandRegistry {
		cmd := r.factory(c)
		if cmd.Annotations == nil {
			cmd.Annotations = map[string]string{}
		}
		cmd.Annotations["category"] = r.category
		root.AddCommand(cmd)
	}
}
