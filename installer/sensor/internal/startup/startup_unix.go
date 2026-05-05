// internal/startup/startup_unix.go

//go:build !windows

package startup

import (
	"fmt"

	"bloom-sensor/internal/cmdregistry"
	"bloom-sensor/internal/core"
	"github.com/spf13/cobra"
)

func Enable(installPath string) error {
	return fmt.Errorf("autostart via registry no está soportado en esta plataforma")
}

func Disable() error {
	return fmt.Errorf("autostart via registry no está soportado en esta plataforma")
}

func IsEnabled() (bool, string) { return false, "" }

// RegisterCommands registra los comandos de startup en el registry global.
// En plataformas no-Windows los comandos existen en el CLI pero informan
// que la funcionalidad no está disponible.
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
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			return fmt.Errorf("status: no implementado en esta plataforma")
		},
	}
}

func newEnableCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "enable",
		Short: "Register bloom-sensor for automatic startup (Windows only)",
		Annotations: map[string]string{
			"category": "LIFECYCLE",
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			return fmt.Errorf("enable: autostart via registry solo está disponible en Windows")
		},
	}
}

func newDisableCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "disable",
		Short: "Remove bloom-sensor from automatic startup (Windows only)",
		Annotations: map[string]string{
			"category": "LIFECYCLE",
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			return fmt.Errorf("disable: autostart via registry solo está disponible en Windows")
		},
	}
}
