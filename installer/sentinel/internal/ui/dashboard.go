package ui

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sentinel/internal/core"
	"time"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
	"github.com/spf13/cobra"
)

func init() {
	// --- COMANDO 1: COCKPIT (La TUI) ---
	core.RegisterCommand("UI", func(c *core.Core) *cobra.Command {
		var healthMode bool
		cmd := &cobra.Command{
			Use:   "cockpit",
			Short: "Lanza la interfaz de monitoreo integrada (TUI)",
			Example: `  sentinel cockpit
  sentinel cockpit --health`,
			Run: func(cmd *cobra.Command, args []string) {
				mode := "log"
				if healthMode {
					mode = "health"
				}
				Launch(c, mode)
			},
		}
		cmd.Flags().BoolVar(&healthMode, "health", false, "Iniciar directamente en modo health")

		if cmd.Annotations == nil {
			cmd.Annotations = make(map[string]string)
		}
		cmd.Annotations["requires"] = `  - Archivo telemetry.json en logs/ (se crea automáticamente si no existe)
  - Terminal con soporte para TUI (tview/tcell)
  - Comandos disponibles en TUI: 'log', 'health', 'q' o 'exit'`

		return cmd
	})

	// --- COMANDO 2: TELEMETRY STATUS ---
	core.RegisterCommand("UI", func(c *core.Core) *cobra.Command {
		telCmd := &cobra.Command{
			Use:   "telemetry",
			Short: "Diagnóstico de streams de telemetría",
			Example: `  sentinel telemetry status`,
		}

		// Subcomando: STATUS
		statusCmd := &cobra.Command{
			Use:   "status",
			Short: "Muestra el estado actual del JSON de telemetría",
			Example: `  sentinel telemetry status`,
			Run: func(cmd *cobra.Command, args []string) {
				// FIX: usar TelemetryDir, no LogsDir
				// LogsDir  = logs/sentinel/
				// TelemetryDir = logs/  ← aquí vive telemetry.json
				telPath := filepath.Join(c.Paths.TelemetryDir, "telemetry.json")
				data, err := os.ReadFile(telPath)
				if err != nil {
					fmt.Printf("Error: No se pudo leer el archivo de telemetría: %v\n", err)
					return
				}
				var tel core.TelemetryData
				json.Unmarshal(data, &tel)
				fmt.Printf("Streams Activos: %d\n", len(tel.Streams))
				for id, info := range tel.Streams {
					status := "[OFFLINE]"
					if info.Active {
						status = "[ACTIVE]"
					}
					fmt.Printf(" - %-30s %s (%s)\n", id, info.Label, status)
				}
			},
		}

		if statusCmd.Annotations == nil {
			statusCmd.Annotations = make(map[string]string)
		}
		statusCmd.Annotations["requires"] = `  - telemetry.json existente en logs/`

		telCmd.AddCommand(statusCmd)

		return telCmd
	})
}

func Launch(c *core.Core, mode string) {
	// FIX: usar TelemetryDir, no LogsDir
	// LogsDir  = logs/sentinel/
	// TelemetryDir = logs/  ← aquí vive telemetry.json
	telPath := filepath.Join(c.Paths.TelemetryDir, "telemetry.json")

	app := tview.NewApplication()
	pages := tview.NewPages()
	logs := NewLogStation()
	cmd := tview.NewInputField().SetLabel(": ").SetFieldBackgroundColor(tcell.ColorBlack)

	pages.AddPage("log", logs.Layout, true, mode == "log")

	root := tview.NewFlex().SetDirection(tview.FlexRow).
		AddItem(pages, 0, 1, true).
		AddItem(cmd, 1, 1, false)

	cmd.SetDoneFunc(func(key tcell.Key) {
		if key == tcell.KeyEnter {
			text := cmd.GetText()
			switch text {
			case "log":
				pages.SwitchToPage("log")
			case "q", "exit":
				app.Stop()
			}
			cmd.SetText("")
			app.SetFocus(pages)
		}
	})

	go func() {
		for {
			data, err := os.ReadFile(telPath)
			if err == nil {
				var tel core.TelemetryData
				if err := json.Unmarshal(data, &tel); err == nil {
					app.QueueUpdateDraw(func() { logs.Update(tel, app) })
				}
			}
			time.Sleep(2 * time.Second)
		}
	}()

	if err := app.SetRoot(root, true).EnableMouse(true).Run(); err != nil {
		panic(err)
	}
}