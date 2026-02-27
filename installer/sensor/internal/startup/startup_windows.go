// internal/startup/startup_windows.go

//go:build windows

package startup

import (
	"fmt"
	"os"
	"time"

	"bloom-sensor/internal/cmdregistry"
	"bloom-sensor/internal/core"
	"golang.org/x/sys/windows/registry"
	"github.com/spf13/cobra"
)

const (
	runKey           = `Software\Microsoft\Windows\CurrentVersion\Run`
	registryValueOld = "BloomLauncher"
	registryValueNew = "BloomSensor"
)

func Enable(installPath string) error {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("no se pudo abrir HKCU\\%s: %w", runKey, err)
	}
	defer k.Close()
	_ = k.DeleteValue(registryValueOld)
	value := fmt.Sprintf(`"%s\bloom-sensor.exe" run`, installPath)
	if err := k.SetStringValue(registryValueNew, value); err != nil {
		return fmt.Errorf("no se pudo escribir valor de registro: %w", err)
	}
	return nil
}

func Disable() error {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("no se pudo abrir HKCU\\%s: %w", runKey, err)
	}
	defer k.Close()
	err = k.DeleteValue(registryValueNew)
	if err != nil && err.Error() != "The system cannot find the file specified." {
		return fmt.Errorf("no se pudo eliminar valor de registro: %w", err)
	}
	return nil
}

func IsEnabled() (bool, string) {
	k, err := registry.OpenKey(registry.CURRENT_USER, runKey, registry.QUERY_VALUE)
	if err != nil {
		return false, ""
	}
	defer k.Close()
	val, _, err := k.GetStringValue(registryValueNew)
	if err != nil {
		return false, ""
	}
	return true, val
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
		Short: "Register bloom-sensor for automatic startup at user login (HKCU\\Run)",
		Long: `Writes BloomSensor to HKCU\Software\Microsoft\Windows\CurrentVersion\Run.

The registered value is:
  "C:\path\to\bloom-sensor.exe" run

If the legacy BloomLauncher key exists, it is removed automatically.
The operation is idempotent — safe to run multiple times.`,
		Annotations: map[string]string{
			"category": "LIFECYCLE",
			"json_response": `{
  "success": true,
  "registry_key": "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\BloomSensor",
  "value": "C:\\Bloom\\bloom-sensor.exe run"
}`,
		},
		Example: `bloom-sensor enable
bloom-sensor --json enable`,
		RunE: func(cmd *cobra.Command, args []string) error {
			exePath, err := os.Executable()
			if err != nil {
				return fmt.Errorf("could not determine executable path: %w", err)
			}
			dir := exePath[:len(exePath)-len("bloom-sensor.exe")]
			if err := Enable(dir); err != nil {
				return err
			}
			c.Logger.Info("autostart enabled: %s", dir)
			result := map[string]interface{}{
				"success":      true,
				"registry_key": `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\BloomSensor`,
				"value":        exePath + " run",
			}
			return cmdregistry.PrintJSON(result)
		},
	}
}

func newDisableCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "disable",
		Short: "Remove bloom-sensor from automatic startup (HKCU\\Run)",
		Long: `Deletes the BloomSensor key from HKCU\Software\Microsoft\Windows\CurrentVersion\Run.

Does NOT kill the running process. The current session continues until
the process exits normally or is stopped externally.
The operation is idempotent — safe to run even if the key does not exist.`,
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