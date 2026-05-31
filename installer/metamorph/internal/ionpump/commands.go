package ionpump

import (
	"metamorph/internal/core"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("IONPUMP", createIonPumpCommand)
}

func createIonPumpCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "ion-pump",
		Short: "Ion site deployment and reconciliation",
		Long: `Manages ion site lifecycle in ionsites/.

Supports bootstrap deploy (without Brain) and reconciliation from Batcave manifests.
Ion sites are Cortex UI artefacts identified by domain name (e.g. github.com).
Each site is an extracted .ion ZIP with a domain.manifest.json at its root.`,

		Annotations: map[string]string{
			"category": "IONPUMP",
		},
	}

	cmd.AddCommand(createReconcileCommand(c))
	cmd.AddCommand(createStatusCommand(c))
	cmd.AddCommand(createListCommand(c))
	cmd.AddCommand(createRollbackCommand(c))
	cmd.AddCommand(createVerifyCommand(c))

	return cmd
}
