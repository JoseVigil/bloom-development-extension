package ui

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sentinel/internal/core"
	"time"

	"github.com/gdamore/tcell/v2"
	"github.com/rivo/tview"
	"github.com/spf13/cobra"
)

func init() {
	core.RegisterCommand("UI", func(c *core.Core) *cobra.Command {
		var healthMode bool
		cmd := &cobra.Command{
			Use:   "cockpit",
			Short: "Lanza la interfaz de monitoreo integrada",
			Run: func(cmd *cobra.Command, args []string) {
				mode := "log"
				if healthMode { mode = "health" }
				Launch(c, mode)
			},
		}
		cmd.Flags().BoolVar(&healthMode, "health", false, "Iniciar directamente en modo health")
		return cmd
	})
}

func Launch(c *core.Core, mode string) {
	telPath := filepath.Join(c.Paths.LogsDir, "telemetry.json")
	
	// Limpieza de telemetría (Refresher)
	CleanTelemetry(telPath)

	app := tview.NewApplication()
	pages := tview.NewPages()
	logs := NewLogStation()
	health := NewHealthStation()
	cmd := tview.NewInputField().SetLabel(": ").SetFieldBackgroundColor(tcell.ColorBlack)

	pages.AddPage("log", logs.Layout, true, mode == "log")
	pages.AddPage("health", health.Layout, true, mode == "health")

	root := tview.NewFlex().SetDirection(tview.FlexRow).
		AddItem(pages, 0, 1, true).
		AddItem(cmd, 1, 1, false)

	// Manejo de comandos en la línea inferior
	cmd.SetDoneFunc(func(key tcell.Key) {
		if key == tcell.KeyEnter {
			text := cmd.GetText()
			switch text {
			case "log": pages.SwitchToPage("log")
			case "health": pages.SwitchToPage("health")
			case "q", "exit": app.Stop()
			}
			cmd.SetText("")
			app.SetFocus(pages)
		}
	})

	// Loop independiente para Logs
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

	// Loop independiente para Health
	go func() {
		for {
			app.QueueUpdateDraw(func() { health.Refresh(c) })
			time.Sleep(5 * time.Second)
		}
	}()

	if err := app.SetRoot(root, true).EnableMouse(true).Run(); err != nil {
		panic(err)
	}
}