package boot

import (
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/ollama"
	"sentinel/internal/startup"
	"sentinel/internal/temporal"
	"syscall"
	"time"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("DEVELOPMENT", func(c *core.Core) *cobra.Command {
		cmd := &cobra.Command{
			Use:     "dev-start",
			Short:   "Inicia el entorno de desarrollo integrado",
			Example: `  sentinel dev-start`,
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Info("🚀 Iniciando Entorno de Desarrollo...")

				// 1. CONFIGURACIÓN OLLAMA
				ollamaPath := filepath.Join(c.Paths.AppDataDir, "bin", "ollama", "ollama.exe")
				c.Logger.Info("🔍 Supervisando Ollama en: %s", ollamaPath)

				var ollamaSup *ollama.Supervisor
				if c.OllamaSupervisor != nil {
					ollamaSup = c.OllamaSupervisor.(*ollama.Supervisor)
				} else {
					ollamaSup = ollama.NewSupervisor(c)
					c.OllamaSupervisor = ollamaSup
				}

				go ollamaSup.StartSupervisor(5 * time.Second)
				c.Logger.Success("✓ Ollama Supervisor activado")

				// 2. TEMPORAL RUNTIME
				// Cumple con el principio: dev-start coordina startup, no implementa lógica
				c.Logger.Info("⚙️  Preparando Temporal Server...")
				if err := EnsureTemporalRunning(c); err != nil {
					c.Logger.Error("❌ Error iniciando Temporal: %v", err)
					c.Logger.Warning("⚠️  Continuando sin Temporal (funcionalidad limitada)")
				} else {
					c.Logger.Success("✅ Temporal Server operativo")
				}

				// 3. VALIDACIÓN BRAIN
				if err := health.EnsureBrainRunning(c); err != nil {
					c.Logger.Error("❌ %v", err)
					os.Exit(1)
				}

				// 4. RUTAS Y DESCUBRIMIENTO
				codePath, _ := discovery.FindVSCodeBinary()
				extPath := c.Config.Settings.ExtensionPath
				wsPath := c.Config.Settings.TestWorkspace
				runtimePath := filepath.Join(c.Paths.AppDataDir, "resources", "runtime")

				startup.UpdateActiveStatus(c, map[string]string{
					"vscode_exe": codePath,
				})

				// 5. INICIO DE SERVICIOS (Definidos en npm.go)
				c.Logger.Info("📡 Levantando Bloom API + Swagger...")
				apiCmd, _ := LaunchApiServer(filepath.Join(extPath, "out", "server.js"))
				
				c.Logger.Info("🎨 Levantando Svelte UI...")
				svelteCmd, _ := LaunchSvelte(filepath.Join(extPath, "ui"))

				// 6. EXTENSIÓN Y SETTINGS
				sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
				_ = SyncVScodeSettings(extPath, sm.BrainPath, filepath.Join(runtimePath, "python.exe"))
				vsCmd, _ := LaunchExtensionHost(codePath, extPath, wsPath, runtimePath)

				c.Logger.Info("🔍 Validando estado...")
				time.Sleep(2 * time.Second)
				_, _ = health.CheckHealth(c, sm)

				// 7. MANEJO DE SEÑALES Y LIMPIEZA
				sigs := make(chan os.Signal, 1)
				signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
				c.Logger.Success(">>> Entorno LISTO. Presiona Ctrl+C para cerrar.")
				<-sigs

				c.Logger.Info("Cerrando servicios...")
				if vsCmd != nil { KillProcessTree(vsCmd.Process.Pid) }
				if apiCmd != nil { KillProcessTree(apiCmd.Process.Pid) }
				if svelteCmd != nil { KillProcessTree(svelteCmd.Process.Pid) }
				if c.OllamaSupervisor != nil { ollamaSup.Stop() }
				
				// Cleanup de Temporal
				if c.TemporalManager != nil {
					c.Logger.Info("⏹️  Deteniendo Temporal Server...")
					tm := c.TemporalManager.(*temporal.Manager)
					tm.Stop()
				}

				CleanPorts([]int{5173, 48215, 5678, 11434, 7233})
			},
		}

		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["category"] = "DEVELOPMENT"

		return cmd
	})
}

// EnsureTemporalRunning verifica que Temporal esté iniciado y saludable
// Cumple con los principios:
// - Reutiliza el manager existente
// - No duplica lógica de start ni health
// - Espera readiness real (health OK)
func EnsureTemporalRunning(c *core.Core) error {
	// 1. Obtener o crear el manager
	var tm *temporal.Manager
	if c.TemporalManager != nil {
		tm = c.TemporalManager.(*temporal.Manager)
	} else {
		tm = temporal.NewManager(c)
		c.TemporalManager = tm
	}
	
	// 2. Consultar estado actual
	state := tm.GetState()
	
	// 3. Si ya está corriendo, validar health
	if state == temporal.StateRunning {
		c.Logger.Info("   Temporal ya está en ejecución, verificando health...")
		healthy, err := tm.HealthCheck()
		if healthy {
			c.Logger.Success("   ✓ Health check: OK")
			return nil
		}
		c.Logger.Warning("   ⚠️  Temporal responde pero health check falló: %v", err)
		// Continuamos para intentar reiniciar
	}
	
	// 4. Iniciar Temporal en modo dev
	c.Logger.Info("   Iniciando servidor en modo desarrollo...")
	if err := tm.Start(true, 7233); err != nil {
		return fmt.Errorf("error en Start(): %w", err)
	}
	
	// 5. Esperar readiness real (hasta 10 segundos)
	c.Logger.Info("   Esperando readiness del servidor...")
	maxRetries := 20
	retryDelay := 500 * time.Millisecond
	
	for i := 0; i < maxRetries; i++ {
		time.Sleep(retryDelay)
		
		healthy, err := tm.HealthCheck()
		if healthy {
			c.Logger.Success("   ✓ Servidor listo después de %d intentos", i+1)
			return nil
		}
		
		if i == maxRetries-1 {
			return fmt.Errorf("timeout esperando readiness: %w", err)
		}
	}
	
	return fmt.Errorf("servidor no alcanzó estado saludable")
}