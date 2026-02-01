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

				// --- INICIAR OLLAMA SUPERVISOR ---
				var ollamaSup *ollama.Supervisor

				if c.OllamaSupervisor != nil {
					// Reutilizar supervisor existente
					ollamaSup = c.OllamaSupervisor.(*ollama.Supervisor)
					c.Logger.Info("♻️ Reutilizando supervisor de Ollama existente")
				} else {
					// Crear nuevo supervisor
					ollamaSup = ollama.NewSupervisor(c)
					c.OllamaSupervisor = ollamaSup
					c.Logger.Success("✓ Supervisor de Ollama creado")
				}

				// Iniciar en goroutine para no bloquear
				go ollamaSup.StartSupervisor(5 * time.Second)
				c.Logger.Success("✓ Ollama Supervisor activado")
				// --------------------------------------

				if err := health.EnsureBrainRunning(c); err != nil {
					c.Logger.Error("❌ %v", err)
					os.Exit(1)
				}

				codePath, _ := discovery.FindVSCodeBinary()
				extPath := c.Config.Settings.ExtensionPath
				wsPath := c.Config.Settings.TestWorkspace
				runtimePath := filepath.Join(c.Paths.AppDataDir, "resources", "runtime")

				startup.UpdateActiveStatus(c, map[string]string{
					"vscode_exe": codePath,
				})

				svelteCmd, _ := LaunchSvelte(extPath)
				sm, _ := discovery.DiscoverSystem(c.Paths.BinDir)
				_ = SyncVScodeSettings(extPath, sm.BrainPath, filepath.Join(runtimePath, "python.exe"))
				vsCmd, _ := LaunchExtensionHost(codePath, extPath, wsPath, runtimePath)

				c.Logger.Info("🔍 Validando estado...")
				time.Sleep(2 * time.Second)
				_, _ = health.CheckHealth(c, sm)

				sigs := make(chan os.Signal, 1)
				signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
				c.Logger.Success(">>> Entorno LISTO. Presiona Ctrl+C para cerrar.")
				<-sigs

				// --- CLEANUP ---
				c.Logger.Info("Cerrando servicios...")
				if vsCmd != nil {
					KillProcessTree(vsCmd.Process.Pid)
				}
				if svelteCmd != nil {
					KillProcessTree(svelteCmd.Process.Pid)
				}

				// Detener Ollama al salir
				if c.OllamaSupervisor != nil {
					ollamaSup.Stop()
				}

				CleanPorts([]int{5173, 3001, 5678, 11434})
			},
		}

		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["requires"] = `  - brain.exe disponible y ejecutable
  - Ollama.exe en carpeta bin/
  - VSCode instalado y detectado en PATH
  - Node.js y npm para servidor Svelte (puerto 5173)
  - Puertos 5173, 3001, 5678, 11434 libres
  - extension_path y test_workspace configurados en sentinel.yaml
  - Python runtime en resources/runtime/`

		return cmd
	})
}