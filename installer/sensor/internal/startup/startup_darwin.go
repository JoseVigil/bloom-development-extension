//go:build darwin

package startup

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"text/template"

	"bloom-sensor/internal/cmdregistry"
	"bloom-sensor/internal/core"
	"github.com/spf13/cobra"
)

// plistLabel es el identificador único del LaunchAgent.
// Equivale a la clave de HKCU\Software\Microsoft\Windows\CurrentVersion\Run en Windows.
const plistLabel = "com.bloom.sensor"

// plistPath devuelve la ruta canónica del plist del LaunchAgent.
// ~/Library/LaunchAgents/ es el directorio estándar para servicios de usuario en macOS.
func plistPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", plistLabel+".plist")
}

// plistTemplate es el XML del LaunchAgent.
//
// Notas de diseño:
//   - RunAtLoad: true → el servicio arranca inmediatamente al cargar el plist
//     (equivale a "inicio con Windows" del Registry)
//   - KeepAlive.SuccessfulExit: false → launchd reinicia el proceso si crashea,
//     pero no si termina limpiamente (ej: bloom-sensor stop)
//   - ThrottleInterval: 10 → evita restart-loops en caso de crash temprano
//   - StandardOutPath / StandardErrorPath → logs persistentes en ~/Library/Logs/
const plistTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{{.Label}}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{{.ExePath}}</string>
        <string>run</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>{{.LogPath}}</string>
    <key>StandardErrorPath</key>
    <string>{{.LogPath}}</string>
</dict>
</plist>`

type plistData struct {
	Label   string
	ExePath string
	LogPath string
}

// Enable instala el LaunchAgent para bloom-sensor y lo carga en launchd.
//
// installPath es el directorio donde está el binario bloom-sensor
// (equivale al path del ejecutable que se escribe en el Registry en Windows).
//
// Flujo:
//  1. Preparar paths de log y LaunchAgents
//  2. Generar el plist desde template
//  3. Escribir el plist en ~/Library/LaunchAgents/
//  4. Cargar con `launchctl load` (efecto inmediato en sesión actual)
func Enable(installPath string) error {
	exePath := filepath.Join(installPath, "bloom-sensor")
	home, _ := os.UserHomeDir()
	logDir := filepath.Join(home, "Library", "Logs", "BloomNucleus")
	logPath := filepath.Join(logDir, "bloom-sensor.log")

	// 1. Crear directorio de logs
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return fmt.Errorf("no se pudo crear directorio de logs: %w", err)
	}

	// 2. Crear ~/Library/LaunchAgents/ si no existe (raro pero posible en VMs)
	launchAgentsDir := filepath.Dir(plistPath())
	if err := os.MkdirAll(launchAgentsDir, 0755); err != nil {
		return fmt.Errorf("no se pudo crear directorio LaunchAgents: %w", err)
	}

	// 3. Si ya hay un plist previo, descargarlo antes de sobreescribir
	if _, err := os.Stat(plistPath()); err == nil {
		_ = exec.Command("launchctl", "unload", plistPath()).Run()
	}

	// 4. Renderizar template
	tmpl, err := template.New("plist").Parse(plistTemplate)
	if err != nil {
		return fmt.Errorf("error parseando template plist: %w", err)
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, plistData{
		Label:   plistLabel,
		ExePath: exePath,
		LogPath: logPath,
	}); err != nil {
		return fmt.Errorf("error renderizando plist: %w", err)
	}

	// 5. Escribir plist
	if err := os.WriteFile(plistPath(), buf.Bytes(), 0644); err != nil {
		return fmt.Errorf("no se pudo escribir plist: %w", err)
	}

	// 6. Cargar en launchd — efecto inmediato sin necesidad de reiniciar
	// Si falla (ej: sesión de CI sin windowserver), el plist ya está escrito
	// y cargará en el próximo login de usuario.
	if err := exec.Command("launchctl", "load", plistPath()).Run(); err != nil {
		fmt.Printf("⚠️  launchctl load warning (el plist se cargará en el próximo login): %v\n", err)
	}

	return nil
}

// Disable descarga el LaunchAgent de launchd y elimina el plist.
// Equivale a borrar la clave de HKCU Run en Windows.
func Disable() error {
	p := plistPath()

	// Descargar de launchd (silencioso si no estaba cargado)
	_ = exec.Command("launchctl", "unload", p).Run()

	// Eliminar el plist
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("no se pudo eliminar plist: %w", err)
	}
	return nil
}

// IsEnabled verifica si el LaunchAgent está registrado (plist existe en disco).
// Retorna (true, path) si está habilitado, (false, "") si no.
//
// Nota: la presencia del plist indica que está configurado para autostart,
// independientemente de si launchd lo tiene cargado en este momento.
func IsEnabled() (bool, string) {
	p := plistPath()
	if _, err := os.Stat(p); os.IsNotExist(err) {
		return false, ""
	}
	return true, p
}

// RegisterCommands registra los subcomandos startup en el CLI de bloom-sensor.
// El contrato es idéntico al de startup_windows.go — solo cambia la implementación
// de Enable/Disable/IsEnabled arriba.
func RegisterCommands(c *core.Core) {
	cmdregistry.Register(func() *cobra.Command { return newStatusCommand(c) })
	cmdregistry.Register(func() *cobra.Command { return newEnableCommand(c) })
	cmdregistry.Register(func() *cobra.Command { return newDisableCommand(c) })
}

func newStatusCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "startup-status",
		Short: "Muestra si bloom-sensor está configurado para iniciar automáticamente",
		RunE: func(cmd *cobra.Command, args []string) error {
			enabled, location := IsEnabled()
			if enabled {
				fmt.Printf("✅ autostart habilitado\n   LaunchAgent: %s\n", location)
			} else {
				fmt.Println("❌ autostart deshabilitado")
			}
			return nil
		},
	}
}

func newEnableCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "startup-enable",
		Short: "Registra bloom-sensor como LaunchAgent (autostart en login)",
		RunE: func(cmd *cobra.Command, args []string) error {
			exe, err := os.Executable()
			if err != nil {
				return err
			}
			installPath := filepath.Dir(exe)
			if err := Enable(installPath); err != nil {
				return fmt.Errorf("error habilitando autostart: %w", err)
			}
			fmt.Printf("✅ autostart habilitado\n   LaunchAgent: %s\n", plistPath())
			return nil
		},
	}
}

func newDisableCommand(c *core.Core) *cobra.Command {
	return &cobra.Command{
		Use:   "startup-disable",
		Short: "Elimina el LaunchAgent de bloom-sensor",
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := Disable(); err != nil {
				return fmt.Errorf("error deshabilitando autostart: %w", err)
			}
			fmt.Println("✅ autostart deshabilitado")
			return nil
		},
	}
}
