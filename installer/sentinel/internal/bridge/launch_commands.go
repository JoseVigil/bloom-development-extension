package bridge

import (
	"encoding/json"
	"sentinel/internal/core"
	"sentinel/internal/eventbus"
	"time"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("BRIDGE", func(c *core.Core) *cobra.Command {
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
				
				// Crear cliente Sentinel
				client := eventbus.NewSentinelClient("127.0.0.1:5678")
				
				// Conectar con el Brain
				if err := client.Connect(); err != nil {
					c.Logger.Error("No se pudo conectar con Brain: %v", err)
					return
				}
				defer client.Close()
				
				// Esperar conexión activa
				if err := client.WaitForConnection(5 * time.Second); err != nil {
					c.Logger.Error("Timeout conectando con Brain: %v", err)
					return
				}
				
				c.Logger.Success("✓ Conectado con Brain")
				
				// Si --wait está activo, usar la función de alto nivel
				if wait {
					c.Logger.Info("Esperando completar onboarding (timeout: %ds)...", timeout)
					
					err := client.LaunchAndWaitOnboarding(
						profileID,
						time.Duration(timeout)*time.Second,
					)
					
					if err != nil {
						c.Logger.Error("Onboarding falló: %v", err)
						return
					}
					
					c.Logger.Success("✓ Onboarding completado exitosamente")
					
				} else {
					// Modo fire-and-forget
					if err := client.LaunchProfile(profileID); err != nil {
						c.Logger.Error("Error enviando comando: %v", err)
						return
					}
					
					c.Logger.Success("✓ Comando de lanzamiento enviado")
				}
			},
		}
		
		cmd.Flags().IntVarP(&timeout, "timeout", "t", 60, "Timeout en segundos para esperar onboarding")
		cmd.Flags().BoolVarP(&wait, "wait", "w", false, "Esperar a que complete el onboarding")
		
		return cmd
	})
}

func init() {
	core.RegisterCommand("BRIDGE", func(c *core.Core) *cobra.Command {
		var intentType string
		var payload string
		var timeout int
		
		cmd := &cobra.Command{
			Use:   "submit-intent <profile_id>",
			Short: "Envía una intención al Brain y espera la respuesta",
			Long: `Envía una intención (intent) al Brain para un perfil específico
y espera la respuesta. Útil para operaciones que requieren confirmación
o que devuelven resultados.

Ejemplo de payload JSON:
  {"action": "navigate", "url": "https://example.com"}`,
			Args: cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				profileID := args[0]
				
				// Parsear payload JSON
				var payloadData map[string]interface{}
				if payload != "" {
					if err := json.Unmarshal([]byte(payload), &payloadData); err != nil {
						c.Logger.Error("Payload JSON inválido: %v", err)
						return
					}
				}
				
				c.Logger.Info("Enviando intent '%s' a perfil %s...", intentType, profileID)
				
				// Crear cliente
				client := eventbus.NewSentinelClient("127.0.0.1:5678")
				
				if err := client.Connect(); err != nil {
					c.Logger.Error("No se pudo conectar con Brain: %v", err)
					return
				}
				defer client.Close()
				
				if err := client.WaitForConnection(5 * time.Second); err != nil {
					c.Logger.Error("Timeout conectando con Brain: %v", err)
					return
				}
				
				// Enviar intent y esperar respuesta
				response, err := client.SubmitIntentAndWait(
					profileID,
					intentType,
					payloadData,
					time.Duration(timeout)*time.Second,
				)
				
				if err != nil {
					c.Logger.Error("Intent falló: %v", err)
					return
				}
				
				c.Logger.Success("✓ Intent completado")
				c.Logger.Info("Respuesta: %+v", response.Data)
			},
		}
		
		cmd.Flags().StringVarP(&intentType, "type", "t", "", "Tipo de intención (requerido)")
		cmd.Flags().StringVarP(&payload, "payload", "p", "{}", "Payload JSON de la intención")
		cmd.Flags().IntVar(&timeout, "timeout", 30, "Timeout en segundos")
		cmd.MarkFlagRequired("type")
		
		return cmd
	})
}