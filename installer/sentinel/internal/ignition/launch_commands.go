package ignition

import (
	"sentinel/internal/core"
	"sentinel/internal/eventbus"
	"time"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("IGNITION", func(c *core.Core) *cobra.Command {
		var timeout int
		var wait bool

		cmd := &cobra.Command{
			Use:   "launch-profile <profile_id>",
			Short: "Lanza un perfil de Chrome y monitorea su onboarding",
			Long: `Envía un comando de lanzamiento al Brain y opcionalmente espera 
a que complete la fase de onboarding (handshake de 3 fases).

Este comando demuestra el uso del SentinelClient para operaciones complejas
que requieren correlación de eventos y espera de respuestas.`,
			Args: cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				profileID := args[0]

				c.Logger.Info("Iniciando lanzamiento de perfil %s...", profileID)

				client := eventbus.NewSentinelClient("127.0.0.1:5678", c.Logger)

				if err := client.Connect(); err != nil {
					c.Logger.Error("No se pudo conectar con Brain: %v", err)
					return
				}
				defer client.Close()

				if err := client.WaitForConnection(5 * time.Second); err != nil {
					c.Logger.Error("Timeout conectando con Brain: %v", err)
					return
				}

				c.Logger.Success("✓ Conectado con Brain")

				if wait {
					c.Logger.Info("Modo --wait desactivado temporalmente (funcionalidad no disponible)")
				}

				// Lanzamiento básico (el único método que sí existe)
				if err := client.LaunchProfile(profileID); err != nil {
					c.Logger.Error("Error enviando comando de lanzamiento: %v", err)
					return
				}

				c.Logger.Success("✓ Comando de lanzamiento enviado exitosamente")
			},
		}

		cmd.Flags().IntVarP(&timeout, "timeout", "t", 60, "Timeout en segundos para esperar onboarding (no implementado aún)")
		cmd.Flags().BoolVarP(&wait, "wait", "w", false, "Esperar a que complete el onboarding (no implementado aún)")

		return cmd
	})
}