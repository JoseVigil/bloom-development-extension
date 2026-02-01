package ollama

import (
	"sentinel/internal/core"
	"time"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("OLLAMA", func(c *core.Core) *cobra.Command {
		// Comando Raíz para Ollama
		ollamaCmd := &cobra.Command{
			Use:   "ollama",
			Short: "Controlador maestro del runtime de Ollama",
			Long:  "Gestión operativa de Ollama: supervisión, estado y mantenimiento del motor de inferencia local.",
		}

		// 1. ollama start (Heartbeat/Supervisor)
		ollamaCmd.AddCommand(&cobra.Command{
			Use:   "start",
			Short: "Inicia el supervisor y el heartbeat de Ollama",
			Run: func(cmd *cobra.Command, args []string) {
				sup := getOrCreateSupervisor(c)
				
				status := sup.GetStatus()
				if status.State == StateRunning {
					c.Logger.Success("✓ Ollama ya está en ejecución (PID: %d, Estado: %s)", 
						status.PID, status.State)
					return
				}
				
				c.Logger.Info("Iniciando supervisor de Ollama...")
				go sup.StartSupervisor(5 * time.Second)
				
				// Dar tiempo para que arranque
				time.Sleep(2 * time.Second)
				c.Logger.Success("✓ Supervisor de Ollama activado")
			},
		})

		// 2. ollama status (FSM State)
		ollamaCmd.AddCommand(&cobra.Command{
			Use:   "status",
			Short: "Muestra el estado actual de la FSM de Ollama",
			Run: func(cmd *cobra.Command, args []string) {
				sup := getOrCreateSupervisor(c)
				status := sup.GetStatus()
				
				if status.Reachable {
					c.Logger.Success("Estado: %s | Versión: %s | PID: %d", 
						status.State, status.Version, status.PID)
				} else {
					c.Logger.Error("Estado: %s | El servicio no responde", status.State)
				}
			},
		})

		// 3. ollama healthcheck (Check puntual)
		ollamaCmd.AddCommand(&cobra.Command{
			Use:   "healthcheck",
			Short: "Verificación de conectividad inmediata",
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Info("Verificando integridad de Ollama...")
				res := CheckOllamaOnce()
				if res.Reachable {
					c.Logger.Success("Healthcheck: OK (Versión %s)", res.Version)
				} else {
					c.Logger.Error("Healthcheck: FAIL. Error: %v", res.Error)
				}
			},
		})

		// 4. ollama stop
		ollamaCmd.AddCommand(&cobra.Command{
			Use:   "stop",
			Short: "Detiene el proceso de Ollama y el supervisor",
			Run: func(cmd *cobra.Command, args []string) {
				if c.OllamaSupervisor == nil {
					c.Logger.Warning("No hay supervisor activo")
					return
				}
				
				c.Logger.Warning("Deteniendo Ollama...")
				sup := c.OllamaSupervisor.(*Supervisor)
				sup.Stop()
				c.Logger.Success("✓ Ollama detenido")
			},
		})

		// 5. ollama restart
		ollamaCmd.AddCommand(&cobra.Command{
			Use:   "restart",
			Short: "Forzar reinicio del runtime",
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Info("Forzando ciclo de reinicio...")
				
				// Stop si existe
				if c.OllamaSupervisor != nil {
					sup := c.OllamaSupervisor.(*Supervisor)
					sup.Stop()
					time.Sleep(1 * time.Second)
				}
				
				// Start nuevo
				sup := getOrCreateSupervisor(c)
				go sup.StartSupervisor(5 * time.Second)
				
				time.Sleep(2 * time.Second)
				c.Logger.Success("✓ Ollama reiniciado")
			},
		})

		// 6. ollama logs
		ollamaCmd.AddCommand(&cobra.Command{
			Use:   "logs",
			Short: "Muestra logs recientes del proceso Ollama",
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Info("Leyendo buffer de logs de Ollama...")
				// TODO: Lógica para leer el archivo de log en logs/ollama/ollama_service_*.log
				c.Logger.Warning("Funcionalidad en desarrollo - revisar logs/ollama/")
			},
		})

		// 7. ollama pull [model]
		ollamaCmd.AddCommand(&cobra.Command{
			Use:   "pull [modelo]",
			Short: "Descarga un modelo específico",
			Args:  cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Info("Iniciando descarga de modelo: %s", args[0])
				// TODO: Lógica de descarga usando ollama CLI
				c.Logger.Warning("Funcionalidad en desarrollo")
			},
		})

		// 8. ollama purge
		ollamaCmd.AddCommand(&cobra.Command{
			Use:   "purge",
			Short: "Limpia modelos y archivos temporales",
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Warning("Iniciando purga de archivos de Ollama...")
				// TODO: Lógica de limpieza selectiva
				c.Logger.Warning("Funcionalidad en desarrollo")
			},
		})

		return ollamaCmd
	})
}

// getOrCreateSupervisor obtiene el supervisor existente o crea uno nuevo
func getOrCreateSupervisor(c *core.Core) *Supervisor {
	if c.OllamaSupervisor == nil {
		c.OllamaSupervisor = NewSupervisor(c)
	}
	
	// Type assertion para convertir any → *Supervisor
	return c.OllamaSupervisor.(*Supervisor)
}