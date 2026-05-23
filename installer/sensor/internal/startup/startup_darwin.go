// internal/startup/startup_darwin.go

//go:build darwin

package startup

import (
	"fmt"
	"os"
	"path/filepath"
	"text/template"
	"time"

	"bloom-sensor/internal/cmdregistry"
	"bloom-sensor/internal/core"
	"github.com/spf13/cobra"
)

// En macOS el mecanismo de autostart equivalente a HKCU\Run de Windows
// es un LaunchAgent: un archivo .plist en ~/Library/LaunchAgents/.
// launchd lo carga automáticamente al iniciar sesión el usuario.

const plistName = "com.bloom.sensor.plist"

func launchAgentPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("no se pudo obtener el home del usuario: %w", err)
	}
	return filepath.Join(home, "Library", "LaunchAgents", plistName), nil
}

// plistTemplate genera el XML del LaunchAgent.
// RunAtLoad=true replica el comportamiento de HKCU\Run (ejecuta al login).
var plistTemplate = template.Must(template.New("plist").Parse(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bloom.sensor</string>
    <key>ProgramArguments</key>
    <array>
        <string>{{.ExePath}}</string>
        <string>run</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>{{.LogDir}}/bloom-sensor.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>{{.LogDir}}/bloom-sensor.stderr.log</string>
</dict>
</plist>
`))

// Enable instala el LaunchAgent para autostart al login.
// Equivalente a escribir BloomSensor en HKCU\Run en Windows.
func Enable(installPath string) error {
	exePath := filepath.Join(installPath, "bloom-sensor")

	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("no se pudo obtener el home del usuario: %w", err)
	}
	logDir := filepath.Join(home, "Library", "Logs", "BloomSensor")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return fmt.Errorf("no se pudo crear directorio de logs: %w", err)
	}

	agentDir := filepath.Join(home, "Library", "LaunchAgents")
	if err := os.MkdirAll(agentDir, 0o755); err != nil {
		return fmt.Errorf("no se pudo crear ~/Library/LaunchAgents: %w", err)
	}

	plistPath, err := launchAgentPath()
	if err != nil {
		return err
	}

	f, err := os.Create(plistPath)
	if err != nil {
		return fmt.Errorf("no se pudo crear %s: %w", plistPath, err)
	}
	defer f.Close()

	data := struct {
		ExePath string
		LogDir  string
	}{
		ExePath: exePath,
		LogDir:  logDir,
	}
	if err := plistTemplate.Execute(f, data); err != nil {
		return fmt.Errorf("error generando plist: %w", err)
	}

	return nil
}

// Disable elimina el LaunchAgent.
// Equivalente a borrar BloomSensor de HKCU\Run en Windows.
// Es idempotente — no falla si el archivo no existe.
func Disable() error {
	plistPath, err := launchAgentPath()
	if err != nil {
		return err
	}
	err = os.Remove(plistPath)
	if err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("no se pudo eliminar %s: %w", plistPath, err)
	}
	return nil
}

// IsEnabled devuelve si el LaunchAgent existe y el path del plist.
// Equivalente a leer BloomSensor de HKCU\Run en Windows.
func IsEnabled() (bool, string) {
	plistPath, err := launchAgentPath()
	if err != nil {
		return false, ""
	}
	if _, err := os.Stat(plistPath); err != nil {
		return false, ""
	}
	return true, plistPath
}

// ─── Comandos ────────────────────────────────────────────────────────────────

// RegisterCommands registra los comandos de startup en el registry global.
func RegisterCommands(c *core.Core) {
	cmdregistry.Register(func() *cobra.Command { return newStatusCommand(c) })
	cmdregistry.Register(func() *cobra.Command { return newEnableCommand(c) })
	cmdregistry.Register(func() *cobra.Command { return newDisableCommand(c) })
}

func newStatusCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Report current sensor process, autostart and Sentinel connection status",
		Annotations: map[string]string{
			"category": "RUNTIME",
			"json_response": `{
  "process_running": true,
  "pid": 1234,
  "autostart_registered": true,
  "sentinel_connected": true,
  "last_state_update": "2026-02-24T15:04:05Z"
}`,
		},
		Example: `bloom-sensor status
bloom-sensor --json status`,
		RunE: func(cmd *cobra.Command, args []string) error {
			enabled, _ := IsEnabled()
			var lastStateUpdate string
			if c.CurrentState != nil && !c.CurrentState.Timestamp.IsZero() {
				lastStateUpdate = c.CurrentState.Timestamp.UTC().Format(time.RFC3339)
			}
			status := map[string]interface{}{
				"process_running":      true,
				"pid":                  os.Getpid(),
				"autostart_registered": enabled,
				"sentinel_connected":   c.SentinelClient.IsConnected(),
				"last_state_update":    lastStateUpdate,
			}
			return cmdregistry.PrintJSON(status)
		},
	}
}

func newEnableCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "enable",
		Short: "Register bloom-sensor for automatic startup at user login (LaunchAgent)",
		Long: `Installs a LaunchAgent plist at ~/Library/LaunchAgents/com.bloom.sensor.plist.

The plist runs:
  /path/to/bloom-sensor run

at login with RunAtLoad=true. This is the macOS equivalent of the
Windows HKCU\Software\Microsoft\Windows\CurrentVersion\Run registry key.
The operation is idempotent — safe to run multiple times.`,
		Annotations: map[string]string{
			"category": "LIFECYCLE",
			"json_response": `{
  "success": true,
  "plist_path": "~/Library/LaunchAgents/com.bloom.sensor.plist",
  "exe_path": "/path/to/bloom-sensor"
}`,
		},
		Example: `bloom-sensor enable
bloom-sensor --json enable`,
		RunE: func(cmd *cobra.Command, args []string) error {
			exePath, err := os.Executable()
			if err != nil {
				return fmt.Errorf("could not determine executable path: %w", err)
			}
			dir := filepath.Dir(exePath)
			if err := Enable(dir); err != nil {
				return err
			}
			c.Logger.Info("autostart enabled: %s", dir)
			plistPath, _ := launchAgentPath()
			result := map[string]interface{}{
				"success":    true,
				"plist_path": plistPath,
				"exe_path":   exePath + " run",
			}
			return cmdregistry.PrintJSON(result)
		},
	}
}

func newDisableCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "disable",
		Short: "Remove bloom-sensor from automatic startup (LaunchAgent)",
		Long: `Deletes ~/Library/LaunchAgents/com.bloom.sensor.plist.

Does NOT kill the running process. The current session continues until
the process exits normally or is stopped externally.
The operation is idempotent — safe to run even if the plist does not exist.`,
		Annotations: map[string]string{
			"category": "LIFECYCLE",
			"json_response": `{
  "success": true,
  "removed": true
}`,
		},
		Example: `bloom-sensor disable
bloom-sensor --json disable`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := Disable(); err != nil {
				return err
			}
			c.Logger.Info("autostart disabled")
			result := map[string]interface{}{
				"success": true,
				"removed": true,
			}
			return cmdregistry.PrintJSON(result)
		},
	}
}
