package ollama

import (
	"sentinel/internal/core"
	"time"

	"github.com/spf13/cobra"
)

func init() {
	// CATEGORÍA CORRECTA: RUNTIME (gestión de ciclo de vida del motor de inferencia)
	core.RegisterCommand("RUNTIME", func(c *core.Core) *cobra.Command {
		// Comando Raíz para Ollama
		ollamaCmd := &cobra.Command{
			Use:   "ollama",
			Short: "Controlador maestro del runtime de Ollama",
			Long:  "Gestión operativa de Ollama: supervisión, estado y mantenimiento del motor de inferencia local.",
			// CRÍTICO: Añadir la anotación de categoría
			Annotations: map[string]string{
				"category": "RUNTIME",
			},
		}

		// 1. ollama start (Heartbeat/Supervisor)
		startCmd := &cobra.Command{
			Use:   "start",
			Short: "Inicia el supervisor y el heartbeat de Ollama",
			Long:  "Activa el supervisor de Ollama que monitorea y mantiene el servicio en ejecución automáticamente.",
			Example: `    sentinel ollama start
    sentinel ollama start && sentinel ollama status`,
			Annotations: map[string]string{
				"category": "RUNTIME",
			},
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
		}

		// 2. ollama status (FSM State)
		statusCmd := &cobra.Command{
			Use:   "status",
			Short: "Muestra el estado actual de la FSM de Ollama",
			Long:  "Reporta el estado operativo del motor Ollama incluyendo versión, PID y conteo de reinicios.",
			Example: `    sentinel ollama status
    sentinel --json ollama status | jq .`,
			Annotations: map[string]string{
				"category": "RUNTIME",
				"requires": `- Servicio Ollama debe estar iniciado previamente
- Puerto 11434 accesible para verificación`,
			},
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
		}

		// 3. ollama healthcheck (Check puntual)
		healthcheckCmd := &cobra.Command{
			Use:   "healthcheck",
			Short: "Verificación de conectividad inmediata",
			Long:  "Ejecuta una prueba de conectividad HTTP al endpoint de Ollama sin modificar el supervisor.",
			Example: `    sentinel ollama healthcheck
    sentinel ollama healthcheck && echo "OK" || echo "FAIL"`,
			Annotations: map[string]string{
				"category": "RUNTIME",
			},
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Info("Verificando integridad de Ollama...")
				res := CheckOllamaOnce()
				if res.Reachable {
					c.Logger.Success("Healthcheck: OK (Versión %s)", res.Version)
				} else {
					c.Logger.Error("Healthcheck: FAIL. Error: %v", res.Error)
				}
			},
		}

		// 4. ollama stop
		stopCmd := &cobra.Command{
			Use:   "stop",
			Short: "Detiene el proceso de Ollama y el supervisor",
			Long:  "Finaliza el proceso del motor Ollama y desactiva el supervisor de manera controlada.",
			Example: `    sentinel ollama stop
    sentinel ollama stop && sleep 2 && sentinel ollama start`,
			Annotations: map[string]string{
				"category": "RUNTIME",
			},
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
		}

		// 5. ollama restart
		restartCmd := &cobra.Command{
			Use:   "restart",
			Short: "Forzar reinicio del runtime",
			Long:  "Ejecuta un ciclo completo de stop-start del motor Ollama para recuperación de errores.",
			Example: `    sentinel ollama restart
    sentinel ollama restart && sentinel ollama status`,
			Annotations: map[string]string{
				"category": "RUNTIME",
			},
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
		}

		// 6. ollama logs
		logsCmd := &cobra.Command{
			Use:   "logs",
			Short: "Muestra logs recientes del proceso Ollama",
			Long:  "Lee y muestra el buffer de logs del servicio Ollama desde el archivo de telemetría.",
			Example: `    sentinel ollama logs
    sentinel ollama logs | tail -n 50`,
			Annotations: map[string]string{
				"category": "RUNTIME",
				"requires": `- Archivo de logs en logs/ollama/ollama_service_*.log
- Permisos de lectura en directorio de logs`,
			},
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Info("Leyendo buffer de logs de Ollama...")
				// TODO: Lógica para leer el archivo de log en logs/ollama/ollama_service_*.log
				c.Logger.Warning("Funcionalidad en desarrollo - revisar logs/ollama/")
			},
		}

		// 7. ollama pull [model]
		pullCmd := &cobra.Command{
			Use:   "pull [modelo]",
			Short: "Descarga un modelo específico",
			Long:  "Descarga e instala un modelo de lenguaje desde el repositorio de Ollama.",
			Args:  cobra.ExactArgs(1),
			Example: `    sentinel ollama pull llama2
    sentinel ollama pull mistral:7b`,
			Annotations: map[string]string{
				"category": "RUNTIME",
				"requires": `- Servicio Ollama en ejecución
- Conexión a internet activa
- Espacio en disco suficiente en OLLAMA_MODELS`,
			},
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Info("Iniciando descarga de modelo: %s", args[0])
				// TODO: Lógica de descarga usando ollama CLI
				c.Logger.Warning("Funcionalidad en desarrollo")
			},
		}

		// 8. ollama purge
		purgeCmd := &cobra.Command{
			Use:   "purge",
			Short: "Limpia modelos y archivos temporales",
			Long:  "Elimina modelos no utilizados y archivos temporales para liberar espacio en disco.",
			Example: `    sentinel ollama purge
    sentinel ollama purge && sentinel ollama status`,
			Annotations: map[string]string{
				"category": "RUNTIME",
			},
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Warning("Iniciando purga de archivos de Ollama...")
				// TODO: Lógica de limpieza selectiva
				c.Logger.Warning("Funcionalidad en desarrollo")
			},
		}

		// Agregar todos los subcomandos al comando raíz
		ollamaCmd.AddCommand(
			startCmd,
			statusCmd,
			healthcheckCmd,
			stopCmd,
			restartCmd,
			logsCmd,
			pullCmd,
			purgeCmd,
		)

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