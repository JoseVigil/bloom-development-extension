package temporal

import (
	"encoding/json"
	"fmt"
	"sentinel/internal/core"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("TEMPORAL", func(c *core.Core) *cobra.Command {
		
		// ══════════════════════════════════════════════════════════════
		// COMANDO RAÍZ: temporal
		// ══════════════════════════════════════════════════════════════
		
		cmd := &cobra.Command{
			Use:   "temporal",
			Short: "Controlador maestro del runtime de Temporal",
			Long: `Gestiona el ciclo de vida completo del servidor Temporal:
			
			- Inicialización y configuración (dev/prod)
			- Monitoreo de estado y salud del cluster
			- Gestión de workflows y actividades
			- Integración con el ecosistema Bloom`,
			
			Annotations: map[string]string{
				"category": "TEMPORAL",
			},
			
			Run: func(cmd *cobra.Command, args []string) {
				cmd.Help()
			},
		}

		// Subcomandos principales
		cmd.AddCommand(temporalStartCommand(c))
		cmd.AddCommand(temporalStopCommand(c))
		cmd.AddCommand(temporalStatusCommand(c))
		cmd.AddCommand(temporalHealthCommand(c))
		cmd.AddCommand(temporalWorkflowCommand(c))
		cmd.AddCommand(temporalActivityCommand(c))

		return cmd
	})
}

// ══════════════════════════════════════════════════════════════
// SUBCOMANDO: temporal start
// ══════════════════════════════════════════════════════════════

func temporalStartCommand(c *core.Core) *cobra.Command {
	var (
		devMode bool
		port    int
	)

	cmd := &cobra.Command{
		Use:   "start",
		Short: "Inicia el servidor Temporal",
		Long: `Inicializa el runtime de Temporal con configuración específica.
		
		Modos de operación:
		  - Desarrollo (--dev): Servidor SQLite embebido con temporalite
		  - Producción: Conexión a servidor Temporal externo
		
		El modo desarrollo es ideal para testing local y no requiere
		infraestructura adicional. Producción requiere un cluster Temporal
		corriendo externamente (Docker o cloud).`,
		
		Example: `  sentinel temporal start
  sentinel temporal start --dev
  sentinel temporal start --port 7233
  sentinel temporal start --dev && sentinel temporal status`,

		Annotations: map[string]string{
			"category": "TEMPORAL",
			"requires": `- Modo Dev: temporalite.exe en bin/
- Modo Prod: Servidor Temporal accesible en puerto configurado
- Permisos de escritura en AppData/Bloom/temporal/`,
		},

		Run: func(cmd *cobra.Command, args []string) {
			tm := getOrCreateManager(c)
			
			status := tm.GetStatus()
			if status.State == StateRunning {
				c.Logger.Success("✓ Temporal ya está en ejecución")
				c.Logger.Info("  Namespace: %s | Task Queue: %s", 
					status.Namespace, status.TaskQueue)
				return
			}
			
			if err := tm.Start(devMode, port); err != nil {
				c.Logger.Error("❌ Error iniciando Temporal: %v", err)
				return
			}
			
			c.Logger.Success("✅ Temporal Server operativo en puerto %d", port)
		},
	}

	cmd.Flags().BoolVar(&devMode, "dev", true, "Modo desarrollo (servidor embebido)")
	cmd.Flags().IntVar(&port, "port", 7233, "Puerto del servidor")

	return cmd
}

// ══════════════════════════════════════════════════════════════
// SUBCOMANDO: temporal stop
// ══════════════════════════════════════════════════════════════

func temporalStopCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "stop",
		Short: "Detiene el servidor Temporal y todos los workers",
		Long: `Finaliza el proceso del servidor Temporal (si es embebido),
		cierra la conexión del cliente y detiene todos los workers activos.
		
		Este comando realiza un shutdown ordenado de todos los componentes.`,
		
		Example: `  sentinel temporal stop
  sentinel temporal stop && sleep 2 && sentinel temporal start`,

		Annotations: map[string]string{
			"category": "TEMPORAL",
		},
		
		Run: func(cmd *cobra.Command, args []string) {
			if c.TemporalManager == nil {
				c.Logger.Warning("No hay supervisor de Temporal activo")
				return
			}
			
			tm := c.TemporalManager.(*Manager)
			
			if err := tm.Stop(); err != nil {
				c.Logger.Error("Error deteniendo Temporal: %v", err)
				return
			}
		},
	}
}

// ══════════════════════════════════════════════════════════════
// SUBCOMANDO: temporal status
// ══════════════════════════════════════════════════════════════

func temporalStatusCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Muestra el estado actual del servidor Temporal",
		Long: `Reporta el estado operativo completo del runtime Temporal:
		
		- Estado FSM (STOPPED, STARTING, RUNNING, etc.)
		- Namespace activo
		- Task Queue configurado
		- Cantidad de workers registrados
		- Tipo de base de datos (SQLite/Postgres)
		- Conectividad con el servidor`,
		
		Example: `  sentinel temporal status
  sentinel --json temporal status | jq .
  sentinel temporal status && sentinel temporal workflow list`,

		Annotations: map[string]string{
			"category": "TEMPORAL",
			"requires": `- Servidor Temporal debe estar iniciado previamente
- Puerto 7233 accesible para verificación`,
		},
		
		Run: func(cmd *cobra.Command, args []string) {
			tm := getOrCreateManager(c)
			status := tm.GetStatus()
			
			if c.IsJSON {
				outputJSON(c, status)
			} else {
				displayStatus(c, status)
			}
		},
	}
}

// ══════════════════════════════════════════════════════════════
// SUBCOMANDO: temporal health
// ══════════════════════════════════════════════════════════════

func temporalHealthCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "health",
		Short: "Verificación de conectividad y salud del cluster",
		Long: `Ejecuta un healthcheck puntual del servidor Temporal sin
		modificar el estado del supervisor.
		
		Verifica que el servidor responda correctamente y que el
		namespace configurado esté accesible.`,
		
		Example: `  sentinel temporal health
  sentinel temporal health && echo "OK" || echo "FAIL"`,

		Annotations: map[string]string{
			"category": "TEMPORAL",
		},
		
		Run: func(cmd *cobra.Command, args []string) {
			tm := getOrCreateManager(c)
			
			c.Logger.Info("🔬 Verificando salud del cluster Temporal...")
			
			healthy, err := tm.HealthCheck()
			if healthy {
				c.Logger.Success("✅ Healthcheck: OK")
				c.Logger.Info("   Namespace: %s", tm.Config.Namespace)
				c.Logger.Info("   Task Queue: %s", tm.Config.TaskQueue)
			} else {
				c.Logger.Error("❌ Healthcheck: FAIL")
				if err != nil {
					c.Logger.Error("   Error: %v", err)
				}
			}
		},
	}
}

// ══════════════════════════════════════════════════════════════
// SUBCOMANDO: temporal workflow
// ══════════════════════════════════════════════════════════════

func temporalWorkflowCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "workflow",
		Short: "Gestión de workflows de Temporal",
		Long: `Comandos para administrar el ciclo de vida de workflows:
		
		- Listar workflows activos
		- Ejecutar nuevos workflows
		- Terminar workflows en ejecución
		- Describir estado de workflows`,
		
		Annotations: map[string]string{
			"category": "TEMPORAL",
		},
		
		Run: func(cmd *cobra.Command, args []string) {
			cmd.Help()
		},
	}

	// Sub-subcomandos
	cmd.AddCommand(workflowListCommand(c))
	cmd.AddCommand(workflowExecuteCommand(c))
	cmd.AddCommand(workflowTerminateCommand(c))
	cmd.AddCommand(workflowDescribeCommand(c))

	return cmd
}

func workflowListCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "Lista todos los workflows activos",
		Long: `Muestra una lista de workflows en ejecución en el namespace configurado.
		
		Incluye información sobre estado, tiempo de ejecución y workflow ID.`,
		
		Example: `  sentinel temporal workflow list
  sentinel --json temporal workflow list | jq '.[]'`,
		
		Run: func(cmd *cobra.Command, args []string) {
			tm := getOrCreateManager(c)
			
			if tm.Client == nil {
				c.Logger.Error("Cliente no inicializado. Ejecuta 'sentinel temporal start' primero")
				return
			}
			
			c.Logger.Info("📋 Listando workflows activos...")
			c.Logger.Warning("⚠️  Funcionalidad en desarrollo - implementar query a Temporal")
			
			// TODO: Implementar usando tm.Client.ListWorkflow()
		},
	}
}

func workflowExecuteCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "execute <workflow_id>",
		Short: "Ejecuta un workflow específico",
		Args:  cobra.ExactArgs(1),
		
		Example: `  sentinel temporal workflow execute profile-onboarding-001
  sentinel temporal workflow execute scheduled-task-daily`,
		
		Run: func(cmd *cobra.Command, args []string) {
			workflowID := args[0]
			tm := getOrCreateManager(c)
			
			if tm.Client == nil {
				c.Logger.Error("Cliente no inicializado. Ejecuta 'sentinel temporal start' primero")
				return
			}
			
			c.Logger.Info("🚀 Ejecutando workflow: %s", workflowID)
			c.Logger.Warning("⚠️  Funcionalidad en desarrollo - implementar ExecuteWorkflow")
			
			// TODO: Implementar usando tm.Client.ExecuteWorkflow()
		},
	}
}

func workflowTerminateCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "terminate <workflow_id>",
		Short: "Termina un workflow en ejecución",
		Args:  cobra.ExactArgs(1),
		
		Example: `  sentinel temporal workflow terminate profile-onboarding-001`,
		
		Run: func(cmd *cobra.Command, args []string) {
			workflowID := args[0]
			tm := getOrCreateManager(c)
			
			if tm.Client == nil {
				c.Logger.Error("Cliente no inicializado. Ejecuta 'sentinel temporal start' primero")
				return
			}
			
			c.Logger.Warning("🛑 Terminando workflow: %s", workflowID)
			c.Logger.Warning("⚠️  Funcionalidad en desarrollo - implementar TerminateWorkflow")
			
			// TODO: Implementar usando tm.Client.TerminateWorkflow()
		},
	}
}

func workflowDescribeCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "describe <workflow_id>",
		Short: "Describe el estado de un workflow",
		Args:  cobra.ExactArgs(1),
		
		Example: `  sentinel temporal workflow describe profile-onboarding-001
  sentinel --json temporal workflow describe task-001 | jq .`,
		
		Run: func(cmd *cobra.Command, args []string) {
			workflowID := args[0]
			tm := getOrCreateManager(c)
			
			if tm.Client == nil {
				c.Logger.Error("Cliente no inicializado. Ejecuta 'sentinel temporal start' primero")
				return
			}
			
			c.Logger.Info("🔍 Describiendo workflow: %s", workflowID)
			c.Logger.Warning("⚠️  Funcionalidad en desarrollo - implementar DescribeWorkflow")
			
			// TODO: Implementar usando tm.Client.DescribeWorkflowExecution()
		},
	}
}

// ══════════════════════════════════════════════════════════════
// SUBCOMANDO: temporal activity
// ══════════════════════════════════════════════════════════════

func temporalActivityCommand(c *core.Core) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "activity",
		Short: "Gestión de actividades registradas",
		Long: `Comandos para administrar actividades de Temporal:
		
		- Listar actividades registradas
		- Ver estado de actividades en ejecución`,
		
		Annotations: map[string]string{
			"category": "TEMPORAL",
		},
		
		Run: func(cmd *cobra.Command, args []string) {
			cmd.Help()
		},
	}

	cmd.AddCommand(activityListCommand(c))

	return cmd
}

func activityListCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "Lista todas las actividades registradas",
		
		Example: `  sentinel temporal activity list
  sentinel --json temporal activity list | jq .`,
		
		Run: func(cmd *cobra.Command, args []string) {
			tm := getOrCreateManager(c)
			
			if tm.Worker == nil {
				c.Logger.Warning("No hay workers activos")
				c.Logger.Info("Ejecuta 'sentinel temporal start' para registrar actividades")
				return
			}
			
			c.Logger.Info("📋 Actividades registradas:")
			c.Logger.Warning("⚠️  Funcionalidad en desarrollo - implementar introspección de workers")
			
			// TODO: Implementar listado de actividades registradas
		},
	}
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

func getOrCreateManager(c *core.Core) *Manager {
	if c.TemporalManager == nil {
		c.TemporalManager = NewManager(c)
	}
	return c.TemporalManager.(*Manager)
}

func outputJSON(c *core.Core, status StatusInfo) {
	jsonBytes, _ := json.Marshal(status)
	fmt.Println(string(jsonBytes))
}

func displayStatus(c *core.Core, status StatusInfo) {
	c.Logger.Info("═══════════════════════════════════════════════════")
	c.Logger.Info("  TEMPORAL SERVER STATUS")
	c.Logger.Info("═══════════════════════════════════════════════════")
	c.Logger.Info("")
	
	// Estado con color
	stateIcon := "⚫"
	if status.State == StateRunning {
		stateIcon = "🟢"
	} else if status.State == StateStarting {
		stateIcon = "🟡"
	} else if status.State == StateCrashed || status.State == StateDegraded {
		stateIcon = "🔴"
	}
	
	c.Logger.Info("  %s Estado: %s", stateIcon, status.State)
	
	// Conectividad
	connIcon := "❌"
	if status.Reachable {
		connIcon = "✅"
	}
	c.Logger.Info("  %s Conectividad: %v", connIcon, status.Reachable)
	
	c.Logger.Info("")
	c.Logger.Info("  📦 Namespace: %s", status.Namespace)
	c.Logger.Info("  📋 Task Queue: %s", status.TaskQueue)
	c.Logger.Info("  👷 Workers: %d activos", status.WorkerCount)
	c.Logger.Info("  💾 Base de datos: %s", status.DatabaseType)
	
	if status.ServerVersion != "" {
		c.Logger.Info("  📌 Versión: %s", status.ServerVersion)
	}
	
	c.Logger.Info("")
	c.Logger.Info("═══════════════════════════════════════════════════")
}