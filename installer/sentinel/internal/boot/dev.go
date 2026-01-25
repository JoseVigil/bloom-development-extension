package boot

import (
	"os"
	"os/signal"
	"path/filepath"
	"sentinel/internal/core"
	"sentinel/internal/discovery"
	"sentinel/internal/health"
	"sentinel/internal/persistence"
	"sentinel/internal/startup"
	"syscall"
	"time"

	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("DEVELOPMENT", func(c *core.Core) *cobra.Command {
		return &cobra.Command{
			Use:   "dev-start",
			Short: "Inicia el entorno de desarrollo integrado",
			Run: func(cmd *cobra.Command, args []string) {
				c.Logger.Info("🚀 Iniciando Entorno de Desarrollo...")
				
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
				report, _ := health.CheckHealth(c, sm)
				persistence.SaveNucleusState(c, report)

				sigs := make(chan os.Signal, 1)
				signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
				c.Logger.Success(">>> Entorno LISTO. Presiona Ctrl+C para cerrar.")
				<-sigs 

				if vsCmd != nil { KillProcessTree(vsCmd.Process.Pid) }
				if svelteCmd != nil { KillProcessTree(svelteCmd.Process.Pid) }
				CleanPorts([]int{5173, 3001, 5678})
			},
		}
	})
}