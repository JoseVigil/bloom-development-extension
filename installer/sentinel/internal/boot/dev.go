package boot

import (
	"os"
	"os/signal"
	"path/filepath"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/health"
	"sentinel/internal/ollama"
	"sentinel/internal/startup"
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
				c.Logger.Info("📍 Supervisando Ollama en: %s", ollamaPath)

				var ollamaSup *ollama.Supervisor
				if c.OllamaSupervisor != nil {
					ollamaSup = c.OllamaSupervisor.(*ollama.Supervisor)
				} else {
					ollamaSup = ollama.NewSupervisor(c)
					c.OllamaSupervisor = ollamaSup
				}

				go ollamaSup.StartSupervisor(5 * time.Second)
				c.Logger.Success("✓ Ollama Supervisor activado")

				// 2. VALIDACIÓN BRAIN
				if err := health.EnsureBrainRunning(c); err != nil {
					c.Logger.Error("❌ %v", err)
					os.Exit(1)
				}

				// 3. RUTAS Y DESCUBRIMIENTO
				codePath, _ := discovery.FindVSCodeBinary()
				extPath := c.Config.Settings.ExtensionPath
				wsPath := c.Config.Settings.TestWorkspace
				runtimePath := filepath.Join(c.Paths.AppDataDir, "resources", "runtime")

				startup.UpdateActiveStatus(c, map[string]string{
					"vscode_exe": codePath,
				})

				// 4. INICIO DE SERVICIOS (Definidos en npm.go)
				c.Logger.Info("📡 Levantando Bloom API + Swagger...")
				apiCmd, _ := LaunchApiServer(filepath.Join(extPath, "out", "server.js"))
				
				c.Logger.Info("🎨 Levantando Svelte UI...")
				svelteCmd, _ := LaunchSvelte(filepath.Join(extPath, "ui"))

				// 5. EXTENSIÓN Y SETTINGS
				sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
				_ = SyncVScodeSettings(extPath, sm.BrainPath, filepath.Join(runtimePath, "python.exe"))
				vsCmd, _ := LaunchExtensionHost(codePath, extPath, wsPath, runtimePath)

				c.Logger.Info("🔍 Validando estado...")
				time.Sleep(2 * time.Second)
				_, _ = health.CheckHealth(c, sm)

				// 6. MANEJO DE SEÑALES Y LIMPIEZA
				sigs := make(chan os.Signal, 1)
				signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
				c.Logger.Success(">>> Entorno LISTO. Presiona Ctrl+C para cerrar.")
				<-sigs

				c.Logger.Info("Cerrando servicios...")
				if vsCmd != nil { KillProcessTree(vsCmd.Process.Pid) }
				if apiCmd != nil { KillProcessTree(apiCmd.Process.Pid) }
				if svelteCmd != nil { KillProcessTree(svelteCmd.Process.Pid) }
				if c.OllamaSupervisor != nil { ollamaSup.Stop() }

				CleanPorts([]int{5173, 48215, 5678, 11434})
			},
		}

		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["category"] = "DEVELOPMENT"

		return cmd
	})
}